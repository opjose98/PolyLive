import 'dart:async';
import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/core/geometry/topology/topology_graph.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/projects/domain/workspace_snapshot.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/features/rooms/application/detect_rooms_use_case.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/application/photo_capture_service.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/core/config/global_prefs_service.dart';
import 'package:levon/core/validators/validation_pipeline.dart';
import 'package:levon/persistence/project_repository.dart';
import 'package:levon/persistence/json_serializer.dart';
import 'package:levon/persistence/file_storage_service.dart';
import 'package:levon/persistence/levon_archive_service.dart';
import 'package:levon/persistence/autosave_service.dart';
import 'package:levon/export/dxf_exporter.dart';
import 'package:levon/export/ifc_export_adapter.dart';
import 'package:levon/export/ifc_exporter.dart';

// ─── EDITOR MODE ─────────────────────────────────────────────────────────────

/// Modo activo del editor.
/// - view: pan/zoom libre
/// - draw: creación de elementos
/// - select: selección + manipulación directa
/// - delete: tap para marcar y eliminar
enum EditorMode { view, draw, select, delete }

/// Modo de vista del editor: Planta (Planimetría) o Elevación de Muro.
enum EditorViewMode { plan, wallElevation }

enum DrawSubMode { wall, partition, column, door, window, opening, photo }

enum CreationMethod { drag, pointToPoint, circular, rectangular }

final editorModeProvider = StateProvider<EditorMode>(
  (ref) => EditorMode.view,
);

final editorViewModeProvider = StateProvider<EditorViewMode>(
  (ref) => EditorViewMode.plan,
);

final drawSubModeProvider = StateProvider<DrawSubMode>(
  (ref) => DrawSubMode.wall,
);

final creationMethodProvider = StateProvider<CreationMethod>(
  (ref) => CreationMethod.drag,
);

// ─── SELECTION ───────────────────────────────────────────────────────────────

/// Objeto seleccionado actualmente. Puede ser Wall, Room, ArchitecturalColumn,
/// WallOpening o PhotoMarkerEntity.
final selectedObjectProvider = StateProvider<Object?>(
  (ref) => null,
);

/// Controla si el panel de propiedades está visible (desktop).
final propertiesPanelVisibleProvider = StateProvider<bool>(
  (ref) => false,
);

/// Nodo actualmente manipulado (Drag). Índice del handle: 0=inicio, 1=fin, 2=medio.
final draggedNodeIndexProvider = StateProvider<int?>(
  (ref) => null,
);

// ─── PROJECT ─────────────────────────────────────────────────────────────────

final projectProvider = StateProvider<Project?>((ref) => null);

// ─── WALLS ───────────────────────────────────────────────────────────────────

class WallsNotifier extends StateNotifier<List<Wall>> {
  WallsNotifier() : super([]);

  void addWall(Wall wall) => state = [...state, wall];

  void removeWall(String id) => state = state.where((w) => w.id != id).toList();

  void updateWall(Wall updated) {
    state = [
      for (final w in state)
        if (w.id == updated.id) updated else w,
    ];
  }

  void setWalls(List<Wall> walls) => state = walls;
}

final wallsProvider = StateNotifierProvider<WallsNotifier, List<Wall>>(
  (ref) => WallsNotifier(),
);

// Doors y Windows eliminados como providers independientes (v2.1).
// WallOpening dentro de wallElevationsProvider es la entidad canónica.

// ─── PHOTO COLLECTIONS (SPDS) ─────────────────────────────────────────────────

class PhotoCollectionsNotifier extends StateNotifier<List<PhotoCollection>> {
  PhotoCollectionsNotifier() : super([]);

  void setCollections(List<PhotoCollection> collections) => state = collections;

  void addCollection(PhotoCollection collection) =>
      state = [...state, collection];

  void removeCollection(String collectionId) =>
      state = state.where((c) => c.id != collectionId).toList();

  void upsertCollection(PhotoCollection updated) {
    final exists = state.any((c) => c.id == updated.id);
    state = exists
        ? [for (final c in state) c.id == updated.id ? updated : c]
        : [...state, updated];
  }
}

final photoCollectionsProvider =
    StateNotifierProvider<PhotoCollectionsNotifier, List<PhotoCollection>>(
  (ref) => PhotoCollectionsNotifier(),
);

