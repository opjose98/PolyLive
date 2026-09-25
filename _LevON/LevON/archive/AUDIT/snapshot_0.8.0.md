# Snapshot v0.8.0-alpha
**Fecha:** 2026-05-04  
**Estado:** Alpha — No apto para producción

← [[INDEX]]  |  Ver también: [[audit_report]] | [[snapshot_0.7.2]]

---

## Resumen del Delta 0.8.0

| Métrica | 0.7.2 | 0.8.0 | Δ |
|---------|-------|-------|---|
| Archivos Dart | ~54 | ~61 | +7 |
| Líneas de código (estimado) | ~8,000 | ~9,500 | +1,500 |
| Tests totales | ~76 | 112 | +36 |
| Cobertura estimada | ~25% | ~35% | +10% |
| Providers Riverpod | 28 | 30 | +2 |
| Entidades de dominio | 7 | 8 | +1 (`WallElevation`) |

---

## Inventario de Archivos

### Dominio (`lib/domain/`)
| Archivo | Estado | Nota |
|---------|--------|------|
| `entities/project.dart` | ✅ Actualizado | + `wallElevations: List<WallElevation>` |
| `entities/wall.dart` | ✅ Sólido | — |
| `entities/room.dart` | ⚠️ Campo `boundary` deprecated sin timeline | — |
| `entities/shapes.dart` | ✅ Sólido | — |
| `entities/column.dart` | ✅ | — |
| `entities/door.dart` | ✅ | — |
| `entities/window.dart` | ✅ | — |
| `entities/photo.dart` | ✅ | — |
| `entities/workspace_snapshot.dart` | ✅ | — |
| `entities/wall_elevation.dart` | ✅ **NUEVO 0.8.0** | `WallElevation`, `WallOpening`, `VerticalLevels`, `WallQuantification`, `OpeningType` |
| `validators/validation_pipeline.dart` | ⚠️ Solo 2 reglas, O(n²) sin throttle | — |

### Geometría (`lib/geometry/`)
| Archivo | Estado |
|---------|--------|
| `intersections.dart` | ✅ Sólido |
| `constants.dart` | ✅ |
| `math_utils.dart` | ✅ |
| `spatial/spatial_hash.dart` | ✅ |
| `topology/topology_graph.dart` | ⚠️ Complejo, no expone adjacency map como API |
| `topology/topology_node.dart` | ⚠️ Lista mutable en nodo |
| `topology/topology_edge.dart` | ✅ |
| `rooms/room_generator.dart` | ✅ |
| `polygons/polygon_utils.dart` | ✅ |
| `polygons/polygon_validator.dart` | ✅ |

### Aplicación (`lib/application/`)
| Archivo | Estado | Nota |
|---------|--------|------|
| `use_cases/detect_rooms_use_case.dart` | ✅ Limpio | — |
| `use_cases/validate_geometry_use_case.dart` | ✅ | — |
| `use_cases/create_wall_use_case.dart` | ✅ | — |
| `use_cases/create_room_use_case.dart` | ✅ | — |
| `use_cases/attach_photo_use_case.dart` | ✅ | — |
| `use_cases/wall_elevation/edit_wall_elevation_use_case.dart` | ✅ **NUEVO 0.8.0** | CRUD openings, coronación, Chain Mode, sync |
| `services/selection_service.dart` | ✅ Sólido | — |
| `services/global_prefs_service.dart` | ✅ | — |
| `services/wall_csl_service.dart` | ✅ **NUEVO 0.8.0** | CSL transforms, validateOpening (5 reglas), snapX/Y |

### Persistencia (`lib/persistence/`)
| Archivo | Estado | Nota |
|---------|--------|------|
| `project_repository.dart` | ⚠️ Sin schema versioning formal | — |
| `json_serializer.dart` | ✅ Actualizado | + sección `elevations[]` backwards-compatible |
| `file_storage_service.dart` | ✅ | — |
| `levon_archive_service.dart` | ✅ | — |
| `autosave_service.dart` | ⚠️ Sin flush en dispose | — |

### Exportación (`lib/export/`)
| Archivo | Estado |
|---------|--------|
| `dxf_exporter.dart` | ✅ AC1015 válido |
| `ifc_exporter.dart` | ⚠️ Sin columnas/doors/spaces; OpeningType preparado semánticamente |
| `ifc_export_adapter.dart` | ✅ JSON BIM |
| `pdf_exporter.dart` | ❌ No implementado |

