# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.9.4-alpha] - 2026-05-05

### fix — Bugs operativos y refactor UX táctil

#### T1 — Create Space Popup
- `NewSpaceCard` eliminada del grid de espacios.
- `_CreateSpaceFab`: botón flotante "+" / "Crear" con `PopupMenuButton` contextual.
  Opciones: **Nuevo Espacio** (funcional), **Implantación** y **Registro Fotográfico** (placeholder v0.10.0).
- `floatingActionButton` en `_SpaceGridScaffold`; scroll padding inferior 88px para clearance.

#### T2 — Space long-press ref-after-dispose
- `_showNewSpaceSheet`: corregido context capture — usa `sheetCtx` del builder en lugar
  del context del widget padre. Elimina `StateError: Cannot use "ref" after widget was disposed`
  cuando el padre se destruye antes del cierre del sheet.

#### T3 — Snap Quick Bar contextual
- `_SnapQuickBar` (nuevo widget `ConsumerWidget`) — barra de toggles rápidos visible
  en modos draw y select, encima de la toolbar principal.
  Controles: **Grid visible**, **Snap a nodos**, **Snap angular**, **Snap a cuadrícula**.
  Lee/escribe `projectSettingsProvider` directamente; cambios inmediatos sin abrir settings.
- `_SnapToggle`: chip toggle reutilizable con animación `AnimatedContainer`.

#### T4 — Wall length label
- `_drawWalls`: label de longitud desplazado en dirección **perpendicular al muro** (32px pantalla).
  Antes: `offsetY: -30` fijo en Y — fallaba en muros verticales y diagonales.
  Ahora: `Offset(-dir.dy, dir.dx) / wallDist * (32/scale)` — siempre claro del muro.

#### T5 — Angular snap default OFF
- `SnapSettings.angleSnapping` default cambiado de `true` → `false`.
  Reduce comportamiento no esperado en campo al abrir proyectos nuevos.

#### T6 — Room labels sobre geometría
- `_drawRooms` separado en `_drawRoomFills` (relleno + borde) y `_drawRoomLabels`.
- `paint()` order: grid → room fills → walls → columns → **room labels** (last).
  Labels ahora renderizados encima de muros y columnas.
- `_drawRoomLabel` usa `bgOpacity: 0.92`, `bgRadius: 5.0` — fondo blanco más opaco y
  con esquinas más redondeadas.
- `showRooms` setting respetado en ambos métodos de dibujo.

#### T7 — Grid adaptive scaling
- `_drawGrid`: LOD adaptativo reemplaza el corte abrupto `if (gridStep * scale < 4) return`.
  La cuadrícula escala automáticamente `× 10` cuando la celda base cae bajo 6px en pantalla,
  y vuelve a escalar hacia abajo cuando vuelve a estar en rango `< 60px`.
  Grid siempre visible en zoom out extremo; nunca demasiado denso.

#### T8 — Soft delete dos toques (canvas principal)
- Modo eliminar ahora usa flujo dos-toques idéntico al de WallElevationPanel:
  **Primer tap** → elemento queda marcado/seleccionado (rojo); **segundo tap** → elimina.
  Tap en vacío → limpia pendiente.
- `_deletePendingId` field en `_EditorScreenState`; listener en `build()` limpia el
  pendiente al salir del modo eliminar.
- `_confirmDeleteHit` eliminado (era la confirmación via dialog — reemplazada por el flujo 2-tap).

#### T9 — Node color rosado
- `LevonColors.nodeColor = Color(0xFFFF6B9D)` — nueva constante en `levon_tokens.dart`.
- Nodos de muros renderizados en rosado (antes navy) para mejor contraste táctil.
- Radio aumentado de 3.0 → 3.5 en modo annotative.
- Respeta `settings.visual.showNodes`.

---

## [0.9.3-alpha] - 2026-05-05

### fix — Space Preview Pipeline: eliminar dependencia de providers del editor

