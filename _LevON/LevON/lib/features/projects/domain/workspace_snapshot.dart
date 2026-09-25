import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';

/// Captura inmutable del estado mutable del workspace en un instante dado.
///
/// Usado exclusivamente por el sistema undo/redo ([HistoryNotifier]) para
/// almacenar el estado anterior a una mutación y permitir restaurarlo.
///
/// DISEÑO:
///   - Solo incluye estado MUTABLE del workspace (lo que el usuario puede deshacer).
///   - Las [Room]s se excluyen deliberadamente: son estado derivado calculado
///     automáticamente por [DetectRoomsUseCase] a partir de [walls].
///   - Las [WallElevation]s se incluyen: son datos primarios cuya pérdida en un
///     undo constituiría pérdida de datos de campo (openings, niveles, chain mode).
class WorkspaceSnapshot {
  /// Muros estructurales y particiones en el momento del snapshot.
  final List<Wall> walls;

  /// Columnas arquitectónicas en el momento del snapshot.
  final List<ArchitecturalColumn> columns;

  /// Elevaciones de muro con todos sus openings y niveles verticales.
  final List<WallElevation> wallElevations;

  const WorkspaceSnapshot({
    required this.walls,
    required this.columns,
    this.wallElevations = const [],
  });

  static const WorkspaceSnapshot empty = WorkspaceSnapshot(
    walls: [],
    columns: [],
    wallElevations: [],
  );

  WorkspaceSnapshot copyWith({
    List<Wall>? walls,
    List<ArchitecturalColumn>? columns,
    List<WallElevation>? wallElevations,
  }) {
    return WorkspaceSnapshot(
      walls: walls ?? this.walls,
      columns: columns ?? this.columns,
      wallElevations: wallElevations ?? this.wallElevations,
    );
  }
}
