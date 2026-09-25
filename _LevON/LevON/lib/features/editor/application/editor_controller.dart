import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/features/editor/application/selection_service.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/history_notifier.dart';
import 'package:levon/shared/state/project_settings.dart';

/// Orquesta la lógica del editor: dibujo, selección, manipulación, undo/redo.
/// La UI solo llama métodos de este controller; nunca ejecuta lógica de negocio.
class EditorController {
  final WidgetRef _ref;
  final SelectionService _selectionService;

  static const double _kSnapNodeThresholdPx = 24.0;
  static const double _kSelectThresholdPx = 20.0;
  static const double _kHandleThresholdPx = 16.0;
  static const double _kMinWallLength = 0.1;

  Vector2? _lastSnappedNode;

  // ── Manipulación directa ────────────────────────────────────────────────────
  Object? _manipulationOriginal;
  int? _activeHandleIndex;

  EditorController(this._ref) : _selectionService = SelectionService();

  // ── SNAP ──────────────────────────────────────────────────────────────────

  /// Aplica snap al punto [worldPt] según la configuración activa:
  /// snap a nodo, snap angular (desde [drawFrom]) y snap a grid.
  Vector2 snap(Vector2 worldPt, double scale, {Vector2? drawFrom}) {
    final settings = _ref.read(projectSettingsProvider);
    final walls = _ref.read(wallsProvider);

    // 1. Snap a nodos existentes
    if (settings.snap.snapToNodes) {
      final thresholdMeters = _kSnapNodeThresholdPx / scale;
      final node = _selectionService.findNearestNode(
        worldPoint: worldPt,
        walls: walls,
        thresholdMeters: thresholdMeters,
      );
      if (node != null) {
        if (_lastSnappedNode != node) {
          HapticFeedback.lightImpact();
          _lastSnappedNode = node;
        }
        return node;
      }
    }

    _lastSnappedNode = null;

    // 2. Snap angular desde el punto de inicio del trazo
    if (settings.snap.angleSnapping && drawFrom != null) {
      final snapped =
          _snapAngle(worldPt, drawFrom, settings.snap.snapAngleStepDegrees);
      // Aplicar grid sobre el punto angulado si también está activo
      if (settings.snap.snapToGrid) {
        final g = settings.grid.gridSize;
        return Vector2(
            (snapped.x / g).round() * g, (snapped.y / g).round() * g);
      }
      return snapped;
    }

    // 3. Snap a grid
    if (settings.snap.snapToGrid) {
      final g = settings.grid.gridSize;
      return Vector2(
        (worldPt.x / g).round() * g,
        (worldPt.y / g).round() * g,
      );
    }

    return worldPt;
  }

  /// Ajusta la dirección desde [from] hasta [worldPt] al múltiplo más cercano de [stepDegrees].
  Vector2 _snapAngle(Vector2 worldPt, Vector2 from, int stepDegrees) {
    final dx = worldPt.x - from.x;
    final dy = worldPt.y - from.y;
    final len = sqrt(dx * dx + dy * dy);
    if (len < 0.001) return worldPt;

    final stepRad = stepDegrees * pi / 180.0;
    final angle = atan2(dy, dx);
    final snappedAngle = (angle / stepRad).round() * stepRad;

    return Vector2(
      from.x + len * cos(snappedAngle),
      from.y + len * sin(snappedAngle),
    );
  }

  // ── DIBUJO ────────────────────────────────────────────────────────────────

  /// Crea el elemento correspondiente al submode activo usando los parámetros
  /// predeterminados definidos en [ProjectSettings.defaults].
  Object? commitDrawing(Vector2 start, Vector2 end) {
    final subMode = _ref.read(drawSubModeProvider);
    final method = _ref.read(creationMethodProvider);
    final settings = _ref.read(projectSettingsProvider);

    _ref.read(historyProvider.notifier).record(
          _ref.read(workspaceSnapshotProvider),
        );

    if (subMode == DrawSubMode.wall || subMode == DrawSubMode.partition) {
      if (start.distanceTo(end) < _kMinWallLength) return null;

      final wall = Wall(
        geometry: LineShape(start, end),
        thickness: settings.defaults.wallThickness,
        height: settings.defaults.wallHeight,
        material: 'Generic',
        isStructural: subMode == DrawSubMode.wall,
      );
      _ref.read(wallsProvider.notifier).addWall(wall);
      HapticFeedback.lightImpact();
      return wall;
    }

    if (subMode == DrawSubMode.column) {
      final isCircular = method == CreationMethod.circular;
      final col = ArchitecturalColumn(
        position: end,
        shape: isCircular ? ColumnShape.circular : ColumnShape.rectangular,
        dimensionX: settings.defaults.columnWidth,
        dimensionY: isCircular ? 0.0 : settings.defaults.columnDepth,
        height: settings.defaults.wallHeight,
        material: 'Concrete',
      );
      _ref.read(columnsProvider.notifier).addColumn(col);
      HapticFeedback.lightImpact();
      return col;
    }

    return null;
  }