**Bug crítico resuelto:** `SpaceCard` leía `wallsProvider`/`roomsProvider`/`columnsProvider`
— providers globales del editor — para alimentar el preview del canvas. En la pantalla
de espacios el editor no está abierto, por lo que esos providers contenían datos rancios
o estaban vacíos. El preview nunca mostraba la geometría real del proyecto.

**`lib/ui/widgets/spaces/space_card.dart`:**
- `SpaceData` extendido con campos tipados `walls: List<Wall>`, `rooms: List<Room>`,
  `columns: List<ArchitecturalColumn>` (default `const []`, backward-compatible).
- `SpaceCard` refactorizado de `ConsumerWidget` → `StatelessWidget`: eliminados los tres
  `ref.watch(wallsProvider/roomsProvider/columnsProvider)`. La geometría viene de
  `space.walls/rooms/columns` inyectada desde el `Project` ya cargado.
- `_SpacePreviewArea` tipada correctamente: `List<Wall>`, `List<Room>`,
  `List<ArchitecturalColumn>` en lugar de `List` sin tipo. Eliminados los `as List` casts.
- `_EmptyPreviewPlaceholder` convertido a `const` Widget.
- Eliminados imports: `flutter_riverpod`, `providers.dart`, `project.dart`.
  Añadidos: `wall.dart`, `room.dart`, `column.dart`.

**`lib/ui/screens/project_workspace_screen.dart`:**
- `_SpaceGridScaffold` pasa `project.walls`, `project.rooms`, `project.columns`
  a `SpaceData` — geometría directa del `Project` deserializado desde disco.

### arch
- El preview de espacios ahora es completamente independiente del editor y sus providers.
- `SpaceCard` es un `StatelessWidget` puro: sin Riverpod, sin estado reactivo en la card.
- `SpaceData` actúa como DTO de geometría entre `projectByIdProvider` y `SpacePreviewPainter`.
- Rooms en el preview reflejan las detectadas en la última sesión (persistidas en el JSON).
  La detección en tiempo real sigue ocurriendo al abrir el editor.

## [0.9.2-alpha] - 2026-05-05

### feat — BIM Identity System & Project Management UX

**Identidad BIM en dominio:**
- **domain/entities/project:** `Project` extendido con `bimCode` (String?), `description`, `discipline`, `author` — campos opcionales con defaults backward-compatible. `copyWith` actualizado con todos los nuevos campos.
- **domain/services/bim_code_generator:** `BimCodeGenerator` — servicio puro Dart sin dependencias Flutter. Genera códigos `BIM001..BIM999`, valida formato (`^[A-Z]{2,5}[0-9]{1,6}$`), normaliza input de usuario. Métodos estáticos: `generateProjectCode`, `generateSpaceCode`, `isValidCode`, `normalize`.

**Persistencia — backward-compatible:**
- **persistence/json_serializer:** `_serializeProjectMeta` incluye `bimCode`, `description`, `discipline`, `author` en `project.meta`. `serializeMetadata` los escribe también en `metadata.json` para lectura rápida en listado. `_deserializeV2` lee los campos con fallbacks null-safe para archivos creados antes de 0.9.2.
- **persistence/project_repository:** `ProjectSummary` extendido con `bimCode?`, `description`, `discipline`. `listProjects()` los pobla desde `metadata.json` sin deserializar el modelo completo.

**State — búsqueda en tiempo real:**
- **ui/state/providers:** `projectSearchQueryProvider` — `StateProvider<String>` para la query actual. `filteredProjectsProvider` — `Provider<AsyncValue<List<ProjectSummary>>>` derivado que filtra case-insensitive por `title` y `bimCode`. Sin lógica en UI, sin duplicación.

