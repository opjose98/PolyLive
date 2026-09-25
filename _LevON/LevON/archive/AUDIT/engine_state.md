# Motor de Estado (Riverpod)
**Archivos:** `lib/ui/state/providers.dart`, `lib/ui/state/project_settings.dart`, `lib/ui/state/history_notifier.dart`

← [[INDEX]]  |  Conectado a: [[engine_editor]], [[engine_canvas]], [[engine_persistence]], [[engine_topology]]

---

## Responsabilidad
Hub central de toda la aplicación. Conecta la UI, la lógica del editor, el motor geométrico y la persistencia usando Riverpod como sistema de estado reactivo.

---

## Mapa de Providers

### Providers de editor (modo/herramientas)
| Provider | Tipo | Descripción |
|----------|------|-------------|
| `editorModeProvider` | `StateProvider<EditorMode>` | view / draw / select / delete |
| `drawSubModeProvider` | `StateProvider<DrawSubMode>` | wall / partition / column |
| `creationMethodProvider` | `StateProvider<CreationMethod>` | drag / pointToPoint / circular / rectangular |
| `selectedObjectProvider` | `StateProvider<Object?>` | elemento BIM seleccionado (Wall, Room, Column) |
| `propertiesPanelVisibleProvider` | `StateProvider<bool>` | panel derecho desktop |
| `draggedNodeIndexProvider` | `StateProvider<int?>` | handle activo (0=start, 1=end, 2=mid) |

### Providers de datos
| Provider | Tipo | Descripción |
|----------|------|-------------|
| `wallsProvider` | `StateNotifierProvider<WallsNotifier, List<Wall>>` | lista mutable de muros |
| `doorsProvider` | `StateNotifierProvider<DoorsNotifier, List<Door>>` | lista mutable de puertas |
| `windowsProvider` | `StateNotifierProvider<WindowsNotifier, List<Window>>` | lista mutable de ventanas |
| `columnsProvider` | `StateNotifierProvider<ColumnsNotifier, List<ArchitecturalColumn>>` | lista mutable de columnas |
| `roomsProvider` | `Provider<List<Room>>` | **DERIVADO** — recalculado en cada cambio de walls |
| `projectProvider` | `StateProvider<Project?>` | metadata del proyecto activo |
| `wallElevationsProvider` | `StateNotifierProvider<WallElevationsNotifier, List<WallElevation>>` | elevaciones MEM (CSL, NMS, HAP, CM) — **nuevo 0.8.0** |
| `activeElevationWallIdProvider` | `StateProvider<String?>` | wallId con el WEP abierto actualmente — **nuevo 0.8.0** |

### Providers derivados / computados
| Provider | Tipo | Descripción |
|----------|------|-------------|
| `currentProjectSnapshotProvider` | `Provider<Project?>` | Ensambla Project desde todos los providers vivos |
| `workspaceSnapshotProvider` | `Provider<WorkspaceSnapshot>` | Snapshot para undo/redo |
| `validationProvider` | `Provider<List<ValidationIssue>>` | Resultado de ValidationPipeline sobre el snapshot |
| `resolvedExportPathProvider` | `FutureProvider<String?>` | Última carpeta de exportación |

### Providers de infraestructura
| Provider | Tipo | Descripción |
|----------|------|-------------|
| `projectRepositoryProvider` | `Provider<ProjectRepository>` | Gateway de persistencia (singleton) |
| `levonArchiveServiceProvider` | `Provider<LevonArchiveService>` | Compresor ZIP (singleton) |
| `dxfExporterProvider` | `Provider<DxfExporter>` | Exportador DXF (singleton) |
| `ifcExporterProvider` | `Provider<IfcExporter>` | Exportador IFC (singleton) |
| `autosaveServiceProvider` | `Provider.autoDispose<AutosaveService>` | Timer de autosave |
| `globalPrefsServiceProvider` | `Provider<GlobalPrefsService>` | Preferencias globales |

### Providers de configuración y navegación
| Provider | Tipo | Descripción |
|----------|------|-------------|
| `projectSettingsProvider` | `StateNotifierProvider<ProjectSettingsNotifier, ProjectSettings>` | Todas las settings del proyecto |
| `espaciosProvider` | `StateProvider<List<String>>` | Lista de nombres de plantas |
| `currentEspacioIndexProvider` | `StateProvider<int>` | Planta activa |
| `saveStatusProvider` | `StateProvider<SaveStatus>` | idle / saving / saved / error |
| `projectsListProvider` | `FutureProvider<List<ProjectSummary>>` | Listado de proyectos en galería |
| `projectByIdProvider` | `FutureProvider.family<Project, String>` | Proyecto por ID |
| `historyProvider` | `StateNotifierProvider<HistoryNotifier, HistoryState>` | Undo/redo stacks |

