import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/topology/topology_node.dart';
import 'package:levon/core/geometry/topology/topology_edge.dart';
import 'package:levon/core/geometry/spatial/spatial_hash.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/shared/domain/shapes.dart';

/// Grafo topológico que modela la conectividad de muros BIM.
///
/// Construye un grafo de nodos y aristas desde [Wall]s. Los nodos que estén
/// a distancia < [snapTolerance] se fusionan automáticamente.
///
/// Edge splitting: si el endpoint de un nuevo muro cae sobre el interior de
/// una arista de tipo [GeometryType.line] existente, esa arista se divide en
/// dos. Esto garantiza que las particiones y muros se unan topológicamente
/// cuando uno termina en el punto medio del otro.
///
/// La detección de ciclos mínimos usa el algoritmo de traversía de caras
/// planares (rotation system + leftmost-turn), que garantiza O(n) por cara.
class TopologyGraph {
  /// Tolerancia de fusión de nodos en metros (world-space).
  final double snapTolerance;

  final Map<String, TopologyNode> _nodes = {};
  final Map<String, TopologyEdge> _edges = {};
  late final SpatialHash<String> _spatialHash;

  /// Límite de aristas por ciclo para evitar bucles infinitos en grafos degenerados.
  static const int _kMaxCycleLength = 200;