**Widgets de proyectos (nuevos en `lib/ui/widgets/projects/`):**
- **project_card.dart:** `ProjectCard` público con código BIM visual dominante (tipografía monospace prominente), badge de disciplina en esquina, element count en footer. `NewProjectCard` extraída del screen.
- **bim_project_dialog.dart:** `BIMProjectDialog` — formulario BIM completo (nombre, código BIM + botón auto-generar, descripción, disciplina dropdown, autor). Valida unicidad de código contra `existingCodes`. Modo edición cuando `initialProject != null`. `BIMProjectFormData.toNewProject()` construye la entidad.
- **project_context_menu.dart:** `ProjectContextMenu` reutilizable con `ProjectContextMenu.show(...)`. Header con código BIM, acciones: rename (abre BIMProjectDialog), duplicate (nuevo código auto), export, delete con confirmación.

**Screens refactorizados:**
- **ui/screens/projects_screen:** Reescrito con buscador expandible en AppBar (animado), `ProjectCard`/`BIMProjectDialog`/`ProjectContextMenu`. Rename y duplicate funcionales con persistencia real. Confirmación de delete con `RichText` que muestra el código BIM.
- **ui/screens/project_workspace_screen:** Refactorizado como `SpaceListScreen` + `SpaceCard` + `SpaceData` (público). Terminología Floor→Space en toda la UI. Código BIM del proyecto visible en AppBar. Context menu para espacios. FAB "Nuevo Espacio".

**Router:**
- **main.dart:** Ruta `/projects/:id/workspaces` actualizada a `SpaceListScreen`.

### arch
- `BimCodeGenerator` vive en `domain/services/` — pureza de capa, sin imports Flutter.
- `ProjectSummary` sigue siendo el VO de presentación para el listado; no se deserializa el modelo BIM completo.
- El schema JSON permanece en `v2.0` con campos opcionales nuevos — archivos legacy se abren sin modificación.
- `SpaceData` es un VO de presentación, no una entidad de dominio. La entidad `Space` real es roadmap v0.10.0.

## [0.9.0-alpha] - 2026-05-04

### feat — MEM-S (Motor de Elevación de Muros Semántico)

**N-03 — Chain Mode end-to-end:**
- **topology/graph:** `TopologyGraph` expone `adjacentWallIds(Wall)` y `wallAdjacencyMap()` — API pública de adyacencia para Chain Mode. Considera edge splitting: los fragmentos de un muro dividido mantienen el ID original. Resuelve **N-03**.
- **providers:** `topologyGraphProvider` — `Provider<TopologyGraph?>` derivado de `wallsProvider` con snap tolerance del proyecto. Consumible desde WEP para Chain Mode sin acoplamiento al canvas principal.
- **use-case:** `EditWallElevationUseCase.propagateChainMode` actualizado — parámetro renombrado de `connectedWallIds` a `adjacentWallIds` para claridad semántica.

**Height Profile (Culatas):**
- **domain/levels:** `VerticalLevels` extendido con `leftHeight` y `rightHeight` opcionales. Cuando son null, el muro es rectangular de altura `coronacion`. Cuando se definen, el techo es una línea interpolada linealmente (culata/perfil variable). `effectiveLeftHeight`, `effectiveRightHeight`, `hasHeightProfile`, `heightAt(localX, wallLength)`.
- **domain/quantification:** `WallQuantification.compute` actualizado — grossArea trapecio = `wallLength × (leftH + rightH) / 2` para culatas; openings recortados contra el techo interpolado en su centro X.
- **domain/copyWith:** `VerticalLevels.copyWith` usa sentinel interno para distinguir "no pasado" de "null explícito" — permite limpiar leftHeight/rightHeight sin ambigüedad.

**ElevationViewport — renderizado proporcional:**
- `ElevationViewport` reescrito con `scale = min(scaleX, scaleY)` (uniform scale). El muro se centra en el canvas disponible preservando la proporción real longitud/altura. Añadidos `originX`, `originY`, `toLocalX`, `toLocalY` para conversión inversa canvas→CSL.

**WallElevationPainter:**
- Cuerpo del muro dibujado como `Path` (trapecio para culatas, rectángulo para muros planos).
- Línea de coronación inclinada para culatas (antes siempre horizontal).
- Handles de resize en el opening seleccionado (8 puntos: 4 esquinas + 4 aristas medias).
- Handles de nodo en top-left y top-right del cuerpo del muro (drag para culatas).
- Overlay de validación: borde rojo = error, borde naranja = warning en openings inválidos.
- Dimensiones de altura izquierda/derecha cuando hay perfil variable.

