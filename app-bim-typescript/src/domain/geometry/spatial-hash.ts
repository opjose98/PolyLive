// =============================================================================
// spatial-hash.ts — Cuadrícula espacial para búsqueda de vecinos O(1) amortizado
// Portado de LevON: lib/core/geometry/spatial/spatial_hash.dart
// =============================================================================
//
// Sin esto, fusionar nodos en el TopologyGraph sería O(n²): cada punto nuevo
// se compararía contra todos los nodos ya existentes. Con la cuadrícula solo
// se comparan los de las 9 celdas vecinas.
//
// INVARIANTE: si dos puntos están a distancia < cellSize, caen en la misma
// celda o en celdas adyacentes. De ahí la recomendación de construir con
// `cellSize = snapTolerance * 2`, que es lo que hace TopologyGraph.
// =============================================================================

import { Point2D } from './types';

export class SpatialHash<T> {
  /** Tamaño de celda en metros. Debe ser al menos `snapTolerance * 2`. */
  readonly cellSize: number;

  private readonly cells = new Map<string, T[]>();

  constructor(params: { cellSize: number }) {
    if (params.cellSize <= 0) {
      throw new Error('SpatialHash: cellSize debe ser > 0');
    }
    this.cellSize = params.cellSize;
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  insert(position: Point2D, value: T): void {
    const key = this.cellKey(position);
    const cell = this.cells.get(key);
    if (cell) cell.push(value);
    else this.cells.set(key, [value]);
  }

  /**
   * Elimina `value` de la celda de `position`.
   * `position` debe ser la misma usada al insertar; si no, no hay efecto
   * (no lanza).
   */
  remove(position: Point2D, value: T): void {
    const cell = this.cells.get(this.cellKey(position));
    if (!cell) return;
    const idx = cell.indexOf(value);
    if (idx >= 0) cell.splice(idx, 1);
  }

  clear(): void {
    this.cells.clear();
  }

  // -------------------------------------------------------------------------
  // Consulta
  // -------------------------------------------------------------------------

  /**
   * Todos los valores de las 9 celdas que rodean a `queryPoint`.
   *
   * NO filtra por distancia real: el llamador hace el filtrado fino. Consultar
   * 3×3 celdas garantiza no perder vecinos mientras `radio <= cellSize`.
   */
  queryNeighbors(queryPoint: Point2D): T[] {
    const cx = Math.floor(queryPoint.x / this.cellSize);
    const cy = Math.floor(queryPoint.y / this.cellSize);

    const results: T[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(`${cx + dx}_${cy + dy}`);
        if (cell) results.push(...cell);
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Diagnóstico
  // -------------------------------------------------------------------------

  get activeCellCount(): number {
    let count = 0;
    for (const cell of this.cells.values()) if (cell.length > 0) count++;
    return count;
  }

  get totalEntries(): number {
    let total = 0;
    for (const cell of this.cells.values()) total += cell.length;
    return total;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Usa `floor` y no `round`: `floor` parte el plano en celdas disjuntas sin
   * ambigüedad en los bordes, mientras que `round` solaparía media celda.
   */
  private cellKey(p: Point2D): string {
    return `${Math.floor(p.x / this.cellSize)}_${Math.floor(p.y / this.cellSize)}`;
  }
}
