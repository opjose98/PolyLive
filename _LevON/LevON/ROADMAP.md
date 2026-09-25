# Roadmap Técnico - LevON

El roadmap técnico de LevON está estructurado en dos grandes bloques para optimizar nuestro flujo de trabajo:
1. **Prioridades Operativas Actuales (Current Focus):** Bloqueadores reales, bugs rápidos y metas a corto plazo para que la app sea utilizable en campo de inmediato.
2. **Roadmap Estratégico (Long Term):** La evolución arquitectónica y estabilización a largo plazo.

---

# PARTE 1: PRIORIDADES OPERATIVAS ACTUALES (Current Focus)

## 🐛 Bugs Pequeños y QA Operacional
*(MANTENER SIEMPRE ARRIBA PARA RÁPIDO RECORDATORIO)*

### UI
- [X] Botón "+ Nuevo Espacio" no funcional. *(corregido 0.7.0)*
- [ ] Menú contextual inconsistente en algunos estados.
- [X] Label de longitud de muro se solapa con handle central — offset perpendicular al muro. *(corregido 0.9.4)*
- [X] Cambiar grosor de muros con "Espesor" (renombrado de "Grosor"). *(corregido 0.7.0)*
- [X] Room labels aparecen bajo muros — render order corregido. *(corregido 0.9.4)*
- [X] Grid desaparece en zoom out extremo — LOD adaptativo implementado. *(corregido 0.9.4)*
- [X] `StateError: Cannot use "ref" after widget was disposed` en space long-press. *(corregido 0.9.4)*

### Ribbon
- [X] En columnas, Base X y Base Y estaban amarradas entre sí al usar drag — ahora independientes. *(corregido 0.7.0)*

### Tools
- [X] Herramienta Seleccionar no abría propiedades con long press en tablets — resuelto (`_isDesktop` corregido a `Platform`). *(corregido 0.7.0)*
- [X] Angular snap activado por defecto — ahora OFF por defecto. *(corregido 0.9.4)*
- [X] Delete mode: eliminación instantánea sin feedback — soft-delete 2-toques implementado. *(corregido 0.9.4)*

### Canvas
- [X] Preview de columnas no se actualizaba al cambiar propiedades en ribbon — `shouldRepaint` corregido. *(corregido 0.7.0)*
- [X] Nodos de muros en color navy — cambiados a rosado para visibilidad táctil. *(corregido 0.9.4)*

### MEM (Wall Elevation Engine) — nuevos en 0.8.0
- [X] WEP cableado: double-tap en muro abre `WallElevationPanel` desde `editor_screen.dart`. *(corregido 0.8.1)*
- [X] `wallElevationsProvider` se carga al abrir proyecto desde disco. *(corregido 0.8.1)*
- [X] Chain Mode end-to-end: `TopologyGraph` expone `adjacentWallIds()` y `wallAdjacencyMap()`. *(resuelto 0.9.0 — N-03)*



---

## 1. Exportación Funcional (PRIORIDAD MÁXIMA)

### Android Permissions
- [X] Implementar solicitud dinámica de permisos Android 13/14/15.
- [X] Verificar compatibilidad Scoped Storage.
- [X] Validar acceso persistente a carpetas seleccionadas por el usuario.

### Exportación DXF / .levon
- [X] Exportación funcional real de DXF.
- [X] Exportación funcional del formato propietario `.levon`.
- [X] Selector de carpeta de exportación.
- [X] Configuración de carpeta por defecto por proyecto.
- [X] Validación de compatibilidad DXF en AutoCAD/DraftSight.
- [X] Validación de apertura `.levon` entre dispositivos.

### Flujo PC ↔ Tablet
- [ ] Validar continuidad de trabajo Android → Windows.
- [ ] Verificar integridad geométrica tras export/import.

---

## 2. Precisión de Input y Canvas

