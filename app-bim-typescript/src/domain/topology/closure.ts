// =============================================================================
// closure.ts — Control de cierre de un recinto (diagonal de control)
// =============================================================================
//
// Medir los lados no basta: un cuadrilátero con los cuatro lados correctos
// puede estar "torcido". La diagonal medida en obra contra la del modelo dice
// si el recinto cierra. Tolerancia: 1 cm + 1 mm por metro de diagonal
// (criterio de aceptación de campo, docs/24).
// =============================================================================

import type { Point2D } from '../geometry/types';

export interface Diagonal {
  readonly a: Point2D;
  readonly b: Point2D;
  readonly length: number;
}

/** La diagonal más larga entre vértices no consecutivos del contorno (a cara interior). */
export function controlDiagonal(polygon: readonly Point2D[]): Diagonal | null {
  const n = polygon.length;
  if (n < 4) return null;
  let best: Diagonal | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // consecutivos (cierre del polígono)
      const a = polygon[i];
      const b = polygon[j];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || length > best.length) best = { a, b, length };
    }
  }
  return best;
}

export function closureTolerance(diagonal: number): number {
  return 0.01 + 0.001 * diagonal;
}

export interface ClosureCheck {
  readonly model: number;
  readonly measured: number;
  /** medida − modelo (m). */
  readonly error: number;
  readonly tolerance: number;
  readonly ok: boolean;
}

export function checkClosure(model: number, measured: number): ClosureCheck {
  const error = measured - model;
  const tolerance = closureTolerance(model);
  return { model, measured, error, tolerance, ok: Math.abs(error) <= tolerance };
}