---

## Grafo de Dependencias Críticas

```
wallsProvider ─────────────────────┐
                                    ├──→ roomsProvider (detecta rooms reactivamente)
projectSettingsProvider ────────────┘
       │
       └──→ validationProvider ────→ currentProjectSnapshotProvider
                                            │
projectProvider ────────────────────────────┤
doorsProvider ──────────────────────────────┤
windowsProvider ────────────────────────────┤
columnsProvider ────────────────────────────┤
wallElevationsProvider ─────────────────────┘  ← nuevo 0.8.0
       │
       └──→ workspaceSnapshotProvider (snapshot para undo/redo)

wallElevationsProvider (MEM) — 0.8.0:
  WallElevationsNotifier
    ├── upsertElevation(WallElevation)
    ├── removeElevation(String wallId)
    └── syncWithWalls(List<Wall>)   ← limpieza de huérfanos
```

---

## Flujo de Datos Completo

```
Usuario dibuja un muro
  ↓
EditorController.commitDrawing()
  1. historyProvider.notifier.record(workspaceSnapshotProvider)
  2. wallsProvider.notifier.addWall(wall)
  ↓
wallsProvider actualiza → roomsProvider reactivamente recalcula rooms
  ↓
StaticLayerPainter recibe nuevos walls + rooms → repaint
  ↓
currentProjectSnapshotProvider cambia
  ↓
ref.listen en EditorScreen.initState → autosaveService.schedule()
  ↓
AutosaveService debounce 30s → projectRepository.autosaveProject()
```

---

## `ProjectSettings` — Configuración Estructurada

Compuesta de 8 subcategorías, todas inmutables con `copyWith`:
- `ProjectInfo` — nombre del proyecto
- `SnapSettings` — snap, tolerancias, ángulos
- `GridSettings` — cuadrícula visual
- `DefaultParameters` — grosor/altura/dimensiones por defecto + UnitSystem
- `VisualizationSettings` — labels, nodos, rooms, modo oscuro
- `EditorBehaviorSettings` — preview, lupa, autoRoom, confirmDelete
- `StorageSettings` — rutas por defecto de exportación
- `PrecisionSettings` — decimales de display y exportación

---

## Problemas Identificados

### CRÍTICO
- **`roomsProvider` ejecuta el grafo topológico O(n²) en cada cambio de `wallsProvider`:** No hay memoización. Si el usuario arrastra un handle (muchos cambios rápidos), el Room Engine se invoca a 60fps.
- **`validationProvider` depende de `currentProjectSnapshotProvider` que incluye todos los providers.** Esto significa que la validación (que corre `SolapamientoValidator` en O(n²)) también se ejecuta en cada cambio. Con 50 muros = 1225 comparaciones de intersección × 60fps durante drag.
- **`selectedObjectProvider` es `StateProvider<Object?>`.** El tipo `Object?` no tiene ningún contrato. Si algo pone un tipo no esperado en el provider, la UI crashea en runtime con `is Wall` fallando silenciosamente. Debería ser un sealed class o union type.

### MODERADO
- **`projectProvider` y `wallsProvider` están desacoplados:** El `Project` se usa solo para metadata (title, id) mientras que los datos geométricos viven en `wallsProvider`, `columnsProvider`, etc. Esto crea el doble trabajo de ensamblar `currentProjectSnapshotProvider` en cada guardado. La fuente de verdad está fragmentada.
- **`espaciosProvider` solo guarda nombres:** No hay datos BIM por espacio. Al cambiar de espacio activo, el canvas NO cambia de datos — todos los muros son del mismo espacio. El sistema de plantas está UI-only sin respaldo de datos.
- **`autosaveServiceProvider` es `autoDispose`.** Si el provider se destruye mientras el timer está pendiente (posible en Flutter), el timer se cancela sin guardar.
- **`DxfExporter` es un singleton con estado mutable (`_handleCounter`).** Si dos exportaciones corren concurrentemente (improbable pero posible), los handles se corrompen.

### MENOR
- Los providers de infraestructura (repository, exporters) no tienen override para tests. Para testear la capa de UI se necesitan mocks, pero no hay un punto limpio de inyección.
