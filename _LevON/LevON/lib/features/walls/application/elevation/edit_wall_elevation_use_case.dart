import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';

/// Resultado de una operación de edición de elevación.
class ElevationEditResult {
  final WallElevation elevation;
  final bool hadValidationWarning;
  final String? warningMessage;

  /// Non-null cuando la operación fue rechazada (overlap inválido).
  /// La [elevation] retornada es la original sin cambios.
  final String? error;

  bool get hasError => error != null;

  const ElevationEditResult({
    required this.elevation,
    this.hadValidationWarning = false,
    this.warningMessage,
    this.error,
  });
}

/// Casos de uso para editar la elevación de un muro.
///
/// Todas las operaciones son funciones puras que reciben el estado actual
/// y retornan el nuevo estado — sin efectos secundarios.
/// La capa de UI (WallElevationsNotifier) aplica el resultado al estado Riverpod.
class EditWallElevationUseCase {
  const EditWallElevationUseCase();

  // ── OBTENER O CREAR ─────────────────────────────────────────────────────────

  /// Obtiene la WallElevation para un muro dado, o crea una por defecto
  /// si aún no tiene datos de elevación.
  WallElevation getOrCreate(String wallId, double wallHeight, List<WallElevation> elevations) {
    final existing = elevations.where((e) => e.wallId == wallId).firstOrNull;
    return existing ?? WallElevation.defaults(wallId, wallHeight);
  }

  // ── ALTURA (CORONACIÓN) ─────────────────────────────────────────────────────

  /// Actualiza la altura (coronación) del muro.
  ///
  /// Sincroniza [WallElevation.levels.coronacion] con el valor dado.
  /// La capa de aplicación también debe actualizar [Wall.height] con el mismo valor
  /// para mantener consistencia entre planta y elevación.
  WallElevation updateCoronacion(WallElevation elevation, double newHeight) {
    return elevation.copyWith(
      levels: elevation.levels.copyWith(coronacion: newHeight.clamp(0.01, double.infinity)),
    );
  }

  // ── OPENINGS ────────────────────────────────────────────────────────────────

  /// Añade un nuevo opening a la elevación.
  ///
  /// Los overlaps inválidos (Puerta↔Puerta, Puerta↔Ventana, etc.) se permiten
  /// — se marcan visualmente en el WEP pero NO bloquean la creación.
  /// Retorna [ElevationEditResult] con la elevación actualizada y el warning
  /// de overlap si lo hay (para que la UI pueda ofrecer feedback visual).
  ElevationEditResult addOpening(
    WallElevation elevation,
    Wall wall,
    WallOpening opening,
  ) {
    final overlapWarning =
        WallCslService.validateOverlap(opening, elevation.openings);
    final updated = elevation.copyWith(
      openings: [...elevation.openings, opening],
    );
    return ElevationEditResult(
      elevation: updated,
      hadValidationWarning: overlapWarning != null,
      warningMessage: overlapWarning,
    );
  }

  /// Elimina un opening por ID.
  WallElevation removeOpening(WallElevation elevation, String openingId) {
    return elevation.copyWith(
      openings: elevation.openings.where((o) => o.id != openingId).toList(),
    );
  }

  /// Actualiza un opening existente por su ID.
  ///
  /// Si el opening con el ID dado no existe, retorna la elevación sin cambios.
  WallElevation updateOpening(WallElevation elevation, WallOpening updated) {
    final newOpenings = [
      for (final o in elevation.openings)
        if (o.id == updated.id) updated else o,
    ];
    return elevation.copyWith(openings: newOpenings);
  }

  // ── CHAIN MODE ──────────────────────────────────────────────────────────────

  /// Activa o desactiva el Chain Mode para una elevación.
  WallElevation setChainMode(WallElevation elevation, bool enabled) {
    return elevation.copyWith(chainModeEnabled: enabled);
  }

  // ── MOVE / RESIZE ───────────────────────────────────────────────────────────

  /// Mueve un opening a una nueva posición CSL, respetando los límites del muro.
  WallElevation moveOpening(
    WallElevation elevation,
    String openingId,
    double newXOffset,
    double newSillHeight,
    Wall wall,
  ) {
    final o = elevation.openings.where((o) => o.id == openingId).firstOrNull;
    if (o == null) return elevation;
    final x = newXOffset.clamp(0.0, wall.length - o.width);
    final sy = newSillHeight.clamp(0.0, elevation.levels.coronacion - o.height);
    return updateOpening(elevation, o.copyWith(xOffset: x, sillHeight: sy));
  }

  /// Redimensiona un opening, respetando los límites del muro y dimensión mínima.
  WallElevation resizeOpening(
    WallElevation elevation,
    String openingId,
    double newXOffset,
    double newWidth,
    double newSillHeight,
    double newHeight,
    Wall wall, {
    double minDim = 0.1,
  }) {
    final o = elevation.openings.where((o) => o.id == openingId).firstOrNull;
    if (o == null) return elevation;
    final x = newXOffset.clamp(0.0, wall.length - minDim);
    final w = newWidth.clamp(minDim, wall.length - x);
    final sy = newSillHeight.clamp(0.0, elevation.levels.coronacion - minDim);
    final h = newHeight.clamp(minDim, elevation.levels.coronacion - sy);
    return updateOpening(
      elevation,
      o.copyWith(xOffset: x, width: w, sillHeight: sy, height: h),
    );
  }

  // ── CHAIN MODE ──────────────────────────────────────────────────────────────

  /// Propaga el cambio de coronación a todas las elevaciones de muros vecinos
  /// que tengan Chain Mode activo.
  ///
  /// [adjacentWallIds]: IDs de muros que comparten nodo con el muro modificado
  ///   (obtenidos de TopologyGraph.adjacentWallIds o wallAdjacencyMap).
  /// Retorna la lista completa de elevaciones con los vecinos actualizados.
  List<WallElevation> propagateChainMode(
    List<WallElevation> allElevations,
    String sourceWallId,
    double newCoronacion,
    Set<String> adjacentWallIds,
    List<Wall> allWalls,
  ) {
    return [
      for (final elev in allElevations)
        if (adjacentWallIds.contains(elev.wallId) && elev.chainModeEnabled)
          updateCoronacion(elev, newCoronacion)
        else
          elev,
    ];
  }

  // ── SYNC CON PLANTA ─────────────────────────────────────────────────────────

  /// Sincroniza la lista de elevaciones cuando se elimina un muro de la planta.
  ///
  /// Elimina la WallElevation huérfana para evitar datos inconsistentes.
  List<WallElevation> onWallRemoved(
    List<WallElevation> elevations,
    String removedWallId,
  ) {
    return elevations.where((e) => e.wallId != removedWallId).toList();
  }

  /// Sincroniza las elevaciones existentes cuando la lista de muros cambia.
  ///
  /// Elimina orphaned elevations (cuyo wallId ya no existe en [walls]).
  List<WallElevation> syncWithWalls(
    List<WallElevation> elevations,
    List<Wall> walls,
  ) {
    final wallIds = {for (final w in walls) w.id};
    return elevations.where((e) => wallIds.contains(e.wallId)).toList();
  }
}