/// Servicio de captura fotográfica (cámara + galería + procesamiento).
final photoCaptureServiceProvider = Provider<PhotoCaptureService>(
  (ref) => PhotoCaptureService(),
);

/// ID de la colección seleccionada para la inserción de fotos en planta.
/// Null = usar la primera colección disponible.
final selectedPhotoCollectionIdProvider = StateProvider<String?>((ref) => null);

/// Fuente preferida para captura en modo inserción de fotos: 'camera' | 'gallery'.
final photoInsertSourceProvider = StateProvider<String>((ref) => 'camera');

/// True mientras hay un PhotoMarkerEntity pendiente de confirmación de posición.
final pendingMarkerPendingProvider = StateProvider<bool>((ref) => false);

/// Azimut (0–360°) del marcador pendiente, editable desde la ribbon antes de confirmar.
final pendingMarkerOrientationProvider = StateProvider<double>((ref) => 0.0);

// ─── PHOTO MARKERS ────────────────────────────────────────────────────────────

class PhotoMarkersNotifier extends StateNotifier<List<PhotoMarkerEntity>> {
  PhotoMarkersNotifier() : super([]);

  void setMarkers(List<PhotoMarkerEntity> markers) => state = markers;

  void addMarker(PhotoMarkerEntity marker) => state = [...state, marker];

  void removeMarker(String id) =>
      state = state.where((m) => m.id != id).toList();

  void updateMarker(PhotoMarkerEntity updated) {
    state = [for (final m in state) m.id == updated.id ? updated : m];
  }

  void removeMarkersForPhoto(String linkedPhotoId) =>
      state = state.where((m) => m.linkedPhotoId != linkedPhotoId).toList();
}

final photoMarkersProvider =
    StateNotifierProvider<PhotoMarkersNotifier, List<PhotoMarkerEntity>>(
  (ref) => PhotoMarkersNotifier(),
);

// ─── COLUMNS ─────────────────────────────────────────────────────────────────

class ColumnsNotifier extends StateNotifier<List<ArchitecturalColumn>> {
  ColumnsNotifier() : super([]);

  void addColumn(ArchitecturalColumn col) => state = [...state, col];
  void removeColumn(String id) =>
      state = state.where((c) => c.id != id).toList();
  void updateColumn(ArchitecturalColumn updated) {
    state = [
      for (final c in state)
        if (c.id == updated.id) updated else c,
    ];
  }

  void setColumns(List<ArchitecturalColumn> cols) => state = cols;
}

final columnsProvider =
    StateNotifierProvider<ColumnsNotifier, List<ArchitecturalColumn>>(
  (ref) => ColumnsNotifier(),
);

// ─── WALL ELEVATIONS (MEM) ───────────────────────────────────────────────────

class WallElevationsNotifier extends StateNotifier<List<WallElevation>> {
  WallElevationsNotifier() : super([]);

  static const _uc = EditWallElevationUseCase();

  void setElevations(List<WallElevation> elevations) => state = elevations;

  /// Obtiene la elevación de un muro, creando una por defecto si no existe.
  WallElevation getOrCreate(String wallId, double wallHeight) {
    return _uc.getOrCreate(wallId, wallHeight, state);
  }

  void upsertElevation(WallElevation elevation) {
    final exists = state.any((e) => e.wallId == elevation.wallId);
    state = exists
        ? [for (final e in state) if (e.wallId == elevation.wallId) elevation else e]
        : [...state, elevation];
  }

  void removeElevation(String wallId) {
    state = state.where((e) => e.wallId != wallId).toList();
  }

  void syncWithWalls(List<Wall> walls) {
    state = _uc.syncWithWalls(state, walls);
  }
}

final wallElevationsProvider =
    StateNotifierProvider<WallElevationsNotifier, List<WallElevation>>(
  (ref) => WallElevationsNotifier(),
);

/// ID del muro cuya elevación está abierta en el WEP. Null = WEP cerrado.
final activeElevationWallIdProvider = StateProvider<String?>((ref) => null);

// ─── TOPOLOGY GRAPH (DERIVADO) ────────────────────────────────────────────────

/// Grafo topológico de muros estructurales, reconstruido en cada cambio de muros.
///
/// Expone [TopologyGraph.adjacentWallIds] para Chain Mode (MEM) y ciclos de rooms.
/// Solo incluye muros estructurales (los mismos que usa [roomsProvider]).
final topologyGraphProvider = Provider<TopologyGraph?>((ref) {
  final walls = ref.watch(wallsProvider);
  final settings = ref.watch(projectSettingsProvider);
  final structural = walls.where((w) => w.isStructural).toList();
  if (structural.isEmpty) return null;
  final graph = TopologyGraph(
    snapTolerance: settings.snap.geometricSnapTolerance,
  );
  for (final wall in structural) {
    graph.addWall(wall);
  }
  return graph;
});

