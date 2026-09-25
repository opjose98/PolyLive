import 'package:vector_math/vector_math.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';

/// Servicio de aplicación responsable de determinar qué objeto BIM
/// está en un punto dado del canvas. Sin dependencias de Flutter — puro Dart.
class SelectionService {
  /// Retorna el Wall, ArchitecturalColumn o Room más cercano a [worldPoint].
  /// Prioridad: Wall > Column > Room.
  Object? hitTest({
    required Vector2 worldPoint,
    required List<Wall> walls,
    required List<Room> rooms,
    required List<ArchitecturalColumn> columns,
    required double thresholdMeters,
  }) {
    // 1. Muro más cercano
    Wall? nearestWall;
    double minDist = thresholdMeters;

    for (final wall in walls) {
      final dist = _distanceToSegment(
        worldPoint,
        wall.geometry.startPoint,
        wall.geometry.endPoint,
      );
      if (dist < minDist) {
        minDist = dist;
        nearestWall = wall;
      }
    }
    if (nearestWall != null) return nearestWall;

    // 2. Columna (circular o rectangular axis-aligned)
    for (final col in columns) {
      if (_hitsColumn(worldPoint, col, thresholdMeters)) return col;
    }

    // 3. Habitación (point-in-polygon usando polygon precalculado)
    for (final room in rooms) {
      if (room.polygon.length < 3) continue;
      if (PolygonUtils.isPointInPolygon(worldPoint, room.polygon)) return room;
    }

    return null;
  }

  bool _hitsColumn(Vector2 pt, ArchitecturalColumn col, double threshold) {
    if (col.isCircular) {
      return pt.distanceTo(col.position) < col.dimensionX / 2 + threshold;
    }
    final halfW = col.dimensionX / 2 + threshold;
    final halfH = col.dimensionY / 2 + threshold;
    return (pt.x - col.position.x).abs() < halfW &&
        (pt.y - col.position.y).abs() < halfH;
  }

  /// Hit-test sobre los handles de manipulación del objeto seleccionado.
  ///
  /// Handles de Wall: 0=inicio, 1=fin, 2=punto medio (mover todo)
  /// Handles de ArchitecturalColumn: 0=centro (mover)
  ///
  /// Retorna el índice del handle tocado, o null si ninguno.
  int? hitTestHandle({
    required Vector2 worldPoint,
    required Object selectedObject,
    required double thresholdMeters,
  }) {
    // Los handles son visualmente de 8px; usamos 12px de tolerancia táctil.
    final r = thresholdMeters * 1.5;

    if (selectedObject is Wall) {
      final start = selectedObject.geometry.startPoint;
      final end = selectedObject.geometry.endPoint;
      final mid = (start + end) * 0.5;

      if (worldPoint.distanceTo(start) < r) return 0;
      if (worldPoint.distanceTo(end) < r) return 1;
      if (worldPoint.distanceTo(mid) < r) return 2;
    }

    if (selectedObject is ArchitecturalColumn) {
      if (worldPoint.distanceTo(selectedObject.position) < r) return 0;
    }

    if (selectedObject is PhotoMarkerEntity) {
      final pos = Vector2(selectedObject.x, selectedObject.y);
      if (worldPoint.distanceTo(pos) < r) return 0;
    }

    return null;
  }

  /// Hit-test de PhotoMarkerEntity en planta.
  ///
  /// Retorna el primer marcador visible cuyo centro esté dentro de [thresholdMeters],
  /// o null si ninguno. Los marcadores ocultos se ignoran.
  PhotoMarkerEntity? hitTestMarker({
    required Vector2 worldPoint,
    required List<PhotoMarkerEntity> markers,
    required double thresholdMeters,
  }) {
    for (final marker in markers) {
      if (!marker.visible) continue;
      final pos = Vector2(marker.x, marker.y);
      if (worldPoint.distanceTo(pos) < thresholdMeters) return marker;
    }
    return null;
  }

  /// Delega a [PolygonUtils.distanceToSegment] para evitar duplicación.
  double _distanceToSegment(Vector2 p, Vector2 a, Vector2 b) =>
      PolygonUtils.distanceToSegment(p, a, b);

  /// Hit-test de WallOpenings en planta (plan-mode).
  ///
  /// Para cada WallElevation → localiza el muro host → para cada WallOpening:
  ///   computa la posición mundo del centro del opening a lo largo del muro,
  ///   y aplica un test AABB con buffer [thresholdMeters].
  ///
  /// Retorna el primer WallOpening tocado, o null.
  WallOpening? hitTestOpening({
    required Vector2 worldPoint,
    required List<WallElevation> wallElevations,
    required List<Wall> walls,
    required double thresholdMeters,
  }) {
    final wallById = {for (final w in walls) w.id: w};

    for (final elev in wallElevations) {
      final wall = wallById[elev.wallId];
      if (wall == null) { continue; }

      final s = wall.geometry.startPoint;
      final e = wall.geometry.endPoint;
      final len = s.distanceTo(e);
      if (len < 1e-9) { continue; }
      final dir = (e - s) / len;
      final halfThick = wall.thickness / 2 + thresholdMeters;

      for (final op in elev.openings) {
        // Proyección del worldPoint sobre el eje longitudinal del muro
        final proj = (worldPoint - s).dot(dir);
        // Distancia perpendicular al eje del muro
        final perpDist = ((worldPoint - s) - dir * proj).length;
        // Hit si el punto cae dentro del rango X del opening y del espesor del muro
        final inX = proj >= op.xOffset - thresholdMeters &&
            proj <= op.xEnd + thresholdMeters;
        final inPerp = perpDist <= halfThick;
        if (inX && inPerp) return op;
      }
    }
    return null;
  }

  /// Busca el nodo de snap más cercano entre los extremos de todos los muros.
  Vector2? findNearestNode({
    required Vector2 worldPoint,
    required List<Wall> walls,
    required double thresholdMeters,
  }) {
    Vector2? nearest;
    double minDist = thresholdMeters;

    for (final wall in walls) {
      for (final node in [wall.geometry.startPoint, wall.geometry.endPoint]) {
        final dist = worldPoint.distanceTo(node);
        if (dist < minDist) {
          minDist = dist;
          nearest = node;
        }
      }
    }

    return nearest;
  }
}
