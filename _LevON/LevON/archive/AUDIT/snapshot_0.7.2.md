# Snapshot v0.7.2-alpha
**Fecha:** 2026-05-03  
**Estado:** Alpha — No apto para producción

← [[INDEX]]

---

## Inventario de Archivos

### Dominio (`lib/domain/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `entities/project.dart` | 89 | ✅ Sólido |
| `entities/wall.dart` | 78 | ✅ Sólido |
| `entities/room.dart` | 73 | ⚠️ Campo `boundary` deprecated sin timeline |
| `entities/shapes.dart` | 108 | ✅ Sólido |
| `entities/column.dart` | — | ✅ |
| `entities/door.dart` | — | ✅ |
| `entities/window.dart` | — | ✅ |
| `entities/photo.dart` | — | ✅ |
| `entities/workspace_snapshot.dart` | — | ✅ |
| `validators/validation_pipeline.dart` | 144 | ⚠️ Solo 2 reglas, O(n²) sin throttle |

### Geometría (`lib/geometry/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `intersections.dart` | 214 | ✅ Sólido matemáticamente |
| `constants.dart` | — | ✅ |
| `math_utils.dart` | — | ✅ |
| `spatial/spatial_hash.dart` | 82 | ✅ Bien implementado |
| `topology/topology_graph.dart` | 307 | ⚠️ Complejo, frágil con casos edge |
| `topology/topology_node.dart` | — | ⚠️ Lista mutable en nodo |
| `topology/topology_edge.dart` | — | ✅ |
| `rooms/room_generator.dart` | 79 | ✅ Sólido |
| `polygons/polygon_utils.dart` | — | ✅ |
| `polygons/polygon_validator.dart` | — | ✅ |

### Aplicación (`lib/application/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `use_cases/detect_rooms_use_case.dart` | 31 | ✅ Limpio |
| `use_cases/validate_geometry_use_case.dart` | — | ✅ |
| `use_cases/create_wall_use_case.dart` | — | ✅ |
| `use_cases/create_room_use_case.dart` | — | ✅ |
| `use_cases/attach_photo_use_case.dart` | — | ✅ |
| `services/selection_service.dart` | 116 | ✅ Sólido |
| `services/global_prefs_service.dart` | — | ✅ |

### Persistencia (`lib/persistence/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `project_repository.dart` | 303 | ⚠️ Sin schema versioning |
| `json_serializer.dart` | — | ⚠️ Sin versioning |
| `file_storage_service.dart` | — | ✅ |
| `levon_archive_service.dart` | — | ✅ |
| `autosave_service.dart` | 64 | ⚠️ Sin flush en dispose |

### Exportación (`lib/export/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `dxf_exporter.dart` | 620 | ✅ AC1015 válido |
| `ifc_exporter.dart` | 272 | ⚠️ Sin columnas/doors/spaces |
| `ifc_export_adapter.dart` | — | ✅ JSON BIM |
| `pdf_exporter.dart` | — | ❌ No implementado |

### UI (`lib/ui/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `screens/editor_screen.dart` | **1735** | 🔴 God Widget — fragmentar urgente |
| `screens/projects_screen.dart` | — | ✅ |
| `screens/project_workspace_screen.dart` | — | ✅ |
| `editor/editor_controller.dart` | 325 | ✅ Bien estructurado |
| `editor/static_layer_painter.dart` | — | ✅ |
| `editor/preview_layer_painter.dart` | — | ✅ |
| `editor/preview_generator.dart` | — | ✅ |
| `state/providers.dart` | 292 | ⚠️ Muchos StateProviders |
| `state/project_settings.dart` | 372 | ✅ Bien estructurado |
| `state/history_notifier.dart` | 94 | ✅ Sólido |
| `widgets/properties_panel.dart` | — | ⚠️ ComplexWidget |
| `widgets/editor/contextual_ribbon.dart` | — | ⚠️ ComplexWidget |
| `widgets/settings/settings_overlay.dart` | — | ✅ |
| `widgets/settings/settings_content.dart` | — | ✅ |
| `widgets/settings/settings_widgets.dart` | — | ✅ |
| `theme/levon_tokens.dart` | — | ✅ |

### Utilidades (`lib/utils/`)
| Archivo | Líneas | Estado |
|---------|--------|--------|
| `unit_service.dart` | 126 | ✅ Sólido |
| `precision_service.dart` | 75 | ✅ Sólido |

---

## Tests existentes

| Archivo | Tests | Estado |
|---------|-------|--------|
| `test/export/dxf_exporter_test.dart` | 37 | ✅ Cobertura alta |
| `test/application/detect_rooms_use_case_test.dart` | — | ✅ |
| `test/application/history_notifier_test.dart` | — | ✅ |
| `test/application/selection_service_test.dart` | — | ✅ |
| `test/domain/entities/wall_test.dart` | — | ✅ |
| `test/domain/entities/column_test.dart` | — | ✅ |
| `test/geometry/intersections_test.dart` | — | ✅ |
| `test/geometry/polygons_test.dart` | — | ✅ |
| `test/widget_test.dart` | — | ⚠️ Básico |

**Sin tests para:** `TopologyGraph`, `RoomGenerator`, `IfcExporter`, `JsonSerializer`, `ProjectRepository`, `AutosaveService`, `EditorController` (UI), `SelectionService` (unit).

---

## Métricas de la versión

| Métrica | Valor |
|---------|-------|
| Total archivos Dart | ~60 |
| Líneas de código (estimado) | ~8,000 |
| Cobertura de tests (estimado) | ~25% |
| Providers Riverpod activos | 28 |
| Bugs conocidos activos | 6 (del ROADMAP) |
| Bugs identificados en esta auditoría | 23 |
| Funcionalidades bloqueantes para producción | 8 |