**WallElevationPanel (WEP) — reescritura completa:**
- **Tool system local:** `_ElevationTool` enum — `select`, `createDoor`, `createWindow`, `createOpening`, `delete`. Barra de herramientas visual con iconos y estado activo. Herramientas de crear vuelven a `select` automáticamente tras colocar un opening.
- **Create:** tap en canvas en modo create coloca el opening centrado en el X tocado; dimensiones por defecto semánticas (P: 90×210, V: 120×120 antepecho 90, H: 90×200).
- **Delete soft:** modo delete — primer tap marca opening en rojo (`_deletePendingId`); segundo tap elimina. Tap en vacío limpia.
- **Drag to move:** `onPanStart/Update/End` en modo select — drag sobre cuerpo de opening lo mueve en CSL con snap.
- **Resize handles:** `onPanStart` detecta handle de resize (8 handles con hit radius 10px); `onPanUpdate` aplica redimensionamiento por arista/esquina con clamp a bounds del muro.
- **Corner node drag:** drag en top-left/top-right del muro edita `leftHeight`/`rightHeight` (culata). La coronación se actualiza automáticamente como max de ambos lados.
- **Snap settings bar:** toggleable (icono tune) — snap a NMS (on/off), snap a openings (on/off), paso de precisión (1/5/10/20 cm).
- **Validation overlay:** `Map<String, ValidationSeverity>` computado en build y pasado al painter — openings inválidos muestran borde de color en tiempo real.
- **Chain Mode toggle:** preservado en el header.

**WallCslService — smart snaps:**
- `snapXSmart(localX, step, elevation, wall, {snapToOpenings})` — snap a bordes y centros de openings antes del snap de paso.
- `snapYSmart(localY, step, elevation, wallLength, {snapToNms, snapToOpenings})` — snap a NMS (umbral, dintel, base, coronación, perfil) y a bases/cimas/centros de openings.

**EditWallElevationUseCase — nuevos use cases:**
- `moveOpening(elevation, openingId, newXOffset, newSillHeight, wall)` — mueve un opening con clamp a bounds.
- `resizeOpening(elevation, openingId, x, w, sy, h, wall, {minDim})` — redimensiona con clamp y dimensión mínima configurable.

**JsonSerializer — persistencia de height profile:**
- `_serializeElevations`: incluye `leftHeight`/`rightHeight` en `levels{}` solo cuando no son null (backward-compatible).
- `_deserializeElevations`: lee `leftHeight`/`rightHeight` de `levelsMap` con tolerancia a ausencia (proyectos legacy sin cambios).

## [0.8.1-alpha] - 2026-05-04

### fix
- **mem/wep:** `openWallElevationPanel` cableado vía double-tap en el canvas. En modo `select`, un doble-tap sobre un muro abre el `WallElevationPanel` modal. Se añadieron `onDoubleTapDown` (captura de posición) y `onDoubleTap` (hit-test + apertura) al `GestureDetector` del canvas en `editor_screen.dart`. Resuelve **N-01**.
- **mem/persistence:** `_loadProject()` ahora puebla `wallElevationsProvider` con `project.wallElevations` al abrir un proyecto desde disco. Resuelve **N-02**.
- **persistence/history:** `historyProvider` se limpia (`clear()`) al cargar un nuevo proyecto, evitando que operaciones de undo crucen la sesión previa.
- **persistence/autosave:** `dispose()` de `EditorScreen` ahora llama `autosaveProject` fire-and-forget antes de `super.dispose()`, garantizando que los últimos cambios no se pierdan si el debounce de 30 s no había disparado.
- **export/ifc:** GUIDs IFC de muros ahora son estables entre exportaciones. `_stableGuid(wall.id)` convierte el UUID interno del muro al formato IFC de 22 caracteres de forma determinista. Las demás entidades estructurales (site, building, storey, relaciones) siguen usando `_guid()` aleatorio hasta que dispongan de IDs persistentes. Refactor interno: lógica de codificación extraída a `_encodeGuid(String hex)` compartido por ambos métodos.