  TopologyGraph({this.snapTolerance = 0.05}) {
    _spatialHash = SpatialHash(cellSize: snapTolerance * 2);
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /// Agrega un [wall] al grafo, creando o reutilizando nodos según [snapTolerance].
  ///
  /// Si el endpoint del muro cae sobre el interior de una arista [GeometryType.line]
  /// existente, esa arista se divide en dos (edge splitting).
  void addWall(Wall wall) {
    final startNode = _getOrCreateNode(wall.geometry.startPoint);
    _splitEdgesAt(startNode);

    final endNode = _getOrCreateNode(wall.geometry.endPoint);
    _splitEdgesAt(endNode);

    // Muro degenerado: inicio y fin son el mismo nodo
    if (startNode.id == endNode.id) return;

    // Evitar aristas paralelas entre los mismos dos nodos
    if (_edgeExists(startNode.id, endNode.id)) return;

    final edge = TopologyEdge.fromWall(
      wall: wall,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
    );

    _edges[edge.id] = edge;
    startNode.connectedEdgeIds.add(edge.id);
    endNode.connectedEdgeIds.add(edge.id);
  }

  /// Detecta todos los ciclos mínimos cerrados formados únicamente por aristas
  /// de tipo [EdgeObjectType.wall].
  ///
  /// Retorna tuplas (aristas del ciclo, IDs de nodos "from" en orden de traversía).
  /// El campo fromNodeIds[i] es el nodo desde el que se atraviesa cycle[i],
  /// necesario para determinar la dirección de cada arista en [RoomGenerator].
  ///
  /// Usa traversía de caras planares (DCEL half-edge rotation system).
  /// El outer face (ciclo con mayor área) se descarta antes de retornar.
  List<(List<TopologyEdge>, List<String>)> findMinimalCycles() {
    final wallEdges = _edges.values
        .where((e) => e.objectType == EdgeObjectType.wall)
        .toList();
    if (wallEdges.length < 2) return [];

    // Calcular y ordenar ángulos de salida por nodo (rotation system)
    final outAngles = _buildRotationSystem(wallEdges);

    final visitedHalfEdges = <String>{};
    final rawCycles = <(List<TopologyEdge>, List<String>)>[];

    for (final startEdge in wallEdges) {
      for (final startFrom in [startEdge.startNodeId, startEdge.endNodeId]) {
        if (visitedHalfEdges.contains('${startEdge.id}_$startFrom')) continue;

        final cycleEdges = <TopologyEdge>[];
        final cycleNodeIds = <String>[];
        String curEdgeId = startEdge.id;
        String curFrom = startFrom;
        bool closed = false;

        for (int step = 0; step < _kMaxCycleLength; step++) {
          final key = '${curEdgeId}_$curFrom';
          if (visitedHalfEdges.contains(key)) {
            closed = step > 0;
            break;
          }
          visitedHalfEdges.add(key);

          final curEdge = _edges[curEdgeId]!;
          cycleEdges.add(curEdge);
          cycleNodeIds.add(curFrom);

          final toNode = curEdge.otherNodeId(curFrom);
          final next = _nextHalfEdge(toNode, curEdgeId, outAngles);
          if (next == null) break;

          curEdgeId = next;
          curFrom = toNode;
        }

        if (closed && cycleEdges.length >= 3) {
          rawCycles.add((cycleEdges, cycleNodeIds));
        }
      }
    }

    if (rawCycles.isEmpty) return [];
    if (rawCycles.length == 1) return [rawCycles[0]];

    // Filtrar outer face: descartar el ciclo con mayor área absoluta.
    // En planos BIM convexos esta heurística es siempre correcta.
    double maxArea = -1;
    int outerIdx = 0;
    for (int i = 0; i < rawCycles.length; i++) {
      final verts = rawCycles[i].$2.map((id) => _nodes[id]!.position).toList();
      final a = PolygonUtils.signedArea(verts).abs();
      if (a > maxArea) {
        maxArea = a;
        outerIdx = i;
      }
    }

    return [
      for (int i = 0; i < rawCycles.length; i++)
        if (i != outerIdx) rawCycles[i],
    ];
  }

  // ── Internos — gestión de nodos ────────────────────────────────────────────

  TopologyNode _getOrCreateNode(Vector2 position) {
    for (final nodeId in _spatialHash.queryNeighbors(position)) {
      final node = _nodes[nodeId]!;
      if (node.position.distanceTo(position) < snapTolerance) return node;
    }
    final node = TopologyNode(position: position);
    _nodes[node.id] = node;
    _spatialHash.insert(position, node.id);
    return node;
  }

  bool _edgeExists(String nodeId1, String nodeId2) {
    final node = _nodes[nodeId1];
    if (node == null) return false;
    for (final edgeId in node.connectedEdgeIds) {
      final e = _edges[edgeId];
      if (e != null &&
          ((e.startNodeId == nodeId1 && e.endNodeId == nodeId2) ||
              (e.startNodeId == nodeId2 && e.endNodeId == nodeId1))) {
        return true;
      }
    }
    return false;
  }

  // ── Internos — edge splitting ──────────────────────────────────────────────

  /// Si [node] cae sobre el interior de alguna arista [GeometryType.line]
  /// existente (a distancia < [snapTolerance] y sin ser extremo), divide esa
  /// arista en dos aristas que comparten [node] como nodo intermedio.
  ///
  /// Solo se divide la primera arista encontrada: un nodo no puede caer
  /// simultáneamente sobre dos aristas no adyacentes en un grafo planar válido.
  void _splitEdgesAt(TopologyNode node) {
    for (final edgeId in List.of(_edges.keys)) {
      final edge = _edges[edgeId];
      if (edge == null) continue;
      // Solo segmentos rectos en Alpha; los arcos requieren subdivisión angular.
      if (edge.geometryType != GeometryType.line) continue;
      if (edge.startNodeId == node.id || edge.endNodeId == node.id) continue;

      final a = _nodes[edge.startNodeId]!.position;
      final b = _nodes[edge.endNodeId]!.position;
      if (_distanceToSegment(node.position, a, b) >= snapTolerance) continue;

      _splitEdge(edgeId, node);
      break;
    }
  }

  /// Divide [edgeId] en dos aristas usando [midNode] como punto intermedio.
  void _splitEdge(String edgeId, TopologyNode midNode) {
    final edge = _edges[edgeId]!;
    final startNode = _nodes[edge.startNodeId]!;
    final endNode = _nodes[edge.endNodeId]!;

    _removeEdge(edgeId);

    final baseWall = edge.sourceWall;

    final wall1 = baseWall.copyWith(
      geometry: LineShape(startNode.position, midNode.position),
    );
    final e1 = TopologyEdge(
      startNodeId: startNode.id,
      endNodeId: midNode.id,
      geometryType: GeometryType.line,
      objectType: edge.objectType,
      sourceWall: wall1,
    );
    _edges[e1.id] = e1;
    startNode.connectedEdgeIds.add(e1.id);
    midNode.connectedEdgeIds.add(e1.id);

    final wall2 = baseWall.copyWith(
      geometry: LineShape(midNode.position, endNode.position),
    );
    final e2 = TopologyEdge(
      startNodeId: midNode.id,
      endNodeId: endNode.id,
      geometryType: GeometryType.line,
      objectType: edge.objectType,
      sourceWall: wall2,
    );
    _edges[e2.id] = e2;
    midNode.connectedEdgeIds.add(e2.id);
    endNode.connectedEdgeIds.add(e2.id);
  }

  /// Elimina [edgeId] del grafo y limpia las referencias en sus nodos extremos.
  void _removeEdge(String edgeId) {
    final edge = _edges.remove(edgeId);
    if (edge == null) return;
    _nodes[edge.startNodeId]?.connectedEdgeIds.remove(edgeId);
    _nodes[edge.endNodeId]?.connectedEdgeIds.remove(edgeId);
  }

  /// Distancia mínima entre el punto [p] y el segmento [a]-[b].
  double _distanceToSegment(Vector2 p, Vector2 a, Vector2 b) {
    final ab = b - a;
    final ap = p - a;
    final lenSq = ab.dot(ab);
    if (lenSq < 1e-12) return p.distanceTo(a);
    final t = (ap.dot(ab) / lenSq).clamp(0.0, 1.0);
    return p.distanceTo(a + ab * t);
  }

  // ── Internos — rotation system ─────────────────────────────────────────────

  /// Construye el sistema de rotación: por cada nodo, lista de (ángulo, edgeId)
  /// ordenada ascendente por ángulo de salida hacia el nodo opuesto.
  Map<String, List<(double, String)>> _buildRotationSystem(
      List<TopologyEdge> wallEdges) {
    final outAngles = <String, List<(double, String)>>{};
    for (final edge in wallEdges) {
      for (final nodeId in [edge.startNodeId, edge.endNodeId]) {
        outAngles.putIfAbsent(nodeId, () => []);
        outAngles[nodeId]!.add((_angleFromNode(nodeId, edge.id), edge.id));
      }
    }
    for (final list in outAngles.values) {
      list.sort((a, b) => a.$1.compareTo(b.$1));
    }
    return outAngles;
  }

  /// Dado que llegamos a [toNode] atravesando [incomingEdgeId], retorna el ID
  /// de la siguiente arista en la traversía de la cara mínima (leftmost turn).
  ///
  /// Algoritmo: en el sistema de rotación de [toNode], encontrar [incomingEdgeId]
  /// (que sale de [toNode] hacia el nodo de origen = reverse/twin) y tomar
  /// su predecesor en orden CCW = sucesor en orden CW.
  String? _nextHalfEdge(String toNode, String incomingEdgeId,
      Map<String, List<(double, String)>> outAngles) {
    final angles = outAngles[toNode];
    if (angles == null || angles.length < 2) return null;

    final idx = angles.indexWhere((t) => t.$2 == incomingEdgeId);
    if (idx < 0) return null;

    final n = angles.length;
    return angles[(idx - 1 + n) % n].$2;
  }

  /// Ángulo en radianes desde [nodeId] hacia el nodo opuesto de [edgeId].
  double _angleFromNode(String nodeId, String edgeId) {
    final edge = _edges[edgeId]!;
    final node = _nodes[nodeId]!;
    final other = _nodes[edge.otherNodeId(nodeId)]!;
    return math.atan2(
      other.position.y - node.position.y,
      other.position.x - node.position.x,
    );
  }

  // ── API de adyacencia (Chain Mode / MEM) ──────────────────────────────────

  /// Retorna los IDs de muros que comparten al menos un nodo con [wall].
  ///
  /// Requiere que [wall] haya sido agregado al grafo con [addWall].
  /// Considera edge splitting: si un muro fue dividido, todos sus fragmentos
  /// tienen el mismo [sourceWall.id] y se tratan como el mismo muro.
  ///
  /// Usado por ChainMode para propagar cambios de coronación a muros vecinos.
  Set<String> adjacentWallIds(Wall wall) {
    // Recopilar todos los nodos a los que pertenecen aristas de este muro
    final wallNodeIds = <String>{};
    for (final edge in _edges.values) {
      if (edge.sourceWall.id == wall.id) {
        wallNodeIds.add(edge.startNodeId);
        wallNodeIds.add(edge.endNodeId);
      }
    }

    // Para cada nodo, recopilar IDs de los demás muros conectados
    final adj = <String>{};
    for (final nodeId in wallNodeIds) {
      final node = _nodes[nodeId];
      if (node == null) continue;
      for (final edgeId in node.connectedEdgeIds) {
        final edge = _edges[edgeId];
        if (edge != null && edge.sourceWall.id != wall.id) {
          adj.add(edge.sourceWall.id);
        }
      }
    }
    return adj;
  }

  /// Mapa global wallId → conjunto de wallIds adyacentes.
  ///
  /// Útil para propagar Chain Mode a todos los muros del grafo de una sola pasada.
  Map<String, Set<String>> wallAdjacencyMap() {
    final nodeToWalls = <String, Set<String>>{};
    for (final edge in _edges.values) {
      final wallId = edge.sourceWall.id;
      nodeToWalls.putIfAbsent(edge.startNodeId, () => {}).add(wallId);
      nodeToWalls.putIfAbsent(edge.endNodeId, () => {}).add(wallId);
    }

    final adjacency = <String, Set<String>>{};
    for (final wallIds in nodeToWalls.values) {
      if (wallIds.length < 2) continue;
      for (final a in wallIds) {
        for (final b in wallIds) {
          if (a != b) adjacency.putIfAbsent(a, () => {}).add(b);
        }
      }
    }
    return adjacency;
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────

  int get nodeCount => _nodes.length;
  int get edgeCount => _edges.length;
}
