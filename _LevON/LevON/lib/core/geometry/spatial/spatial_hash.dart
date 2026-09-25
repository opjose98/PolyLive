import 'package:vector_math/vector_math.dart';

/// Hash espacial de celda fija para búsqueda de vecinos en O(1) amortizado.
///
/// [T] es el tipo de dato almacenado (en la práctica: String = nodeId).
/// Usa una cuadrícula de celdas de tamaño [cellSize]; cada punto se indexa
/// en la celda que lo contiene. La búsqueda por radio consulta las 9 celdas
/// vecinas (3×3) para garantizar que no se pierden vecinos en bordes de celda.
///
/// INVARIANTE: si dos puntos están a distancia < [cellSize]/2, siempre estarán
/// en la misma celda o en celdas adyacentes. Por ello se recomienda construir
/// con `cellSize = snapTolerance * 2`.
class SpatialHash<T> {
  /// Tamaño de celda en metros. Debe ser al menos `snapTolerance * 2`.
  final double cellSize;

  final Map<String, List<T>> _cells;

  SpatialHash({required this.cellSize}) : _cells = {};

  // ── Escritura ──────────────────────────────────────────────────────────────

  /// Inserta [value] asociado a [position] en la celda correspondiente.
  void insert(Vector2 position, T value) {
    final key = _cellKey(position);
    (_cells[key] ??= []).add(value);
  }

  /// Elimina [value] de la celda en [position].
  ///
  /// [position] debe ser la misma que se usó en [insert]; de lo contrario
  /// la eliminación no tendrá efecto (no lanza excepción).
  void remove(Vector2 position, T value) {
    final key = _cellKey(position);
    _cells[key]?.remove(value);
  }

  /// Vacía todas las celdas.
  void clear() => _cells.clear();

  // ── Consulta ───────────────────────────────────────────────────────────────

  /// Retorna todos los valores almacenados en las 9 celdas vecinas de [queryPoint].
  ///
  /// NO filtra por distancia real — el caller debe hacer el filtrado fino
  /// (`node.position.distanceTo(query) < radius`) sobre el resultado.
  /// Consultar 9 celdas garantiza que no se pierden vecinos dentro del radio
  /// siempre que `radius <= cellSize`.
  List<T> queryNeighbors(Vector2 queryPoint) {
    final cx = (queryPoint.x / cellSize).floor();
    final cy = (queryPoint.y / cellSize).floor();

    final results = <T>[];
    for (int dx = -1; dx <= 1; dx++) {
      for (int dy = -1; dy <= 1; dy++) {
        final key =
            '${cx + dx}_${cy + dy}'; // las expresiones aritméticas requieren llaves
        final cell = _cells[key];
        if (cell != null) results.addAll(cell);
      }
    }
    return results;
  }

  // ── Utilidades internas ────────────────────────────────────────────────────

  /// Clave de celda: "${floor(x/cellSize)}_${floor(y/cellSize)}".
  /// Usa [floor] (no [round]) para garantizar partición consistente sin ambigüedad
  /// en los bordes de celda.
  String _cellKey(Vector2 p) {
    final cx = (p.x / cellSize).floor();
    final cy = (p.y / cellSize).floor();
    return '${cx}_$cy';
  }

  /// Número de celdas activas (para diagnóstico).
  int get activeCellCount => _cells.values.where((c) => c.isNotEmpty).length;

  /// Número total de entradas almacenadas (para diagnóstico).
  int get totalEntries =>
      _cells.values.fold(0, (sum, cell) => sum + cell.length);
}
