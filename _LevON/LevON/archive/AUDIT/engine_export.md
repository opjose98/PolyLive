# Motor de Exportación
**Archivos:** `lib/export/dxf_exporter.dart`, `lib/export/ifc_exporter.dart`, `lib/export/ifc_export_adapter.dart`, `lib/export/pdf_exporter.dart`

← [[INDEX]]  |  Conectado a: [[engine_persistence]], [[engine_state]], [[engine_geometry]]

---

## Responsabilidad
Generar archivos de intercambio estándar de la industria (DXF, IFC, JSON) desde el modelo BIM interno de LevON para compatibilidad con Revit, AutoCAD y otros software BIM.

---

## `DxfExporter` — DXF R2000 (AC1015)

### Estructura del archivo generado
```
SECTION HEADER   — versión AC1015, unidades, extents
SECTION CLASSES  — vacío (mínimo requerido)
SECTION TABLES   — VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD
SECTION BLOCKS   — *Model_Space, *Paper_Space (ambos vacíos)
SECTION ENTITIES — muros (LWPOLYLINE), columnas (CIRCLE o LWPOLYLINE)
SECTION OBJECTS  — diccionario raíz + ACAD_GROUP
EOF
```

### Sistema de handles
Dos tipos de handles conviven:
- **Handles fijos (well-known):** 17 constantes `static const String` asignadas a posiciones predefinidas que AutoCAD R2000 espera (BLOCK_RECORD=1, LAYER=2, etc.)
- **Handles dinámicos:** Contador `_handleCounter` iniciando en 0x100, incrementado por `_nextHandle`

**Garantía de unicidad:** Los handles dinámicos empiezan en 0x100 (256 dec), los fijos son todos < 0x100, por lo que no hay colisión.

### Representación de muros en DXF
| Tipo de muro | Entidad DXF | Layer |
|---|---|---|
| `LineShape` (recto) | `LWPOLYLINE` cerrada (4 vértices = contorno con espesor real) | `S-WALL-FULL` o `S-WALL-PRTN` |
| `ArcShape` (curvo) | Dos `ARC` (cara interior + exterior) | `S-WALL-FULL` o `S-WALL-PRTN` |
| `PolygonShape` | `LWPOLYLINE` abierta (solo eje central, sin espesor) | según `isStructural` |

### Layers estándar AIA (NCS)
```
0          — capa default DXF
S-WALL-FULL — muros estructurales (color 7, blanco/negro)
S-WALL-PRTN — particiones (color 8, gris medio)
S-COLS      — columnas (color 3, verde)
S-ROOM-BNDY — boundary de habitaciones (color 4, cyan) ← definida pero NO usada aún
```

**Déficit:** Las layers siguen la convención NCS pero están incompletas. Revit espera layers como `A-WALL`, `A-WALL-PRTN`, `A-COLS` (AIA 2nd Edition). La nomenclatura actual (`S-WALL-FULL`) es no estándar.

---

## `IfcExporter` — IFC4 STEP

### Jerarquía espacial generada
```
IfcProject
  └── IfcSite
        └── IfcBuilding
              └── IfcBuildingStorey (Ground Floor)
                    └── IfcWallStandardCase (muros estructurales)
                    └── IfcWall (particiones)
```

### Pipeline por muro
```
1. Calcular dirección normalizada del muro (dirX, dirY)
2. IFCCARTESIANPOINT (startX, startY, 0) — origen del muro
3. IFCDIRECTION (dirX, dirY, 0) — X-axis local
4. IFCAXIS2PLACEMENT3D — con origen + dirección + Z-up
5. IFCLOCALPLACEMENT relativo al storeyPlacement
6. IFCRECTANGLEPROFILEDEF centrado en (length/2, 0)
7. IFCEXTRUDEDAREASOLID extruido en Z por wall.height
8. IFCWALLSTANDARDCASE / IFCWALL
```