### UI (`lib/ui/`)
| Archivo | Estado | Nota |
|---------|--------|------|
| `screens/editor_screen.dart` | 🔴 God Widget — fragmentar urgente | WEP no cableado (N-01) |
| `screens/projects_screen.dart` | ✅ | — |
| `screens/project_workspace_screen.dart` | ✅ | — |
| `editor/editor_controller.dart` | ✅ Bien estructurado | — |
| `editor/static_layer_painter.dart` | ✅ | — |
| `editor/preview_layer_painter.dart` | ✅ | — |
| `editor/preview_generator.dart` | ✅ | — |
| `editor/wall_elevation_painter.dart` | ✅ **NUEVO 0.8.0** | `WallElevationPainter`, `ElevationViewport` |
| `state/providers.dart` | ⚠️ Actualizado | + `WallElevationsNotifier`, `wallElevationsProvider`, `activeElevationWallIdProvider` |
| `state/project_settings.dart` | ✅ Bien estructurado | — |
| `state/history_notifier.dart` | ✅ Sólido | — |
| `widgets/properties_panel.dart` | ⚠️ ComplexWidget | — |
| `widgets/editor/contextual_ribbon.dart` | ⚠️ ComplexWidget | — |
| `widgets/settings/settings_overlay.dart` | ✅ | — |
| `widgets/settings/settings_content.dart` | ✅ | — |
| `widgets/settings/settings_widgets.dart` | ✅ | — |
| `widgets/wall_elevation/wall_elevation_panel.dart` | ✅ **NUEVO 0.8.0** | Dialog modal WEP; no integrado en editor_screen |
| `theme/levon_tokens.dart` | ✅ | — |

### Utilidades (`lib/utils/`)
| Archivo | Estado |
|---------|--------|
| `unit_service.dart` | ✅ Sólido |
| `precision_service.dart` | ✅ Sólido |

---

## Tests existentes

| Archivo | Tests | Estado |
|---------|-------|--------|
| `test/export/dxf_exporter_test.dart` | 37 | ✅ Cobertura alta |
| `test/domain/entities/wall_elevation_test.dart` | 13 | ✅ **NUEVO 0.8.0** |
| `test/application/wall_elevation/quantification_test.dart` | 23 | ✅ **NUEVO 0.8.0** |
| `test/application/detect_rooms_use_case_test.dart` | — | ✅ |
| `test/application/history_notifier_test.dart` | — | ✅ |
| `test/application/selection_service_test.dart` | — | ✅ |
| `test/domain/entities/wall_test.dart` | — | ✅ |
| `test/domain/entities/column_test.dart` | — | ✅ |
| `test/geometry/intersections_test.dart` | — | ✅ |
| `test/geometry/polygons_test.dart` | — | ✅ |
| `test/widget_test.dart` | — | ⚠️ Básico |

**Sin tests para:** `TopologyGraph`, `RoomGenerator`, `IfcExporter`, `JsonSerializer`, `ProjectRepository`, `AutosaveService`, `EditorController` (UI), `WallElevationPainter`.

---

## Problemas abiertos (heredados de 0.7.2 + nuevos 0.8.0)

| ID | Severidad | Descripción | Estado |
|----|-----------|-------------|--------|
| C-01 | 🔴 Crítico | God Widget `editor_screen.dart` | Abierto |
| C-02 | 🔴 Crítico | Room Engine O(n²) a 60fps durante drag | Abierto |
| C-03 | 🔴 Crítico | `SolapamientoValidator` O(n²) sin throttle | Abierto |
| C-04 | 🟡 Mitigado | Schema versioning — `elevations[]` con tolerancia a ausencia; versioning formal pendiente | Parcial |
| C-05 | 🔴 Crítico | GUIDs IFC no estables | Abierto |
| C-06 | 🔴 Crítico | `flush()` no llamado en `dispose()` | Abierto |
| C-07 | 🟡 Preparado | IFC sin openings; `OpeningType` semántico preparado | Parcial |
| C-08 | 🔴 Crítico | Inconsistencia tolerancias snap visual vs geométrico | Abierto |
| N-01 | 🟠 Nuevo | WEP no cableado en `editor_screen.dart` | Abierto |
| N-02 | 🟠 Nuevo | `wallElevationsProvider` no se carga al abrir proyecto | Abierto |
| N-03 | 🟠 Nuevo | `propagateChainMode` no puede ejecutarse sin adjacency map del `TopologyGraph` | Abierto |
