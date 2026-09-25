import 'package:uuid/uuid.dart';
import 'package:vector_math/vector_math.dart';

/// Nodo del grafo topológico con identidad propia.
///
/// Representa un punto de conexión donde uno o más muros convergen.
/// Las aristas se referencian por ID para permitir lookup en Map<String, TopologyEdge>
/// y evitar ciclos de referencia entre objetos.
///
/// Dos nodos se consideran el mismo punto si su distancia es menor que la
/// [snapTolerance] del [TopologyGraph] — la comparación la hace el grafo
/// mediante [SpatialHash], no este objeto.
class TopologyNode {
  /// Identificador único del nodo.
  final String id;

  /// Posición del nodo en coordenadas mundo (metros).
  final Vector2 position;

  /// IDs de las [TopologyEdge]s conectadas a este nodo.
  /// Mutable durante la construcción del grafo; no modificar externamente.
  final List<String> connectedEdgeIds;

  TopologyNode({
    String? id,
    required this.position,
  })  : id = id ?? const Uuid().v4(),
        connectedEdgeIds = [];

  /// Clave determinista para conjuntos visitados en el algoritmo de ciclos.
  ///
  /// Resolución de 0.1 mm (10000 unidades/metro) — suficiente para BIM
  /// arquitectónico donde la precisión requerida es 1 mm.
  /// Independiente del [id] UUID, útil para depuración y claves de aristas dirigidas.
  String get coordinateKey {
    final x = (position.x * 10000).round();
    final y = (position.y * 10000).round();
    return '${x}_$y';
  }

  @override
  String toString() =>
      'TopologyNode($id, pos=${position.x.toStringAsFixed(3)},${position.y.toStringAsFixed(3)})';
}