### Cobertura actual
| Elemento | Exportado | Notas |
|---|---|---|
| Muros rectos (LineShape) | ✅ | Con dirección y espesor correctos |
| Particiones | ✅ | Como IfcWall (no IfcWallStandardCase) |
| Columnas | ❌ | No implementado |
| Puertas (WallOpening door) | ⚠️ Preparado | `OpeningType.door` mapea semánticamente a `IfcDoor`, no exportado aún |
| Ventanas (WallOpening window) | ⚠️ Preparado | `OpeningType.window` mapea semánticamente a `IfcWindow`, no exportado aún |
| Huecos genéricos | ⚠️ Preparado | `OpeningType.opening` mapea a `IfcOpeningElement`, no exportado aún |
| Muros curvos (ArcShape) | ❌ | Skip silencioso |
| Muros polígono | ❌ | Skip silencioso |
| Habitaciones (IfcSpace) | ❌ | No implementado |
| Metadata BIM (materiales) | ⚠️ Parcial | Solo nombre de material en label |

**Nota 0.8.0 — Preparación MEM→IFC:** El sistema MEM introduce `OpeningType` con mapeo semántico 1:1 a entidades IFC (`IfcDoor`, `IfcWindow`, `IfcOpeningElement`). La exportación de openings desde `WallElevation` a IFC no está implementada en esta versión, pero la arquitectura de datos es compatible y la implementación es directa en una iteración futura.

### GUID IFC
`IfcExporter._guid()` genera un GUID de 22 chars a partir de UUID v4 usando base-64 custom. Es válido por el spec IFC pero **no es reproducible**: cada exportación genera GUIDs distintos para los mismos elementos, rompiendo la trazabilidad BIM entre versiones del mismo modelo.

---

## `IfcExportAdapter` — JSON BIM

Adaptador más simple que exporta el proyecto como JSON estructurado. No es un estándar de la industria — es útil para depuración e intercambio entre instancias de LevON.

---

## `PdfExporter`
Existe el archivo `lib/export/pdf_exporter.dart` pero la funcionalidad está marcada como "próximamente disponible" en el menú de exportación. No está implementada.

---

## Problemas Identificados

### CRÍTICO
- **GUIDs IFC no estables:** Cada exportación genera GUIDs nuevos. Revit y otros BIM tools usan el GUID para sincronizar cambios entre versiones del modelo. Sin GUIDs estables, no hay trazabilidad ni merge posible.
- **Columnas, puertas, ventanas no se exportan en IFC.** Para un despliegue Revit-ready esto es bloqueante.
- **IfcSpace no generado:** Las habitaciones detectadas por el Room Engine no se exportan como `IfcSpace`. Revit necesita `IfcSpace` para análisis de programa y cálculo de áreas.
- **Layers DXF no son AIA-compliant:** `S-WALL-FULL` no es reconocida automáticamente por Revit ni por AutoCAD en workflows estandarizados. Debería ser `A-WALL` (capa AIA Tier 1).

### MODERADO
- **`_handleCounter` como campo de instancia no resetado entre llamadas:** Si se llaman dos veces seguidas a `exportToDxf` en la misma instancia, los handles del segundo archivo empiezan en el valor donde terminó el primero. Se resetea correctamente dentro de `_buildDxf` pero `exportToDxf` ya lo llama ANTES de `_buildDxf` (línea 88-89 vs línea 118). Hay reset doble pero podría ser confuso.
- **`IfcExporter.exportToIfc` escribe directamente a `File` sin pasar por `FileStorageService`.** Inconsistencia arquitectural: DXF usa la capa de storage, IFC usa `File` directo.
- **Sin validación de topología antes de exportar:** Un proyecto con muros superpuestos o geometría degenerada se exporta sin advertencia.

### MENOR
- El GUID IFC usa un alfabeto custom (`0-9A-Za-z_$`) que es válido pero no es el encoding base64 standard de IFC (que usa un alfabeto diferente). Debería verificarse contra la spec IFC 4.3.
- Muros degenerados en DXF se descartan silenciosamente (bien), pero no hay log ni counter de cuántos se descartaron.