### Touch Precision
- [ ] Corregir offset táctil detectado en tablet Android 15 (12").
- [ ] Revisar transformación `_screenToWorld`.
- [ ] Revisar `devicePixelRatio`.
- [ ] Validar matrices tras zoom/pan acumulativo.

### Zoom & Navigation
- [ ] Corregir zoom focal tras pan.
- [ ] Garantizar zoom centrado en punto multitouch real.
- [ ] Estabilizar interpolación multitáctil.

---

## 3. Room Labels & Rendering

- [ ] Corregir resolución baja de labels.
- [ ] Separar visualmente nombre y área.
- [ ] Evitar overlap entre labels.
- [ ] Escalado dinámico según zoom.
- [ ] Revisar renderizado de texto en Canvas.

---

## 4. Units Engine (CRÍTICO BIM)

- [ ] Corregir actualización global de unidades.
- [ ] Validar persistencia de unidades por proyecto.
- [ ] Implementar conversiones métricas/imperiales reales.
- [ ] Revisar consistencia geométrica bajo cambio de unidades.

---

## 5. BIM Identity System

### Serialización BIM
- [X] Crear sistema global de IDs únicos. *(BimCodeGenerator — 0.9.2)*
- [X] Crear seriales legibles por usuario. *(formato BIM001..BIM999 — 0.9.2)*
- [X] Crear seriales compatibles BIM/IFC. *(prefijo configurable, formato alfanumérico — 0.9.2)*

### Naming Strategy
- [X] Definir estrategia de códigos de proyecto: `BIM001`, `ARC042`, etc. *(BimCodeGenerator — 0.9.2)*
- [X] Códigos de espacios: `SPC001`, `SPC002`, etc. *(BimCodeGenerator.generateSpaceCode — 0.9.2)*
- [ ] Naming de elementos (WALL-L1-0001, ROOM-L1-0001) — planificado para MEM v2.

### Persistencia
- [X] Garantizar persistencia estable de IDs. *(bimCode en metadata.json + project.meta — 0.9.2)*
- [X] Metadata BIM extendida: description, discipline, author. *(Project entity + JsonSerializer — 0.9.2)*

---

## 6. Element Search System

- [X] Buscador de proyectos por nombre y código BIM. *(filteredProjectsProvider + AppBar search — 0.9.2)*
- [ ] Buscador global de elementos BIM dentro del editor (por serial, tipo, espacio).
- [ ] Navegación rápida hacia elemento seleccionado.
- [ ] Selección automática desde búsqueda.

---

## 7. Space Visual Hierarchy & Preview System

- [X] `ProjectsScreen` — diseño lightweight: lista con BIM code badge, nombre, metadata. *(0.9.2)*
- [X] `SpaceListScreen` — diseño visual arquitectónico: grilla de cards con canvas preview. *(0.9.2)*
- [X] `SpacePreviewPainter` — render semántico lightweight: muros, columnas, habitaciones. Auto-fit BBox. *(0.9.2)*
- [X] `SpaceBounds` — bounding-box fit system: calcular bounds, centro geométrico, escala fit. *(0.9.2)*
- [X] Empty space placeholder — grid ligero + icono contextual. *(0.9.2)*
- [X] **Fix preview pipeline** — `SpaceCard` desacoplado de providers del editor. Geometría real desde `Project` cargado. `SpaceData` con campos tipados `walls/rooms/columns`. `SpaceCard` → `StatelessWidget`. *(0.9.3)*
- [ ] Preview cache — no recalcular bounds/scale en cada rebuild cuando la geometría no cambia.
- [ ] Space naming real en pantalla de espacios (multi-storey) — depende de entidad `Space` en dominio (v0.10.0).

---
---

# PARTE 2: ROADMAP ESTRATÉGICO (Arquitectura a Largo Plazo)

## Fase 1: Estabilización Núcleo Geométrico (0.5.x-alpha)

**PRIORIDAD MÁXIMA: Geometry Engine Stabilization**
*   [ ] Edge normalization.
*   [ ] Graph cleanup.
*   [ ] Polygon robustness.
*   [ ] Winding consistency.
*   [ ] Tolerance unification.
*   [ ] Floating point stabilization.
*   [ ] Self-intersection prevention.
*   [ ] Micro-gap handling.

**Geometry Stress Testing**
*   [ ] Automated geometry stress tests.
*   [ ] Malformed polygon tests.
*   [ ] T/X intersection tests.
*   [ ] Random topology tests.
*   [ ] Regression geometry suite.
*   [ ] Benchmark tests for mobile devices.

## Fase 2: Robustez Topológica + Refactor UI (0.6.x-alpha)

**Room Engine Hardening**
*   [ ] Deterministic room generation.
*   [ ] Invalid room rejection.
*   [ ] Polygon degeneracy detection.
*   [ ] Centroid stabilization.
*   [ ] Overlapping room prevention.
*   [ ] Topological face extraction improvements.
*   [ ] Cycle detection robustness.
*   [ ] Room validation pipeline.

**Canvas / Interaction Stabilization & Snap System Refinement**
*   [ ] Zoom focal stabilization.
*   [ ] Gesture interpolation.
*   [ ] Selection precision & handle rendering optimization.
*   [ ] Label overlap prevention & viewport performance optimization.
*   [ ] Repaint optimization.
*   [ ] Configurable snap tolerance & wall snap stabilization.
*   [ ] Angular snap robustness & grid snap optimization.
*   [ ] Precision behavior under high zoom.

**UI Technical Refactor**
*   [ ] Fragmentación de `editor_screen.dart`.
*   [ ] Separación en layers: gesture layer, viewport layer, interaction layer, overlay layer.
*   [ ] Contextual ribbon modularization.
*   [ ] Properties panel modularization.

## Fase 3: Exportación Avanzada + Herramientas BIM (0.7.x-alpha)

**Persistence Hardening**
*   [ ] Autosave recovery & crash-safe persistence.
*   [ ] Corrupted project recovery.
*   [ ] Schema versioning & migration pipeline.

**Exportación & Herramientas**
*   [ ] **DXF Roadmap:** Inyección semántica de metadatos en capas estandarizadas.
*   [ ] **IFC Roadmap:** Esquema IFC completo para exportación Revit-ready.
*   [ ] Herramientas BIM de Edición (Split, Offset).

**Curved Walls Preparation** *(future-ready architecture preparation)*
*   [ ] Research architecture for curved topology.
*   [ ] Arc representation strategy.
*   [ ] Spline/arc snapping preparation.
*   [ ] Hybrid edge system planning.

## Fase 4: Estabilización Productiva (0.8.x-alpha)

*   [X] **Motor de Elevación de Muros (MEM):** Sistema BIM semántico completo — CSL, NMS, HAP, Chain Mode, Quantification Engine, WEP. *(implementado 0.8.0)*
*   [X] **WallElevation persistence:** `elevations[]` en schema JSON v2.0 backwards-compatible + `leftHeight`/`rightHeight`. *(implementado 0.8.0 / extendido 0.9.0)*
*   [X] **Tests MEM:** 36 tests nuevos (dominio, use cases, CSL service). *(implementado 0.8.0)*
*   [X] **WEP integration:** Cablear double-tap en canvas → `openWallElevationPanel`. *(resuelto 0.8.1)*
*   [X] **Load elevations on open:** Poblar `wallElevationsProvider` desde `project.wallElevations`. *(resuelto 0.8.1)*
*   [X] **Chain Mode end-to-end:** `TopologyGraph.adjacentWallIds()` + `wallAdjacencyMap()` + `topologyGraphProvider`. *(resuelto 0.9.0 — N-03)*
*   [X] **MEM-S estabilizado:** Tool system WEP (select/create/delete), drag/resize openings, corner nodes culatas, smart snaps, validación visual, renderizado proporcional, height profile. *(implementado 0.9.0)*
*   [X] **QA Roadmap (parcial):** Semantic widget keys inyectadas en todos los componentes UI. *(0.9.1)*
*   [X] **BIM Identity System:** `Project.bimCode/description/discipline/author`, `BimCodeGenerator`, `BIMProjectDialog`, `ProjectCard`, `ProjectContextMenu`, `filteredProjectsProvider`, `SpaceListScreen`. *(0.9.2)*
*   [X] **QA UX táctil (0.9.4):** 9 bugs resueltos — soft delete 2-toques canvas, nodos rosados, grid LOD adaptativo, room labels sobre geometría, wall label perpendicular, angular snap OFF, snap quick-bar contextual, create space popup, ref-after-dispose fix. *(0.9.4)*
*   [ ] Snap settings persistencia por proyecto (actualmente en memoria por sesión). *(pendiente)*
*   [ ] Soporte Multi-Espacio/Plantas con entidad `Space` real y datos BIM por espacio. *(v0.10.0)*
*   [ ] **PDF Export Roadmap:** Exportación PDF de planos arquitectónicos automáticos.
*   [ ] **CI/CD Roadmap:** Pipelines para despliegue automatizado.

## Fase 5: Release Estable (v1.0.0)

*   [ ] Release estable de producción (Android & Desktop).

## Futuro (> v1.0.0)

*   [ ] Cloud Sync y Colaboración en Tiempo Real.
*   [ ] Modelado 3D interactivo en la app (Visor IFC embebido).
*   [ ] **LIDAR Roadmap:** Importación y procesamiento local de Nubes de Pun