## [0.8.0-alpha] - 2026-05-04

### feat
- **mem/domain:** Implementado `WallElevation` como entidad de dominio inmutable (`lib/domain/entities/wall_elevation.dart`). Incluye `VerticalLevels` (base + coronación), `WallOpening` (door/window/opening en coordenadas CSL), `OpeningType` enum y `WallQuantification` (cómputo puro de área bruta/openings/neta).
- **mem/project:** `Project` extendido con `wallElevations: List<WallElevation>` — backwards compatible (proyectos sin `elevations[]` cargan con lista vacía). `copyWith` y constructor actualizados.
- **mem/csl:** `WallCslService` (`lib/application/services/wall_csl_service.dart`) con funciones puras estáticas para: transform world↔CSL, `validateOpening` (5 reglas con `ValidationResult` valid/warning/error), `connectedWallIds` para Chain Mode, y `snapX`/`snapY` con snap a niveles NMS.
- **mem/use-cases:** `EditWallElevationUseCase` (`lib/application/use_cases/wall_elevation/`) — operaciones puras: `getOrCreate`, `addOpening`, `removeOpening`, `updateOpening`, `updateCoronacion`, `setChainMode`, `propagateChainMode`, `syncWithWalls`.
- **mem/persistence:** `JsonSerializer` extendido con sección `elevations[]` en schema v2.0. `_serializeElevations` omite automáticamente orphaned elevations. `_deserializeElevations` es tolerante a `elevations` ausente (proyectos legacy sin cambios).
- **mem/state:** `WallElevationsNotifier` + `wallElevationsProvider` + `activeElevationWallIdProvider` añadidos a `providers.dart`. `currentProjectSnapshotProvider` incluye `wallElevations` en el snapshot persistido.
- **mem/painter:** `WallElevationPainter` (`lib/ui/editor/wall_elevation_painter.dart`) — `CustomPainter` para vista frontal 2D. Dibuja cuerpo del muro, openings con color semántico por tipo (P/V/H), niveles NMS con líneas discontinuas, cotas de longitud y altura. `ElevationViewport` gestiona el mapping CSL→canvas-pixels con padding.
- **mem/wep:** `WallElevationPanel` (`lib/ui/widgets/wall_elevation/wall_elevation_panel.dart`) — dialog modal aislado del canvas principal. Toolbar con `+ Puerta / + Ventana / + Hueco`, toggle Chain Mode, barra de cuantificación (Bruta / Huecos / Neta) en tiempo real. Apertura vía `openWallElevationPanel(context, wall)`.
- **mem/docs:** `docs/architecture/MEM_Wall_Elevation_Engine.md` — source of truth completo del sistema MEM. Documenta CSL, NMS, HAP, CM, QE, WEP, flujo arquitectónico, herencia desde planta, constraints, persistencia, y preparación BIM/IFC.

### test
- **mem/domain:** 13 tests en `test/domain/entities/wall_elevation_test.dart` — cubre WallOpening (copyWith, id único), VerticalLevels, WallQuantification (gross/net/clamp), WallElevation (defaults, inmutabilidad, umbral/dintel).
- **mem/application:** 23 tests en `test/application/wall_elevation/quantification_test.dart` — cubre EditWallElevationUseCase (getOrCreate, CRUD openings, coronacion, chain mode, sync), WallQuantification.compute, WallCslService (transforms, validateOpening con todas las reglas).

### arch
- `WallElevation` y `Door`/`Window` coexisten intencionalmente: Door/Window = relaciones BIM en planta; WallOpening = geometría de elevación frontal 2D. Sincronización futura en MEM v2.
- `WallQuantification` es derivado — no se persiste, siempre se recomputa desde `WallElevation` + `Wall.length`.
- Chain Mode solo propaga `coronación` — nunca openings, material ni otros atributos.
- Exportación IFC con openings preparada semánticamente (`OpeningType` mapea 1:1 a `IfcDoor`/`IfcWindow`/`IfcOpeningElement`) pero no implementada en esta versión.

