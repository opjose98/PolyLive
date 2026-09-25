# Reporte de Auditoría Técnica — LevON v0.8.0-alpha
**Fecha base:** 2026-05-03 (auditado en 0.7.2) | **Actualizado:** 2026-05-04 (delta 0.8.0)  
**Auditor:** Revisor técnico estricto  
**Rol asumido:** Senior BIM Software Engineer + Flutter Architect

← [[INDEX]]  |  Ver también: [[snapshot_0.8.0]] | [[snapshot_0.7.2]]

---

## CALIFICACIÓN GENERAL (0.8.0-alpha)

| Dimensión | Nota | Δ | Comentario |
|-----------|------|---|------------|
| Clean Architecture | **7.5/10** | ↑ | MEM sigue Clean Arch estrictamente: dominio puro, use cases stateless, UI aislada |
| Calidad de código | **7/10** | = | Código legible, bien comentado, pero duplicaciones y smells moderados |
| Motor geométrico | **7.5/10** | = | Algoritmos correctos, pero frágiles en edge cases y sin caché |
| Estándares BIM | **5/10** | ↑ | MEM añade openings semánticos (door/window/opening) con prep IFC; GUIDs siguen sin fix |
| Compatibilidad Revit | **3.5/10** | ↑ | OpeningType 1:1 con IFC entities preparado; columnas, IfcSpace y GUIDs estables pendientes |
| Rendimiento | **5/10** | = | O(n²) sin throttle en validación y room detection, God Widget no fragmentado |
| Cobertura de tests | **5/10** | ↑ | 112 tests (+36 nuevos MEM), ~35% estimado; TopologyGraph e IFC sin cobertura |
| Preparación para despliegue | **3/10** | = | Bloqueantes críticos C-01 a C-08 siguen abiertos |

### Veredicto
> **Software alpha funcional con arquitectura sólida y sistema MEM nuevo bien diseñado. La deuda técnica en rendimiento (God Widget, O(n²)), estándares BIM (GUIDs no estables, IFC incompleto) y despliegue (sin schema versioning formal) sigue siendo significativa. No apto para despliegue en obra.**

---

## PARTE 1: PROBLEMAS CRÍTICOS (bloqueantes para cualquier uso profesional)

### C-01: God Widget `editor_screen.dart` (1735 líneas)
**Archivo:** [editor_screen.dart](lib/ui/screens/editor_screen.dart)  
**Impacto:** Mantenibilidad, testabilidad, rendimiento

`EditorScreen` gestiona simultáneamente: transformación de coordenadas, gestos multitouch, 4 modos de editor, keyboard shortcuts, export, dialogs de confirmación, toolbar, magnifier, AppBar, layout desktop/mobile, gestión de espacios. Esto es un God Widget clásico.

**Refactor recomendado:**
```
EditorScreen (orquestador liviano)
├── EditorCanvasWidget (gestos + transformación)
├── EditorToolbarWidget (modos, herramientas)
├── EditorAppBarWidget (save, export, undo/redo)
├── EditorMagnifierWidget (lupa)
└── EditorKeyboardHandler (shortcuts desktop)
```

---

### C-02: Room Engine se recalcula a 60fps durante drag
**Archivos:** [providers.dart:146-156](lib/ui/state/providers.dart), [topology_graph.dart](lib/geometry/topology/topology_graph.dart)

`roomsProvider` es un `Provider<List<Room>>` que observa `wallsProvider`. Cada vez que `wallsProvider` cambia (durante drag de handle a 60fps), `DetectRoomsUseCase.execute()` reconstruye el grafo topológico completo en O(n²) y lo repinta.

**Solución:**
```dart
// Opción A: Throttle con debounce de 100ms
final roomsProvider = Provider<List<Room>>((ref) {
  // usar ref.listen con debounce
});

// Opción B: Computar rooms solo en commitManipulation/commitDrawing, no durante drag
```

---

### C-03: `SolapamientoValidator` O(n²) sin throttle
**Archivo:** [validation_pipeline.dart:80-122](lib/domain/validators/validation_pipeline.dart)

Con 50 muros → 1225 comparaciones de `GeometryEngine.doShapesIntersect` por cada evaluación de `validationProvider`. El provider se recalcula con cada cambio de muro.

