import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/topology/topology_edge.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';
import 'package:levon/core/geometry/polygons/polygon_validator.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/rooms/domain/room.dart';

/// Genera entidades [Room] a partir de los ciclos detectados por [TopologyGraph].
///
/// Cada ciclo pasa por [PolygonValidator]; los inválidos se descartan silenciosamente.
/// Los polígonos resultantes son CW normalizados con área y centroide precalculados.
class RoomGenerator {
  final PolygonValidator _validator;

  const RoomGenerator({
    PolygonValidator validator = const PolygonValidator(),
  }) : _validator = validator;

  /// Convierte [cycles] en [Room]s válidas.
  ///
  /// [cycles] proviene de [TopologyGraph.findMinimalCycles()].
  /// Cada tupla contiene las aristas del ciclo y los IDs de nodo "from" en orden
  /// de traversía — necesarios para extraer vértices en la dirección correcta.
  /// El outer face ya fue descartado por el grafo.
  List<Room> generate(List<(List<TopologyEdge>, List<String>)> cycles) {
    final rooms = <Room>[];
    for (final (cycle, fromNodeIds) in cycles) {
      final vertices = _extractVertices(cycle, fromNodeIds);
      final result = _validator.validate(vertices);
      if (result is PolygonInvalid) continue;

      final v = (result as PolygonValid).vertices;
      // ignore: deprecated_member_use
      rooms.add(Room(
        polygon: v,
        boundaryWallIds: cycle.map((e) => e.sourceWall.id).toList(),
        area: PolygonUtils.area(v),
        centroid: PolygonUtils.centroid(v),
        metadata: RoomMetadata(
          name: 'Habitación ${rooms.length + 1}',
          detectedAt: DateTime.now(),
        ),
        boundary: cycle.map((e) => e.sourceWall).toList(),
      ));
    }
    return rooms;
  }

  /// Extrae la lista de vértices del ciclo en el orden correcto de traversía.
  ///
  /// [fromNodeIds[i]] indica desde qué nodo se atraviesa [cycle[i]].
  /// Comparando con [TopologyEdge.startNodeId] se determina si la arista se
  /// recorre en dirección forward (startPoint) o reverse (endPoint).
  ///
  /// Para [ArcShape]: se incluyen todos los puntos de aproximación excepto el
  /// último (que coincide con el startPoint de la siguiente arista). Si la
  /// traversía es en dirección inversa, se invierte la secuencia.
  List<Vector2> _extractVertices(
      List<TopologyEdge> cycle, List<String> fromNodeIds) {
    final vertices = <Vector2>[];
    for (int i = 0; i < cycle.length; i++) {
      final edge = cycle[i];
      final forward = fromNodeIds[i] == edge.startNodeId;
      final shape = edge.sourceWall.geometry;

      if (shape is ArcShape) {
        final arcPoints = PolygonUtils.approximateArc(shape, segments: 24);
        if (forward) {
          vertices.addAll(arcPoints.take(arcPoints.length - 1));
        } else {
          vertices.addAll(arcPoints.reversed.skip(1));
        }
      } else {
        vertices.add(forward ? shape.startPoint : shape.endPoint);
      }
    }
    return vertices;
  }
}