## [0.7.2-alpha] - 2026-05-01

### feat
- **precision/engine:** Implementado `PrecisionService` centralizado (`lib/utils/precision_service.dart`). Define `LengthPrecision` (4 niveles: 1m / 10cm / 1cm / 1mm) y expone `stepMeters`, `decimalsForUnit`, `snapTolerance` y `roundToStep`. Ningún método modifica geometría — solo produce valores para la capa de representación.
- **precision/settings:** Añadida clase `PrecisionSettings` (`lengthPrecision`, `areaPrecision`, `exportPrecision`) integrada en `ProjectSettings`. Default: 1mm de precisión de longitud, 2 decimales de área, 4 decimales de exportación.
- **precision/ui:** Toda la UI reacciona al nivel de precisión configurado:
  - Ribbon de creación (`_CreationRibbon`) — paso de drag chip derivado de `PrecisionService.stepMeters`; display con decimales calculados por `PrecisionService.decimalsForUnit`.
  - Ribbon de selección (`_SelectionRibbon`) — longitudes, áreas y dimensiones de columna con precisión activa.
  - Canvas labels en tiempo real (`PreviewLayerPainter`) y estáticos (`StaticLayerPainter`) — medida de muro y área de habitación.
  - Panel de propiedades (`PropertiesPanel`) — display y edición de muros, columnas y habitaciones.
- **precision/settings-ui:** Nueva sección "Precisión" en Ajustes con dropdowns para `LengthPrecision`, decimales de área y decimales de exportación (3–6 dec con label semántico ≈ mm).
- **precision/export:** DXF (`DxfExporter.exportToDxf`) e IFC (`IfcExporter.exportToIfc`) aceptan `exportPrecision` como parámetro; el editor pasa `settings.precision.exportPrecision` en cada exportación.
- **precision/drag:** `_NumericDragChip._onLongPressMoveUpdate` usa `PrecisionService.roundToStep` en lugar de `toStringAsFixed(4)` + `double.parse` — elimina pérdida de precisión doble en arrastre.

### fix
- **precision/area:** Eliminada constante `10.7639` duplicada en `UnitFormatter.area`; ahora delega a `UnitConverter.toDisplayArea` que ya tiene `_sqFtPerSqM`.
- **snap/tolerance:** `geometricSnapTolerance` default reducido de 50mm → 5mm para precisión BIM arquitectónica real.

### arch
- `LengthPrecision` enum definido en `project_settings.dart` (junto a `UnitSystem`) para evitar dependencias circulares entre `unit_service`, `precision_service` y `project_settings`.
- `PrecisionService._toDisplayUnit` replica factores de `UnitConverter` localmente para mantener `precision_service.dart` libre de imports de `unit_service.dart`.
- `UnitFormatter.length` y `UnitFormatter.rawLength` aceptan `{LengthPrecision? precision}` opcional — backwards compatible con todos los call sites previos.

## [0.7.1-alpha] - 2026-05-01

### feat
- **units/engine:** Implementado `UnitService` centralizado (`lib/utils/unit_service.dart`). Incluye `UnitConverter` (metros ↔ mm/cm/m/in/ft) y `UnitFormatter` (formateo de longitudes, áreas y labels con precisión por defecto por unidad). El mundo interno sigue siendo siempre SI métrico; solo cambia la capa de presentación.
- **units/ui:** Toda la UI reacciona al sistema de unidades seleccionado en Ajustes → Unidades Base:
  - Ribbon de creación y selección (`ContextualRibbon`) — chips numéricos muestran y aceptan entrada en la unidad activa; el commit convierte de vuelta a metros antes de guardar.
  - Canvas labels en tiempo real (`PreviewLayerPainter`) y estáticos (`StaticLayerPainter`) — longitudes de muros, áreas de habitaciones, preview de dibujo.
  - Panel de propiedades (`PropertiesPanel`) — display y edición de alturas, espesores, dimensiones de columnas y áreas de habitaciones en la unidad activa.
  - Slider de celda de grid (Ajustes) muestra el tamaño en la unidad activa.