  // ── SELECCIÓN ─────────────────────────────────────────────────────────────

  /// Realiza hit-test sobre todos los elementos en el punto [worldPt].
  ///
  /// Prioridad: Wall > Column > Room > WallOpening > PhotoMarkerEntity.
  /// [includeRooms]: false en modo eliminar (las habitaciones son derivadas y no
  /// pueden ser eliminadas directamente; incluirlas genera un fallo silencioso).
  Object? _hitTestAll(
    Vector2 worldPt,
    double scale, {
    bool includeRooms = true,
  }) {
    final walls = _ref.read(wallsProvider);
    final rooms = includeRooms ? _ref.read(roomsProvider) : const <Room>[];
    final columns = _ref.read(columnsProvider);
    final wallElevations = _ref.read(wallElevationsProvider);
    final markers = _ref.read(photoMarkersProvider);
    final thresholdMeters = _kSelectThresholdPx / scale;

    Object? hit = _selectionService.hitTest(
      worldPoint: worldPt,
      walls: walls,
      rooms: rooms,
      columns: columns,
      thresholdMeters: thresholdMeters,
    );

    hit ??= _selectionService.hitTestOpening(
      worldPoint: worldPt,
      wallElevations: wallElevations,
      walls: walls,
      thresholdMeters: thresholdMeters,
    );

    hit ??= _selectionService.hitTestMarker(
      worldPoint: worldPt,
      markers: markers,
      thresholdMeters: thresholdMeters,
    );

    return hit;
  }

  /// Realiza hit-test y selecciona el elemento tocado.
  /// NO abre el panel de propiedades automáticamente (se abre con long press).
  Object? handleTap(Vector2 worldPt, double scale) {
    final hit = _hitTestAll(worldPt, scale);
    _ref.read(selectedObjectProvider.notifier).state = hit;
    if (hit != null) HapticFeedback.selectionClick();
    return hit;
  }

  /// Realiza hit-test en modo eliminar.
  ///
  /// Excluye [Room] del resultado: las habitaciones son estado derivado y
  /// no se pueden eliminar directamente (se regeneran desde los muros).
  /// Incluir rooms en delete causaría un fallo silencioso en [deleteSelected].
  Object? handleTapForDelete(Vector2 worldPt, double scale) {
    final hit = _hitTestAll(worldPt, scale, includeRooms: false);
    if (hit != null) {
      _ref.read(selectedObjectProvider.notifier).state = hit;
      HapticFeedback.heavyImpact();
    }
    return hit;
  }

  void clearSelection() {
    _ref.read(selectedObjectProvider.notifier).state = null;
    _ref.read(propertiesPanelVisibleProvider.notifier).state = false;
  }

  // ── MANIPULACIÓN DIRECTA ──────────────────────────────────────────────────

  bool startManipulation(Vector2 worldPt, double scale) {
    final selected = _ref.read(selectedObjectProvider);
    if (selected == null) return false;

    final thresholdMeters = _kHandleThresholdPx / scale;
    final handleIdx = _selectionService.hitTestHandle(
      worldPoint: worldPt,
      selectedObject: selected,
      thresholdMeters: thresholdMeters,
    );
    if (handleIdx == null) return false;

    _ref.read(historyProvider.notifier).record(
          _ref.read(workspaceSnapshotProvider),
        );

    _manipulationOriginal = selected;
    _activeHandleIndex = handleIdx;

    _ref.read(draggedNodeIndexProvider.notifier).state = handleIdx;
    HapticFeedback.selectionClick();
    return true;
  }

