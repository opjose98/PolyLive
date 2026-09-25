# LevON Project Tree

> Índice optimizado para IA y auditoría técnica. Generado: 2026-05-11 (v0.10.1-alpha).

## Leyenda
- [SOURCE OF TRUTH] → archivos críticos para entender el sistema
- [LARGE FILE] → >500 líneas, candidatos a fragmentar
- [CRITICAL] → módulos de alto impacto

---

## Estructura

```
lib/
├── main.dart                                         — entry point, GoRouter, Riverpod scope
│
├── bim/services/
│   ├── bim_code_generator.dart                       — generación/validación de códigos BIM
│   └── photo_bim_code_generator.dart                 — BIM codes para fotos
│
├── core/
│   ├── constants.dart                                — constantes globales (escala, pan default)
│   ├── math_utils.dart                               — utilidades matemáticas
│   ├── config/global_prefs_service.dart              — SharedPreferences wrapper
│   ├── geometry/
│   │   ├── intersections.dart                        [CRITICAL] — motor intersecciones 2D
│   │   ├── polygons.dart                             — operaciones de polígonos
│   │   ├── polygons/polygon_utils.dart
│   │   ├── polygons/polygon_validator.dart
│   │   └── spatial/spatial_hash.dart                 — SpatialHash O(1) lookup
│   ├── geometry/topology/
│   │   ├── topology_edge.dart                        — DCEL half-edge
│   │   ├── topology_graph.dart                       [CRITICAL] — TopologyGraph, edge splitting
│   │   └── topology_node.dart
│   ├── utils/
│   │   ├── precision_service.dart                    — 4 niveles de precisión
│   │   └── unit_service.dart                         — mm/cm/m/in/ft conversions
│   └── validators/
│       ├── validate_geometry_use_case.dart
│       └── validation_pipeline.dart
│
├── export/
│   ├── dxf_exporter.dart                             — DXF AC1015, layer S-WALL
│   ├── ifc_export_adapter.dart                       — adaptador JSON→IFC payload
│   ├── ifc_exporter.dart                             [CRITICAL] — IFC4 exporter
│   └── pdf_exporter.dart                             — stub, no implementado
│
├── features/
│   ├── editor/
│   │   ├── application/
│   │   │   ├── editor_controller.dart                [CRITICAL] — lógica de gestos/snap/draw/select
│   │   │   ├── preview_generator.dart                — genera previews para space cards
│   │   │   └── selection_service.dart                — hit-testing de entidades en canvas
│   │   └── ui/
│   │       ├── editor_screen.dart                    [SOURCE OF TRUTH][LARGE FILE ~2250L] — pantalla principal del editor
│   │       ├── preview_layer_painter.dart            — capa de preview durante draw
│   │       └── static_layer_painter.dart             [CRITICAL] — capa estática (muros, habitaciones, columnas, marcadores)
│   │
│   ├── overlays/
│   │   ├── contextual_ribbon.dart                    [LARGE FILE ~1175L] — ribbon contextual por modo/selección
│   │   ├── labels_layer_painter.dart                 — labels de dimensiones sobre canvas
│   │   ├── properties_panel.dart                     [LARGE FILE ~880L] — panel lateral de propiedades
│   │   └── settings/
│   │       ├── settings_content.dart                 — contenido del settings overlay
│   │       ├── settings_overlay.dart                 — overlay de configuración
│   │       └── settings_widgets.dart                 — widgets reutilizables de settings
│   │
│   ├── photos/
│   │   ├── application/
│   │   │   ├── add_photo_to_collection_use_case.dart
│   │   │   ├── attach_photo_use_case.dart
│   │   │   ├── photo_capture_service.dart            [CRITICAL] — captura + EXIF + overlay template
│   │   │   ├── photo_metadata_service.dart           — extracción EXIF asíncrona
│   │   │   ├── photo_permission_service.dart         — permisos de cámara/galería
│   │   │   ├── photo_storage_service.dart            — I/O de archivos de foto
│   │   │   └── remove_photo_use_case.dart            — cascade delete (foto + marcadores en planta)
│   │   ├── domain/
│   │   │   ├── photo.dart                            — PhotoEntity inmutable
│   │   │   ├── photo_collection.dart                 — PhotoCollection inmutable
│   │   │   ├── photo_entity.dart                     — alias/re-export de photo.dart
│   │   │   └── photo_marker_entity.dart              — PhotoMarkerEntity (posición en planta + linkedPhotoId)
│   │   └── ui/
│   │       ├── photo_collection_screen.dart          [CRITICAL] — galería de campo
│   │       └── widgets/
│   │           ├── photo_card.dart                   — grid cell con progressive fade-in
│   │           ├── photo_overlay_stack.dart          — overlays no-destructivos sobre foto
│   │           ├── photo_properties_panel.dart       — panel de propiedades de foto
│   │           └── photo_viewer_dialog.dart          — visor fullscreen compartido
│   │
│   ├── projects/
│   │   ├── domain/
│   │   │   ├── project.dart                          [SOURCE OF TRUTH] — Project, SpaceGeometry, entidades
│   │   │   └── workspace_snapshot.dart               — WorkspaceSnapshot
│   │   └── ui/
│   │       ├── project_workspace_screen.dart         — pantalla de espacios del proyecto
│   │       ├── projects_screen.dart                  — lista de proyectos
│   │       ├── spaces/
│   │       │   ├── space_card.dart                   — tarjeta de espacio con preview
│   │       │   └── space_preview_painter.dart        — SpacePreviewPainter lightweight
│   │       └── widgets/
│   │           ├── bim_project_dialog.dart           — formulario BIM
│   │           ├── project_card.dart                 — tarjeta en lista de proyectos
│   │           └── project_context_menu.dart         — menú contextual de proyecto
│   │
│   ├── rooms/
│   │   ├── application/
│   │   │   ├── create_room_use_case.dart
│   │   │   ├── detect_rooms_use_case.dart            [CRITICAL] — detección de habitaciones por polígonos cerrados
│   │   │   └── room_generator.dart
│   │   └── domain/
│   │       └── room.dart                             — Room inmutable
│   │
│   ├── viewport/
│   │   ├── preview_cache_service.dart                — cache de previews espaciales
│   │   └── space_bounds.dart                         — SpaceBounds (fit/scale de geometría)
│   │
│   └── walls/
│       ├── application/
│       │   ├── create_wall_use_case.dart
│       │   ├── elevation/
│       │   │   └── edit_wall_elevation_use_case.dart [CRITICAL] — CRUD de WallElevation y WallOpenings
│       │   └── wall_csl_service.dart                 [CRITICAL] — transforms CSL↔world, snap, validación
│       ├── domain/
│       │   ├── column.dart                           — Column inmutable
│       │   ├── wall.dart                             — Wall inmutable
│       │   └── wall_elevation.dart                   [SOURCE OF TRUTH] — WallElevation, WallOpening, WallQuantification
│       └── ui/
│           ├── wall_elevation_editor.dart            — editor de elevación embebido
│           ├── wall_elevation_painter.dart           [CRITICAL] — WallElevationPainter, handles
│           └── wall_elevation_panel.dart             [LARGE FILE ~812L] — WEP: tool system completo
│
├── persistence/
│   ├── autosave_service.dart                         — debounce 30s autosave
│   ├── file_storage_service.dart                     — I/O de archivos .levon
│   ├── json_serializer.dart                          [SOURCE OF TRUTH][LARGE FILE ~677L] — serialize/deserialize JSON v2.0+
│   ├── levon_archive_service.dart                    — ZIP archive (.levon format)
│   └── project_repository.dart                       — repositorio de proyectos
│
├── shared/
│   ├── domain/
│   │   └── shapes.dart                               — Rect2, Line2, formas básicas
│   └── state/
│       ├── history_notifier.dart                     — Undo/Redo stack
│       ├── project_settings.dart                     — EditorDefaults, ProjectSettings
│       └── providers.dart                            [SOURCE OF TRUTH][LARGE FILE ~498L] — todos los Riverpod providers
│
└── ui/theme/
    └── levon_tokens.dart                             [SOURCE OF TRUTH] — design tokens, colores, tipografía, sombras
```

---

## Archivos Raíz Relevantes
- `pubspec.yaml` — dependencias Flutter/Dart
- `analysis_options.yaml` — linter rules
- `current.md` — estado actual del proyecto [SOURCE OF TRUTH]
- `project_tree.md` — este archivo

## Directorios No-Source
- `archive/` — documentación histórica, audits, snapshots, prompts legacy
- `docs/` — arquitectura y snapshots activos
- `test/` — suite de pruebas
- `assets/` — fuentes, íconos
- `android/`, `windows/`, `macos/`, `linux/` — plataformas
