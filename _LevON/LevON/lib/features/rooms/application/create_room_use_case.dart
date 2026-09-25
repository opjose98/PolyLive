import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';
import 'package:levon/core/validators/validate_geometry_use_case.dart';

/// Caso de uso: crea una [Room] a partir de un conjunto de muros validados.
///
/// Es una función pura sin estado. Valida que los muros formen un polígono
/// cerrado antes de crear la habitación.
class CreateRoomUseCase {
  const CreateRoomUseCase();

  /// Crea y retorna una [Room] si [walls] forman un polígono cerrado válido.
  /// Retorna `null` si la geometría no es válida.
  Room? executeFromWalls(List<Wall> walls, String roomName) {
    if (walls.isEmpty) return null;
    if (!ValidateGeometryUseCase().isClosedPolygon(walls)) return null;

    final vertices = walls.map((w) => w.geometry.startPoint).toList();
    final a = PolygonUtils.area(vertices);
    final c = PolygonUtils.centroid(vertices);
    final cw = PolygonUtils.ensureClockwise(vertices);

    // ignore: deprecated_member_use
    return Room(
      polygon: cw,
      boundaryWallIds: walls.map((w) => w.id).toList(),
      area: a,
      centroid: c,
      metadata: RoomMetadata(name: roomName, detectedAt: DateTime.now()),
      boundary: walls,
    );
  }
}