**Solución:** `SpatialHash` para indexar muros y reducir a O(n log n), o throttle del provider.

---

### C-04: Sin schema versioning en serialización
**Archivo:** [json_serializer.dart](lib/persistence/json_serializer.dart)

No hay campo `schemaVersion` en `project.json`. Cualquier cambio de estructura en las entidades del dominio romperá silenciosamente la carga de proyectos guardados.

**⚠️ Parcialmente mitigado en 0.8.0:** La sección `elevations[]` fue añadida con tolerancia a ausencia (proyectos sin `elevations[]` cargan con lista vacía). Esto protege la retrocompatibilidad para el caso específico del MEM, pero no resuelve el problema sistémico de versioning formal.

**Solución completa pendiente:**
```dart
// Agregar en serializeProject:
'schemaVersion': '2.0',

// En deserializeProject:
final version = json['schemaVersion'] ?? '1.0';
return switch(version) {
  '1.0' => _migrateV1toV2(json),
  '2.0' => _deserializeV2(json),
  _ => throw FormatException('Unknown schema version: $version'),
};
```

---

### C-05: GUIDs IFC no estables → trazabilidad BIM imposible
**Archivo:** [ifc_exporter.dart:256-271](lib/export/ifc_exporter.dart)

Cada exportación genera GUIDs nuevos para todos los elementos. Revit y IFC viewers usan el GUID para identificar elementos entre versiones del modelo (change detection, merge, BCF issues). Sin GUIDs estables, cada importación crea objetos duplicados.

**Solución:** Derivar el GUID IFC del ID UUID del elemento LevON. El ID del Wall es estable entre sesiones → el GUID IFC debe ser una transformación determinista del Wall.id.

---

### C-06: Pérdida de datos al cerrar sin flush
**Archivo:** [editor_screen.dart:114-117](lib/ui/screens/editor_screen.dart)

`EditorScreen.dispose()` no llama `autosaveService.flush()`. Si el usuario trabaja menos de 30 segundos y cierra la app, los cambios no guardados se pierden.

**Fix:**
```dart
@override
void dispose() {
  ref.read(autosaveServiceProvider).flush(
    ref.read(currentProjectSnapshotProvider)!,
    ref.read(projectRepositoryProvider),
  );
  _focusNode.dispose();
  super.dispose();
}
```

---

### C-07: IFC incompleto — columnas, puertas, ventanas, espacios ausentes
**Archivo:** [ifc_exporter.dart](lib/export/ifc_exporter.dart)

La exportación IFC solo incluye `IfcWall` y `IfcWallStandardCase`. Para un modelo Revit-ready se necesitan:
- `IfcColumn` para columnas arquitectónicas
- `IfcDoor` + `IfcOpeningElement` para puertas
- `IfcWindow` + `IfcOpeningElement` para ventanas
- `IfcSpace` para habitaciones detectadas (fundamental para análisis de programa)

---

### C-08: Inconsistencia de tolerancias snap visual vs geométrico
**Archivos:** [editor_controller.dart:41-43](lib/ui/editor/editor_controller.dart), [project_settings.dart](lib/ui/state/project_settings.dart)

Snap visual: `24px / scale` → variable con el zoom.  
Snap geométrico (TopologyGraph): `geometricSnapTolerance = 0.005m` → fijo.

A zoom bajo (scale=20), el snap visual es `24/20 = 1.2m` pero el grafo solo fusiona nodos a 5mm. El usuario ve el snap activado visualmente pero el Room Engine no detecta el cierre del polígono.

---

## PARTE 2: PROBLEMAS MODERADOS (afectan calidad)

### M-01: `snapToLines` y `snapToIntersections` no implementados
Los toggles existen en `SnapSettings` y en la UI de ajustes, pero no tienen ningún efecto en `EditorController.snap()`. Funcionalidad prometida pero vacía.

### M-02: Sistema de espacios (plantas) es UI-only sin datos
`espaciosProvider` solo guarda nombres de strings. No hay separación de datos BIM por planta. Todos los muros pertenecen a un único espacio. El selector de espacios es decorativo.

