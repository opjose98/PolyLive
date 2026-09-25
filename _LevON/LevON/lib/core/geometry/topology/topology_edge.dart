import 'package:uuid/uuid.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/shared/domain/shapes.dart';

/// Tipo geométrico de la arista: segmento recto o arco circular.
enum GeometryType { line, arc }

/// Rol semántico BIM de la arista en el grafo.
///
/// Solo las aristas de tipo [wall] participan en el cierre de habitaciones.
/// Las [partition] conectan nodos pero no contribuyen a detectar rooms.
enum EdgeObjectType { wall, partition }

/// Arista dirigible del grafo topológico, sin referencia directa a nodos.
///
/// Los nodos se referencian por ID para permitir lookup en
/// [Map<String, TopologyNode>] y evitar ciclos de referencia.
///
/// [objectType] se deriva de [Wall.isStructural]: true → [wall], false → [partition].
/// [geometryType] se deriva de [Wall.geometry]: [LineShape] → [line], [ArcShape] → [arc].
class TopologyEdge {
  final String id;
  final String startNodeId;
  final String endNodeId;
  final GeometryType geometryType;
  final EdgeObjectType objectType;

  /// Referencia al muro BIM original. Necesario para extraer vértices en RoomGenerator.
  final Wall sourceWall;

  TopologyEdge({
    String? id,
    required this.startNodeId,
    required this.endNodeId,
    required this.geometryType,
    required this.objectType,
    required this.sourceWall,
  }) : id = id ?? const Uuid().v4();

  /// Constructor semántico que deriva [geometryType] y [objectType] desde el [wall].
  factory TopologyEdge.fromWall({
    required Wall wall,
    required String startNodeId,
    required String endNodeId,
  }) {
    return TopologyEdge(
      startNodeId: startNodeId,
      endNodeId: endNodeId,
      geometryType:
          wall.geometry is ArcShape ? GeometryType.arc : GeometryType.line,
      objectType:
          wall.isStructural ? EdgeObjectType.wall : EdgeObjectType.partition,
      sourceWall: wall,
    );
  }

  /// Retorna el nodo opuesto al dado. Lanza si [nodeId] no pertenece a la arista.
  String otherNodeId(String nodeId) {
    assert(
      nodeId == startNodeId || nodeId == endNodeId,
      'nodeId $nodeId no pertenece a TopologyEdge $id',
    );
    return nodeId == startNodeId ? endNodeId : startNodeId;
  }

  @override
  String toString() =>
      'TopologyEdge($id, $startNodeId→$endNodeId, $objectType, $geometryType)';
}
