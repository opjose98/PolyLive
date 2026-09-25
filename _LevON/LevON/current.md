# Estado Actual (Current State)

**Versión:** 0.10.1-alpha
**Fecha de Revisión:** 2026-05-11
**Auditoría completa:** ver `archive/AUDIT/` | Snapshot: `archive/SNAPSHOTS/snapshot_0.8.0_alpha.md`

## Estado General
Arquitectura Clean Architecture estabilizada. `flutter analyze` → 0 issues. Estructura de features completa bajo `lib/features/`. 0.10.1 completa el **Sistema SPDS** (fotos de campo) y ejecuta un **audit de deuda técnica**: eliminación de código muerto, migración de entidades foto al feature correcto, consolidación de rutas de import. 0.10.0 introdujo multi-espacio con persistencia real y el SPDS inicial.

## Funcionalidades Estables
*   **Identidad BIM:** `Project.bimCode`, `description`, `discipline`, `author`. `BimCodeGenerator` en `bim/services/`. Backward-compatible con archivos `.levon` legacy.
*   **Dominio BIM:** `Wall`, `Room`, `Column`, `WallElevation`, `WallOpening` — entidades inmutables. `Door`/`Window` eliminados como track paralelo (consolidados en `WallOpening`).
*   **Geometría:** Motor de intersecciones 2D, SpatialHash O(1).
*   **Topología:** `TopologyGraph` con DCEL rotation system, edge splitting en T-junctions, API pública de adyacencia.
*   **Room Engine:** `DetectRoomsUseCase` funcional para polígonos cerrados de muros estructurales.
*   **Snap:** Snap a nodos, angular configurable, grid. Smart snaps en elevación (NMS, openings, bordes, centros).
*   **Unidades:** `UnitService` completo (mm/cm/m/in/ft), `PrecisionService` (4 niveles).
*   **Persistencia:** `.levon` archives (ZIP con JSON v2.0+). `AutosaveService` debounce 30s. BIM metadata en `metadata.json`.
*   **UI/Canvas:** Panning, Zooming focal-point compensado (plan y elevación), drag-and-drop con handles.
*   **Exportación DXF:** AC1015 válido con handles fijos, layers, LWPOLYLINE para muros.
*   **Exportación IFC:** Muros rectos con jerarquía espacial correcta (IFC4); GUIDs de muros estables.
*   **Historial:** Undo/Redo con stack de 50 snapshots.
*   **Validación:** Pipeline con 2 reglas (longitud mínima, solapamiento).
*   **Snap Quick Bar:** `_SnapQuickBar` — 4 toggles rápidos (Grid, Nodos, Ángulo, Snap Grid).
*   **Soft Delete canvas:** Modo eliminar usa flujo 2-toques — primer tap marca rojo, segundo tap elimina.
*   **BIM UI:** `BIMProjectDialog`, `ProjectCard`, `ProjectContextMenu`, búsqueda en tiempo real, `SpaceListScreen` + `SpaceCard`, `SpacePreviewPainter` + `SpaceBounds`.
*   **MEM-S — Motor de Elevación:**
    *   `WallElevation` con `VerticalLevels`, `WallOpening` (door/window/opening en CSL), `WallQuantification`.
    *   `WallCslService`: transforms world↔CSL, `validateOpening`, `snapXSmart`/`snapYSmart`.
    *   `EditWallElevationUseCase`: CRUD de openings, `moveOpening`, `resizeOpening`, coronación, Chain Mode.
    *   `ElevationViewport`, `WallElevationPainter`, `WallElevationPanel` (WEP) completo.
    *   Zoom de elevación con focal-point estable (round-trip viewport coordinates, 0.10.1).
*   **SPDS — Sistema de Fotografías de Campo (0.10.0/0.10.1):**
    *   `PhotoEntity`, `PhotoCollection` — entidades inmutables en `features/photos/domain/`.
    *   `PhotoMarkerEntity` — marcador en planta con `linkedPhotoId`, renderizado en `StaticLayerPainter`.
    *   `PhotoCaptureService` — captura + metadata EXIF + overlay desde template.
    *   `PhotoMetadataService` — extracción EXIF asíncrona.
    *   `AddPhotoToCollectionUseCase`, `RemovePhotoUseCase` — cascade delete de marcadores en planta.
    *   `PhotoCollectionScreen` — galería de campo con grid, BIM codes, búsqueda.
    *   `PhotoViewerDialog` / `showPhotoViewerDialog` — visor fullscreen compartido (ribbon + properties panel).
    *   `PhotoOverlayStack` — overlays no-destructivos (fecha, GPS, brújula, texto, metadata).
    *   `PhotoThumbnailButton` — thumbnail tappable con cacheWidth decode cap.
    *   `PhotoPropertiesPanel` — panel de propiedades con preview + overlays + BIM fields.
    *   `PhotoCard` — grid cell con progressive fade-in, decode cap 300px, sin `File.existsSync()`.
    *   "Ver foto" desde ribbon y properties panel del editor (sin navegar a galería).
    *   Warning en confirmación de delete si hay marcadores vinculados.
    *   `GridView` con `addAutomaticKeepAlives: false` para eviction de celdas fuera de pantalla.

## Funcionalidades Inestables / En Desarrollo
*   PDF export: declarado pero no implementado.
*   `snapToLines` y `snapToIntersections`: toggles en UI sin implementación real.
*   IFC: columnas, openings de muro, IfcSpace — no exportados.
*   GUIDs IFC de entidades estructurales (site, building, storey, relaciones) siguen siendo aleatorios.
*   Plan Projection System: auto-proyección de WallOpenings → símbolos de puerta/ventana en planta.
*   Multi-selection en WEP: no implementado.

## Problemas Conocidos (Known Bugs)
*   Jitter menor al iniciar zoom multitouch en tablets.
*   Fugas topológicas en muros sin cierre perfecto o cruces T atípicos.
*   `roomsProvider` recalcula O(n²) durante drag (rendimiento).
*   `validationProvider` `SolapamientoValidator` O(n²) sin throttle.

## Bloqueantes para Producción
*   Throttle del Room Engine y validación O(n²).
*   GUIDs IFC estables para entidades estructurales.
*   Schema versioning formal en `JsonSerializer` (bump a v2.1).
*   `editor_screen.dart` ~1700 líneas — candidato a fragmentar en capas.

## Próximo Objetivo Recomendado
1. Throttle del Room Engine (`roomsProvider`) y validación O(n²) — rendimiento en campo.
2. GUIDs IFC estables para site, building, storey y relaciones.
3. Plan Projection System: renderizar WallOpenings como símbolos puerta/ventana en planta.
4. Schema versioning formal (`JsonSerializer` v2.1 con migración Door/Window → WallOpening).
5. IFC: exportar openings (IfcOpeningElement) desde WallElevation.
6. Fragmentar `editor_screen.dart` en capas (`GestureLayer`, `ViewportLayer`, `OverlayLayer`).