- **units/area:** Áreas muestran m² en sistemas métricos (mm/cm/m) y ft² en sistemas imperiales (in/ft).
- **units/dropdown:** El selector de unidades en Ajustes ahora muestra nombres descriptivos completos ("Milímetros (mm)", "Pies (ft)") en lugar de abreviaturas en mayúsculas.

### arch
- `_SelectionRibbon` promovido de `StatelessWidget` a `ConsumerWidget` para leer `projectSettingsProvider` y formatear valores con la unidad activa.
- `_RoomProperties` promovido de `StatelessWidget` a `ConsumerWidget` por la misma razón.
- `_NumericDragChip.unit` (String) reemplazado por `unitSystem` (UnitSystem) — la conversión y el formateo ocurren dentro del chip, no en el caller.

## [0.7.0-alpha] - 2026-05-01

### fix
- **ui/select:** Restaurada la herramienta de selección en tablets Android. `_isDesktop` usaba ancho de pantalla (720px breakpoint) en lugar de `Platform` — tabletas con pantalla ancha eran tratadas como desktop, cortocircuitando el long press que abre propiedades.
- **ui/column-preview:** Preview de columnas ahora reacciona en tiempo real a cambios de Base X, Base Y y Diámetro en el ribbon. `shouldRepaint` no revisaba `settings.defaults`; adicionalmente se pasa `isCircular` al painter para dibujar círculo vs rectángulo correctamente.
- **ui/column-create:** Columnas creadas ahora usan `columnWidth`/`columnDepth` del ribbon en lugar de `wallThickness * 2`.
- **ui/column-drag:** Independencia de Base X y Base Y al usar drag en el ribbon. Los closures de `onChanged` ahora leen `settings` via `ref.read` (siempre fresco). `ValueKey` añadidos a los chips para evitar reconciliación errónea de estado.
- **ui/wall-label:** Movido el label de longitud del muro a `offsetY: -30` para eliminar overlap con el handle de edición central. Font size clampeado a `[10, 18]px` para evitar labels gigantes a alto zoom.
- **ui/ribbon:** Renombrada propiedad visual "Grosor" → "Espesor" en el ribbon de selección de muros.
- **ui/espacios:** Botón "+ Nuevo Espacio" ahora usa el contexto correcto del modal sheet (`Navigator.of(sheetCtx).pop()`) para garantizar cierre confiable.

---

## [0.6.1-alpha] - 2026-05-01

### fix
- **export/dxf:** Reescritura completa del `DxfExporter` para producir archivos AC1015 válidos en AutoCAD Desktop, AutoCAD Web y Autodesk Viewer.
  - Asignación de handles fijos (well-known) que AutoCAD R2000 requiere en posiciones predefinidas (BLOCK_RECORD=`1`, LAYER=`2`, LTYPE=`5`, OBJECTS dict=`C`, *Model_Space=`1F`, etc.).
  - Añadidos subclass markers obligatorios en todos los registros de tabla: `AcDbLinetypeTableRecord`, `AcDbLayerTableRecord`, `AcDbBlockTableRecord`, `AcDbTextStyleTableRecord`, `AcDbRegAppTableRecord`.
  - Añadido group code `330` (owner handle) en todas las entidades, registros de tabla y bloques.
  - Corregido `$EXTMIN`/`$EXTMAX`: ahora incluye la coordenada Z (group code `30`), cuya ausencia corrompía el HEADER.
  - Corregida sección OBJECTS: diccionario raíz con handle fijo `C` y sub-diccionario `ACAD_GROUP` requerido por AC1015.
  - Corregida sección BLOCKS: BLOCK/ENDBLK con owner `330` apuntando al BLOCK_RECORD correspondiente y flag `67=1` para *Paper_Space.
  - Escritura con encoding UTF-8 explícito (sin CRLF) para evitar corrupción en Windows.
  - Muros degenerados (longitud < 1e-9) descartados silenciosamente con protección NaN/Infinity.