### M-03: `Room.boundary` deprecated sin migración
La propiedad `@Deprecated` lleva en el código desde antes de 0.5.0 sin fecha de eliminación. El código que la usa (marcado con `// ignore: deprecated_member_use`) sigue activo. Se acumula deuda.

### M-04: `DxfExporter` singleton con estado mutable concurrente
`DxfExporter._handleCounter` es campo de instancia. Si `dxfExporterProvider` es singleton (lo es) y dos exports corren en paralelo, los handles se corrompen. Aunque hoy es improbable, el diseño es incorrecto.

**Fix:** Mover `_handleCounter` a variable local de `_buildDxf()`.

### M-05: Layers DXF no son AIA-compliant
`S-WALL-FULL`, `S-WALL-PRTN`, `S-COLS` no siguen AIA-NCS. Revit Import de DXF asigna las capas automáticamente según nomenclatura AIA. Sin nomenclatura correcta, el usuario debe mapear manualmente cada capa al importar en Revit.

**Corrección:**
```
A-WALL      → muros estructurales
A-WALL-PRTN → particiones  
A-COLS      → columnas
A-AREA      → boundary de habitaciones
```

### M-06: `PolygonShape` no soportada en detección de rooms
Muros de tipo `PolygonShape` son silenciosamente ignorados por `TopologyGraph` (solo divide aristas `GeometryType.line`). Si el usuario alguna vez crea un muro `PolygonShape`, no participará en ningún ciclo de habitación sin advertencia.

### M-07: Historial no se limpia al cargar proyecto
`_loadProject()` en EditorScreen no llama `historyProvider.notifier.clear()`. El historial de undo del proyecto anterior persiste al abrir uno nuevo.

### M-08: Round-trip JSON innecesario en `loadProject`
`readProjectJson()` → Map → `jsonEncode(map)` → String → `deserializeProject(String)`. El deserializador debería aceptar `Map` directamente para eliminar una serialización/deserialización redundante.

---

## PARTE 3: REFACTORIZACIONES RECOMENDADAS

### R-01: Extraer constantes de conversión a `unit_constants.dart`
`UnitConverter` y `PrecisionService._toDisplayUnit` tienen los mismos factores duplicados. Crear `lib/utils/unit_constants.dart` con las constantes y hacer que ambos las importen.

### R-02: Consolidar `_distanceToSegment`
Existe en: `TopologyGraph._distanceToSegment`, `SelectionService._distanceToSegment` (que delega a `PolygonUtils.distanceToSegment`), implícitamente en varios lugares. Una sola implementación en `GeometryEngine` o `PolygonUtils`.

### R-03: `ValidationPipeline` como singleton
```dart
const ValidationPipeline(); // si las reglas son const
// o
final _pipeline = ValidationPipeline(); // una vez fuera del provider
```

### R-04: `selectedObjectProvider` tipado como sealed class
```dart
sealed class SelectedObject {}
class WallSelected extends SelectedObject { final Wall wall; }
class ColumnSelected extends SelectedObject { final ArchitecturalColumn col; }
class RoomSelected extends SelectedObject { final Room room; }

final selectedObjectProvider = StateProvider<SelectedObject?>((ref) => null);
```
Elimina el `is Wall`, `is Room`, `is ArchitecturalColumn` pattern matching riesgoso.

### R-05: `Project` como única fuente de verdad
El estado actual tiene datos BIM fragmentados entre `projectProvider` (metadata) y `wallsProvider`, `columnsProvider`, etc. El ensamblado en `currentProjectSnapshotProvider` es un parche. Considerar un único `projectProvider = StateNotifier<Project?>` con methods como `addWall`, `removeWall` que retornen nuevas instancias inmutables.

### R-06: Mover `UnitSystem` y `LengthPrecision` a `lib/domain/entities/` o `lib/utils/`
Actualmente están en `project_settings.dart` (UI state) pero son tipos de dominio puro. Rompe el grafo de imports correcto.

---

## PARTE 4: ESTÁNDARES BIM — CALIFICACIÓN DETALLADA

