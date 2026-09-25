import 'package:uuid/uuid.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/walls/domain/wall.dart';

/// Metadatos generados automáticamente en el momento de la detección.
class RoomMetadata {
  final String name;

  /// Tipo semántico de espacio ('bedroom', 'kitchen', etc.) — uso futuro.
  final String? type;

  final DateTime detectedAt;

  const RoomMetadata({
    required this.name,
    this.type,
    required this.detectedAt,
  });
}

/// Habitación BIM detectada automáticamente a partir del grafo topológico.
///
/// Todos los campos geométricos ([polygon], [area], [centroid]) son precalculados
/// y normalizados al construir la entidad. No recalcular en getters.
class Room {
  final String id;

  /// Vértices del polígono en orientación horaria (CW), normalizados.
  /// Incluye puntos de aproximación de arcos si el boundary contiene [ArcShape].
  final List<Vector2> polygon;

  /// IDs de los [Wall]s que forman el boundary de esta habitación.
  final List<String> boundaryWallIds;

  /// Área precalculada del polígono en m². Siempre positiva.
  final double area;

  /// Centroide matemático real del polígono (fórmula de Shoelace).
  final Vector2 centroid;

  final RoomMetadata metadata;

  /// Lista de muros del boundary. Mantenida por compatibilidad con
  /// [SelectionService] y tests existentes.
  ///
  /// Deprecated: usar [boundaryWallIds] + lookup externo en Beta.
  @Deprecated('Usar boundaryWallIds. Se elimina en Beta.')
  final List<Wall> boundary;

  /// Observaciones libres de campo o levantamiento (máx. 500 caracteres).
  final String? notes;

  Room({
    String? id,
    required this.polygon,
    required this.boundaryWallIds,
    required this.area,
    required this.centroid,
    required this.metadata,
    required this.boundary,
    this.notes,
  }) : id = id ?? const Uuid().v4();

  /// Nombre de la habitación. Delega a [metadata.name] para compatibilidad
  /// con tests que acceden a [room.name] directamente.
  String get name => metadata.name;

  /// Perímetro calculado desde los vértices del polígono normalizado.
  double get estimatedPerimeter {
    if (polygon.length < 2) return 0.0;
    double total = 0.0;
    for (int i = 0; i < polygon.length; i++) {
      total += polygon[i].distanceTo(polygon[(i + 1) % polygon.length]);
    }
    return total;
  }
}