- **export/ifc:** Corregido placement espacial de muros en `IfcExporter`.
  - **Bug crítico:** `IFCLOCALPLACEMENT` usaba `IfcAxis2Placement3D` como `PlacementRelTo` — tipo incorrecto según spec IFC4; todos los muros aparecían en el origen mundial.
  - Jerarquía de placements corregida: world → `IFCLOCALPLACEMENT($, worldAxis)` → site → building → storey → wall.
  - Dirección real de cada muro calculada y asignada como X-axis del `IFCAXIS2PLACEMENT3D` local (antes siempre `(1,0,0)`).
  - Perfil rectangular reposicionado en `(length/2, 0)` en coordenadas locales, de modo que el muro se extiende correctamente de 0 a `length` en el eje X local.
  - Sólido de extrusión usa placement local propio (no el global compartido).
  - Muros ArcShape y PolygonShape marcados como no soportados aún (skip silencioso) en lugar de exportar geometría inválida.

### test
- **export/dxf:** Suite de 37 tests de regresión en `test/export/dxf_exporter_test.dart`:
  - Estructura del archivo: secciones, versión AC1015, INSUNITS, EXTMIN con Z, EOF.
  - Tablas: presencia de todas las tablas obligatorias, subclass markers, owner handles, layers.
  - Bloques: *Model_Space, *Paper_Space, owner handles.
  - Entidades: LWPOLYLINE para muros (rectos, diagonales, múltiples), CIRCLE/LWPOLYLINE para columnas.
  - Coordenadas: world-space correcto, negativos, coordenadas >100m, protección NaN/Infinity.
  - Integridad de handles: unicidad garantizada en todo el archivo.
  - Casos límite: muro degenerado, caracteres especiales en título.

## [0.5.0-alpha] - 2026-05-01

### feat
- **domain:** Entidades BIM inmutables (`Wall`, `Room`, `Door`, `Window`, `Column`, `Project`).
- **application:** Use cases para detección de habitaciones (`DetectRoomsUseCase`), validación geométrica (`ValidateGeometryUseCase`), e inserción de entidades.
- **persistence:** Repositorio basado en `FileStorageService`, serializador JSON y archivador ZIP para el formato propietario `.levon`.
- **persistence:** `AutosaveService` con debounce (30s) basado en la observación del estado global.
- **ui:** `EditorScreen` con motor interactivo Canvas (gestos multitouch, pan, zoom, point-to-point drawing).
- **ui:** Herramientas modulares de UI (`ContextualRibbon`, `PropertiesPanel`, `SettingsOverlay`).
- **export:** Implementación base para DXF (`DxfExporter`) y adaptador IFC (`IfcExportAdapter`).

### docs
- **architecture:** Documentación técnica masiva (`CONTEXT.md`, `ARCHITECTURE.md`, `RULES.md`, `current.md`).
- **ai-ops:** Creación de carpetas `PROMPTS/`, `TASKS/`, `MEMORY/`, `SNAPSHOTS/` optimizadas para RAG y LLMs.
- **license:** Inclusión de licencia propietaria (`LICENSE.md`) y guías de contribución internas.

### refactor
- **architecture:** Desacople total de UI respecto a la capa matemática (`vector_math`) aplicando Clean Architecture estricta.
- **state:** Migración y estabilización de state management usando `flutter_riverpod` 2.x (`ProviderScope`, `FutureProvider` para disco).

### fix
- **ui/canvas:** Compensación de la matriz de transformación para que el focal point no sufra saltos matemáticos graves durante el zoom, aunque requiere refinamiento.
- **testing:** Corrección de tests asíncronos sobrescribiendo `projectsListProvider` con mock data en memoria.