### IFC (Industry Foundation Classes) — 3/10
| Aspecto | Estado |
|---------|--------|
| Jerarquía espacial correcta | ✅ |
| Placement de muros correcto | ✅ (corregido en 0.6.1) |
| GUIDs estables | ❌ |
| IfcSpace (habitaciones) | ❌ |
| IfcDoor / IfcWindow | ❌ |
| IfcColumn | ❌ |
| Propiedades de material (IfcMaterial) | ❌ |
| IfcPropertySet BIM personalizado | ❌ |
| IFC4 schema validation | ⚠️ No verificado con validador oficial |
| mvdXML / View Definition | ❌ |

### DXF — 7/10
| Aspecto | Estado |
|---------|--------|
| AC1015 válido (AutoCAD 2000) | ✅ |
| Handles únicos | ✅ |
| Subclass markers obligatorios | ✅ |
| Owner handles | ✅ |
| Layers definidos | ✅ |
| Nomenclatura AIA-NCS | ❌ |
| Dimensionado DXF | ❌ |
| Xrefs / bloques reutilizables | ❌ |
| Textos/anotaciones | ❌ |
| Compatibilidad Revit Import | ⚠️ Funcional pero sin mapeo automático de layers |

### Nomenclatura de elementos BIM — 2/10
No existe un sistema de IDs semánticos BIM. Los IDs son UUIDs opacos. Para integración profesional se necesita:
- `WALL-L1-001`, `ROOM-L1-001`, `COL-L1-001`
- Persistencia estable del ID entre sesiones de edición
- Compatibilidad con códigos IFC (IfcLabel, IfcIdentifier)

---

## PARTE 5: OPTIMIZACIÓN PARA REVIT

### Estado actual de compatibilidad Revit

Para importar en Revit vía IFC, LevON debe generar:

| Requerimiento Revit | Estado LevON |
|---------------------|--------------|
| IFC4 válido | ⚠️ Parcial |
| IfcWall con perfil rectangular | ✅ |
| IfcWallStandardCase para estructurales | ✅ |
| IfcColumn | ❌ |
| IfcSlab (losas) | ❌ |
| IfcSpace (habitaciones para Schedule) | ❌ |
| IfcDoor / IfcWindow | ❌ |
| IfcMaterial + MaterialLayer | ❌ |
| IfcPropertySet PSET_WallCommon | ❌ |
| GUIDs estables | ❌ |
| CoordinationView 2.0 MVD | ❌ |

### Para DXF → Revit (Link DWG)
El DXF generado es importable en Revit via "Link CAD". Sin embargo:
- Las layers deben mapearse manualmente (no son AIA)
- No hay información de altura (Z=0 para todos los elementos)
- Las LWPOLYLINE de muros se importan como curvas de modelo 2D, no como IfcWall

**Prioridad máxima para Revit-ready:**
1. GUIDs IFC estables
2. IfcSpace para habitaciones
3. IfcColumn para columnas
4. IfcMaterial básico
5. Layers AIA en DXF

---

## PARTE 6: PRUEBAS RECOMENDADAS

### Tests unitarios faltantes (alta prioridad)
```
test/geometry/topology_graph_test.dart
  - T-junction: 3 muros en T → 1 habitación detectada
  - X-junction: 4 muros en + → 4 habitaciones
  - Muro duplicado: mismo inicio/fin → no crash
  - 100 muros aleatorios → no crash (stress test)
  - Nodos casi coincidentes (dentro/fuera de snapTolerance)
  - Ciclo sin cerrar → 0 habitaciones
  
test/geometry/room_generator_test.dart
  - Polígono convexo → room válida con área correcta
  - Polígono cóncavo → room válida
  - Polígono con < 3 vértices → descartado
  - Polígono con área ≈ 0 → descartado

test/export/ifc_exporter_test.dart  
  - Archivo generado contiene ISO-10303-21 header
  - Jerarquía Project → Site → Building → Storey
  - Wall con placement correcto (no origen)
  - Wall structural → IfcWallStandardCase
  - Wall non-structural → IfcWall
  - Muro degenerado → no incluido
  - Proyecto sin muros → archivo válido

test/persistence/json_serializer_test.dart
  - Round-trip Project → JSON → Project (igualdad de campos)
  - Wall con ArcShape → serializa/deserializa
  - Wall con PolygonShape → serializa/deserializa
  - Project vacío → serializa correctamente

test/persistence/project_repository_test.dart
  - saveProject → loadProject retorna el mismo proyecto
  - loadProject de ID inexistente → ProjectNotFoundException
  - autosaveProject con error de I/O → no lanza excepción
  - listProjects con archivo corrupto → omite el corrupto

test/application/editor_controller_test.dart
  - commitDrawing(wall) → wallsProvider actualizado
  - commitDrawing con longitud < 0.1m → no crea muro
  - undo → restaura estado anterior
  - redo después de undo → restaura estado siguiente
```