// ─── ROOMS (DERIVADO Y THROTTLED) ───────────────────────────────────────────

/// Notifier que gestiona la detección de habitaciones con throttling.
/// Evita recalcular O(n²) a 60fps durante el drag de muros.
class RoomsNotifier extends StateNotifier<List<Room>> {
  final Ref ref;
  Timer? _debounceTimer;

  RoomsNotifier(this.ref) : super([]) {
    _init();
  }

  void _init() {
    // Escuchar cambios en muros y configuración
    ref.listen<List<Wall>>(wallsProvider, (_, __) => _scheduleDetection());
    ref.listen<ProjectSettings>(projectSettingsProvider, (_, __) => _scheduleDetection());
    // Primera ejecución inmediata
    _runDetection();
  }

  void _scheduleDetection() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), _runDetection);
  }

  void _runDetection() {
    final walls = ref.read(wallsProvider);
    final settings = ref.read(projectSettingsProvider);
    final structural = walls.where((w) => w.isStructural).toList();
    if (structural.length < 3) {
      state = [];
      return;
    }
    state = const DetectRoomsUseCase().execute(
      structural,
      snapTolerance: settings.snap.geometricSnapTolerance,
    );
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}

/// Provider de habitaciones con debouncing de 300ms.
final roomsProvider = StateNotifierProvider<RoomsNotifier, List<Room>>((ref) {
  return RoomsNotifier(ref);
});

// ─── WORKSPACE SNAPSHOT (DERIVADO) ───────────────────────────────────────────

/// Snapshot inmutable del workspace actual. Usado por undo/redo antes de mutar.
///
/// Incluye muros, columnas y elevaciones para que el undo restaure completamente
/// el estado del espacio, incluyendo openings y niveles verticales.
final workspaceSnapshotProvider = Provider<WorkspaceSnapshot>((ref) {
  return WorkspaceSnapshot(
    walls: ref.watch(wallsProvider),
    columns: ref.watch(columnsProvider),
    wallElevations: ref.watch(wallElevationsProvider),
  );
});

// ─── VALIDATION (DERIVADO Y THROTTLED) ───────────────────────────────────────

class ValidationNotifier extends StateNotifier<List<ValidationIssue>> {
  final Ref ref;
  Timer? _debounceTimer;

  ValidationNotifier(this.ref) : super([]) {
    _init();
  }

  void _init() {
    ref.listen<Project?>(currentProjectSnapshotProvider, (_, __) => _scheduleValidation());
    _runValidation();
  }

  void _scheduleValidation() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 500), _runValidation);
  }

  void _runValidation() {
    final project = ref.read(currentProjectSnapshotProvider);
    if (project == null) {
      state = [];
      return;
    }
    state = ValidationPipeline().run(project);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}

/// Pipeline de validación con debouncing de 500ms para evitar lags en el editor.
final validationProvider = StateNotifierProvider<ValidationNotifier, List<ValidationIssue>>((ref) {
  return ValidationNotifier(ref);
});

// ─── CANVAS TRANSFORM ────────────────────────────────────────────────────────

/// Escala por defecto del canvas (píxeles por metro).
/// No se expone como provider para evitar rebuilds innecesarios a 60fps.
const double kDefaultCanvasScale = 60.0;
const Offset kDefaultCanvasPan = Offset.zero;

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

/// Servicio de archivo .levon (ZIP).
final levonArchiveServiceProvider = Provider<LevonArchiveService>(
  (ref) => LevonArchiveService(),
);

/// Repositorio de proyectos — gateway principal de persistencia.
final projectRepositoryProvider = Provider<ProjectRepository>((ref) {
  return ProjectRepository(
    serializer: JsonSerializer(),
    storage: FileStorageService(),
    archiveService: ref.read(levonArchiveServiceProvider),
  );
});

/// Lista de resúmenes de proyectos guardados en disco.
///
/// Carga sólo `metadata.json` de cada .levon para máximo rendimiento en el listado.
final projectsListProvider = FutureProvider<List<ProjectSummary>>((ref) async {
  return ref.read(projectRepositoryProvider).listProjects();
});

