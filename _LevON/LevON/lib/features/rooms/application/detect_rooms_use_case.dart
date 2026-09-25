import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/core/geometry/topology/topology_graph.dart';
import 'package:levon/features/rooms/application/room_generator.dart';

/// Caso de uso: detecta habitaciones automáticamente a partir de muros.
///
/// Pipeline: muros → TopologyGraph → findMinimalCycles → RoomGenerator → [Room].
/// Clase pura sin estado; la llama [roomsProvider] cada vez que cambia el grafo.
class DetectRoomsUseCase {
  const DetectRoomsUseCase();

  /// Construye el grafo, detecta ciclos y genera habitaciones.
  ///
  /// [snapTolerance]: tolerancia de fusión de nodos en metros (world-space).
  /// Retorna lista vacía si hay menos de 3 muros.
  List<Room> execute(
    List<Wall> walls, {
    double snapTolerance = 0.05,
  }) {
    if (walls.length < 3) return const [];

    final graph = TopologyGraph(snapTolerance: snapTolerance);
    for (final wall in walls) {
      graph.addWall(wall);
    }

    final cycles = graph.findMinimalCycles();
    return const RoomGenerator().generate(cycles);
  }
}