### Tests de integración (media prioridad)
```
- Export DXF → importar en DraftSight: verificar que abre sin error
- Export IFC → importar en BIMvision/IfcOpenShell: verificar jerarquía
- Guardar proyecto → cerrar app → abrir → mismo modelo
- 50 muros + 30 rooms → rendimiento del Room Engine < 100ms
```

### Tests de dispositivo (baja prioridad, antes de deploy)
```
- Android 13/14/15: permisos de storage funcionan
- Tablet 12" táctil: pinch zoom sin jitter
- Pantalla 4K: labels legibles, coordenadas correctas
- Dispositivo gama baja (Snapdragon 665): 30+ muros fluido
```

---

## PARTE 7: FEATURES RECOMENDADOS

### Alta prioridad (antes de beta)
1. **Sistema de IDs BIM semánticos:** `WALL-L1-001` visible en propiedades y exportación
2. **IfcSpace en exportación IFC:** Las habitaciones detectadas → IfcSpace con nombre y área
3. **Layers AIA en DXF:** Renombrar según estándar AIA-NCS
4. **GUIDs IFC estables:** Derivados del UUID del elemento
5. **Schema versioning + migración:** `schemaVersion: "2.0"` en project.json
6. **Multi-espacio con datos separados:** Muros/columnas por planta, no solo por nombre

### Media prioridad (beta a v1.0)
7. **Medidas angulares en canvas:** Mostrar el ángulo entre muros al seleccionar
8. **Snap a línea (extensión de muro):** Completar `snapToLines`
9. **Split muro:** Dividir un muro existente en un punto
10. **Offset muro:** Crear muro paralelo a distancia configurable
11. **IfcColumn en IFC:** Exportar columnas arquitectónicas
12. **Búsqueda global de elementos:** Por serial, tipo, planta
13. **PDF export básico:** Plano en A4/A3 con título, escala y norte
14. **Zoom fit automático:** Al cargar un proyecto, hacer zoom-to-fit del modelo

### Largo plazo (v1.0+)
15. **Multi-planta con sección vertical:** Ver todas las plantas apiladas con control Z
16. **IfcDoor / IfcWindow con apertura:** Elementos de cerramiento en muros
17. **Materiales BIM:** Asignar material a muros y columnas con mapeado a IfcMaterial
18. **Panel de validación flotante:** Lista de issues clickeable que navega al elemento
19. **Export DXF con dimensionado:** Cotas automáticas entre muros
20. **Revit Dynamo compatible:** Export que Dynamo pueda leer sin mapeado manual

---

## PARTE 8: CHECKLIST DE DESPLIEGUE

Para considerarse listo para despliegue en producción (Android primario):

### Bloqueantes absolutos
- [ ] C-01: Fragmentar `editor_screen.dart` en componentes < 400 líneas
- [ ] C-02: Throttle/cache del Room Engine durante drag
- [ ] C-03: Throttle de `validationProvider` O(n²)
- [ ] C-04: Schema versioning en `JsonSerializer`
- [ ] C-05: GUIDs IFC estables derivados de Wall.id
- [ ] C-06: `flush()` en `EditorScreen.dispose()`
- [ ] M-07: Limpiar historial al cargar nuevo proyecto
- [ ] Resolver todos los bugs del ROADMAP PARTE 1

### Requeridos para calidad profesional
- [ ] M-01: Implementar `snapToLines` y `snapToIntersections`
- [ ] M-02: Sistema de espacios con datos reales por planta
- [ ] M-05: Layers DXF con nomenclatura AIA
- [ ] Cobertura de tests > 60% (tests críticos listados en Parte 6)
- [ ] CI/CD: pipeline de build + tests automatizados