  void updateManipulation(Vector2 worldPt, double scale) {
    final original = _manipulationOriginal;
    final handle = _activeHandleIndex;
    if (original == null || handle == null) return;

    final snapped = snap(worldPt, scale);

    if (original is Wall) {
      final Wall updated;
      switch (handle) {
        case 0:
          updated = original.copyWith(
              geometry: LineShape(snapped, original.geometry.endPoint));
        case 1:
          updated = original.copyWith(
              geometry: LineShape(original.geometry.startPoint, snapped));
        default:
          final delta = snapped -
              (original.geometry.startPoint + original.geometry.endPoint) * 0.5;
          updated = original.copyWith(
            geometry: LineShape(
              original.geometry.startPoint + delta,
              original.geometry.endPoint + delta,
            ),
          );
      }
      _ref.read(wallsProvider.notifier).updateWall(updated);
      _ref.read(selectedObjectProvider.notifier).state = updated;
    }

    if (original is ArchitecturalColumn) {
      final updated = original.copyWith(position: snapped);
      _ref.read(columnsProvider.notifier).updateColumn(updated);
      _ref.read(selectedObjectProvider.notifier).state = updated;
    }

    if (original is PhotoMarkerEntity) {
      final updated = original.copyWith(x: snapped.x, y: snapped.y);
      _ref.read(photoMarkersProvider.notifier).updateMarker(updated);
      _ref.read(selectedObjectProvider.notifier).state = updated;
    }
  }

  void commitManipulation() {
    _manipulationOriginal = null;
    _activeHandleIndex = null;
    _ref.read(draggedNodeIndexProvider.notifier).state = null;
    HapticFeedback.lightImpact();
  }

  // ── ELIMINAR ──────────────────────────────────────────────────────────────

  void deleteSelected() {
    final selected = _ref.read(selectedObjectProvider);
    if (selected == null) return;

    _ref.read(historyProvider.notifier).record(
          _ref.read(workspaceSnapshotProvider),
        );

    if (selected is Wall) {
      _ref.read(wallsProvider.notifier).removeWall(selected.id);
    } else if (selected is ArchitecturalColumn) {
      _ref.read(columnsProvider.notifier).removeColumn(selected.id);
    } else if (selected is WallOpening) {
      // Funciona en ambos modos: buscar la elevación que contiene el opening
      final elevations = _ref.read(wallElevationsProvider);
      final elev = elevations
          .where((e) => e.openings.any((o) => o.id == selected.id))
          .firstOrNull;
      if (elev != null) {
        const uc = EditWallElevationUseCase();
        _ref.read(wallElevationsProvider.notifier).upsertElevation(
              uc.removeOpening(elev, selected.id),
            );
      }
    } else if (selected is PhotoMarkerEntity) {
      _ref.read(photoMarkersProvider.notifier).removeMarker(selected.id);
    }
    clearSelection();
    HapticFeedback.heavyImpact();
  }

  // ── UNDO / REDO ───────────────────────────────────────────────────────────

  void undo() {
    final current = _ref.read(workspaceSnapshotProvider);
    final prev = _ref.read(historyProvider.notifier).undo(current);
    if (prev == null) return;

    _ref.read(wallsProvider.notifier).setWalls(prev.walls);
    _ref.read(columnsProvider.notifier).setColumns(prev.columns);
    _ref.read(wallElevationsProvider.notifier).setElevations(prev.wallElevations);
    clearSelection();
    HapticFeedback.lightImpact();
  }

  void redo() {
    final current = _ref.read(workspaceSnapshotProvider);
    final next = _ref.read(historyProvider.notifier).redo(current);
    if (next == null) return;

    _ref.read(wallsProvider.notifier).setWalls(next.walls);
    _ref.read(columnsProvider.notifier).setColumns(next.columns);
    _ref.read(wallElevationsProvider.notifier).setElevations(next.wallElevations);
    clearSelection();
    HapticFeedback.lightImpact();
  }

  // ── MODO ──────────────────────────────────────────────────────────────────

  void switchMode(EditorMode mode) {
    _ref.read(editorModeProvider.notifier).state = mode;
    if (mode != EditorMode.select) clearSelection();
    HapticFeedback.selectionClick();
  }
}