/// Query actual del buscador de proyectos. Cadena vacía = sin filtro.
final projectSearchQueryProvider = StateProvider<String>(
  (ref) => '',
);

/// Lista filtrada de proyectos según la query de búsqueda.
///
/// Filtra case-insensitive por nombre y por bimCode.
/// Si la query está vacía, retorna todos los proyectos.
final filteredProjectsProvider =
    Provider<AsyncValue<List<ProjectSummary>>>((ref) {
  final projectsAsync = ref.watch(projectsListProvider);
  final query = ref.watch(projectSearchQueryProvider).trim().toLowerCase();

  return projectsAsync.whenData((projects) {
    if (query.isEmpty) return projects;
    return projects.where((p) {
      final matchTitle = p.title.toLowerCase().contains(query);
      final matchCode = p.bimCode?.toLowerCase().contains(query) ?? false;
      return matchTitle || matchCode;
    }).toList();
  });
});

/// Carga un proyecto completo desde disco por su ID.
final projectByIdProvider =
    FutureProvider.family<Project, String>((ref, projectId) async {
  return ref.read(projectRepositoryProvider).loadProject(projectId);
});

// ─── AUTOSAVE ─────────────────────────────────────────────────────────────────

/// Servicio de guardado automático con debounce de 30 segundos.
///
/// Se activa automáticamente cuando [currentProjectSnapshotProvider] cambia.
/// Ver integración en EditorScreen vía ref.listen.
final autosaveServiceProvider = Provider.autoDispose<AutosaveService>((ref) {
  final service = AutosaveService();
  ref.onDispose(service.dispose);
  return service;
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

final dxfExporterProvider = Provider<DxfExporter>((ref) {
  return DxfExporter(storage: FileStorageService());
});

final ifcExportAdapterProvider = Provider<IfcExportAdapter>((ref) {
  return IfcExportAdapter(storage: FileStorageService());
});

final ifcExporterProvider = Provider<IfcExporter>((ref) {
  return IfcExporter();
});

// ─── SAVE STATUS ──────────────────────────────────────────────────────────────

enum SaveStatus { idle, saving, saved, error }

final saveStatusProvider = StateProvider<SaveStatus>(
  (_) => SaveStatus.idle,
);

// ─── CURRENT PROJECT SNAPSHOT ─────────────────────────────────────────────────

/// Ensambla el [Project] completo desde el estado vivo del editor.
///
/// ID del espacio activo en el editor (Storey/Level).
final activeSpaceIdProvider = StateProvider<String>((ref) => 'ground');

/// Captura el estado actual del proyecto integrando los datos de todos los providers.
///
/// Es el objeto que se pasa a [ProjectRepository.saveProject] y
/// a [AutosaveService.schedule]. Null cuando no hay proyecto abierto.
final currentProjectSnapshotProvider = Provider<Project?>((ref) {
  final project = ref.watch(projectProvider);
  if (project == null) return null;
  
  final spaceId = ref.watch(activeSpaceIdProvider);
  
  // Construir la geometría actualizada para el espacio activo
  final updatedSpace = SpaceGeometry(
    id: spaceId,
    name: project.spaces[spaceId]?.name ?? 'Espacio',
    walls: ref.watch(wallsProvider),
    columns: ref.watch(columnsProvider),
    wallElevations: ref.watch(wallElevationsProvider),
    rooms: ref.watch(roomsProvider),
  );

  return project
      .updateSpace(spaceId, updatedSpace)
      .copyWith(
        photoCollections: ref.watch(photoCollectionsProvider),
        photoMarkers: ref.watch(photoMarkersProvider),
      );
});

// ─── GLOBAL PREFS ────────────────────────────────────────────────────────────

/// Servicio de preferencias globales (rutas por defecto, última carpeta usada).
/// Instancia única compartida por toda la aplicación.
final globalPrefsServiceProvider = Provider<GlobalPrefsService>(
  (ref) => GlobalPrefsService(),
);

/// Última ruta de exportación resuelta.
/// Combina "última carpeta usada" + "carpeta por defecto" con orden de prioridad.
/// Usado para pre-seleccionar la carpeta en el FilePicker al exportar.
final resolvedExportPathProvider = FutureProvider<String?>((ref) {
  return ref.read(globalPrefsServiceProvider).resolveExportPath();
});