### QA antes de release
- [ ] Test en Android 13, 14, 15 con permisos de storage
- [ ] Test en tablet 12" Snapdragon con pinch zoom
- [ ] Export DXF validado en AutoCAD 2024 y DraftSight
- [ ] Export IFC validado en BIMvision o Solibri
- [ ] Prueba de pérdida de datos: matar app en 3 escenarios distintos
- [ ] Test de recuperación de proyecto corrupto

---

## RESUMEN EJECUTIVO

LevON tiene una **base arquitectural honestamente buena**: Clean Architecture respetada en dominio y aplicación, entidades inmutables, Riverpod bien usado para state management reactivo, exportación DXF de alta calidad para el nivel alpha. El equipo claramente tiene criterio de arquitectura.

**Los problemas son de escala y madurez**, no de diseño fundamental: el God Widget de 1735 líneas es el síntoma más visible de que la UI creció sin fragmentarse, los estándares BIM están en ~30% de lo necesario para integración real con Revit, y el sistema de persistencia necesita protección contra cambios de schema.

**Estimación realista para producción:** Con dedicación full-time en los 8 bloqueantes críticos: 4-6 semanas para beta privada estable. Para release en Play Store con IFC Revit-compatible: +8 semanas adicionales.

---

## PARTE 9: DELTA v0.8.0-alpha (2026-05-04)

### Nuevos sistemas implementados

**Motor de Elevación de Muros (MEM)** — sistema BIM semántico completo:

| Subsistema | Archivos | Tests |
|------------|---------|-------|
| Entidades de dominio | `lib/domain/entities/wall_elevation.dart` — `WallElevation`, `WallOpening`, `VerticalLevels`, `WallQuantification`, `OpeningType` | 13 tests |
| Servicio CSL | `lib/application/services/wall_csl_service.dart` — transforms, validateOpening, connectedWallIds, snapX/Y | incluido en 23 tests |
| Use Case | `lib/application/use_cases/wall_elevation/edit_wall_elevation_use_case.dart` — CRUD openings, coronación, Chain Mode, sync | 23 tests |
| Persistencia | `lib/persistence/json_serializer.dart` — sección `elevations[]` backwards-compatible | — |
| Estado | `lib/ui/state/providers.dart` — `WallElevationsNotifier`, `wallElevationsProvider`, `activeElevationWallIdProvider` | — |
| Painter | `lib/ui/editor/wall_elevation_painter.dart` — `WallElevationPainter`, `ElevationViewport` | — |
| Panel UI | `lib/ui/widgets/wall_elevation/wall_elevation_panel.dart` — dialog modal WEP | — |
| Arquitectura | `DOCS/architecture/MEM_Wall_Elevation_Engine.md` | — |

### Entidad `Project` extendida
- `Project.wallElevations: List<WallElevation>` añadido (backwards-compatible, default `[]`)
- `copyWith` actualizado

### Tests totales: 112 (+36 nuevos)

### Problemas resueltos parcialmente
- **C-04 (schema versioning):** `elevations[]` añadido con tolerancia a ausencia. Versioning formal completo pendiente.
- **C-07 (IFC openings):** `OpeningType` tiene mapeo semántico 1:1 a `IfcDoor`/`IfcWindow`/`IfcOpeningElement`. Exportación IFC de openings pendiente.

### Problemas nuevos identificados en 0.8.0
- **N-01:** WEP no integrado en `editor_screen.dart` — el double-tap en canvas para abrir el panel de elevación no está cableado. `openWallElevationPanel()` existe pero no tiene punto de entrada en el editor principal.
- **N-02:** `wallElevationsProvider` no se sincroniza al cargar un proyecto — al abrir un `.levon` existente, `_loadProject()` en EditorScreen no pobla `wallElevationsProvider` desde `project.wallElevations`. El estado de elevaciones se pierde hasta la primera edición.
- **N-03:** `propagateChainMode` requiere el mapa de adjacencia (`Map<String, List<String>>`) que no existe en el sistema actual — `connectedWallIds` en `WallCslService` acepta el mapa pero el `TopologyGraph` no lo expone como API pública. La funcionalidad de Chain Mode está implementada pero no puede ejecutarse end-to-end sin este puente.
