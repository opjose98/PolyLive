// =============================================================================
// wall-split.ts — Partir un muro recto en un punto (H-74)
// =============================================================================
//
// Una culata con la cumbrera a media longitud no cabe en un muro: un muro tiene
// una sola altura por extremo (vertical.ts). Partirlo en la cumbrera da dos
// muros, cada uno con su trapecio, sin cambiar el modelo de datos.
//
// El primer tramo conserva el muro (id, fotos, mediciones) y el segundo es un
// muro nuevo. Cada vano o hueco va al tramo donde cae su centro, con el desfase
// medido desde el arranque de ese tramo; si no cabe entero, se arrima dentro.
// =============================================================================

import type { Point2D } from '../geometry/types';
import type { WallOpening } from './wall-elevation';
import { LevelElevations, VerticalExtent, WallVertical, extentAt } from './vertical';

/** Longitud mínima de cada tramo. */
export const MIN_SPLIT_PIECE = 0.1;

/** Vano (o hueco del alzado) por su arranque y ancho a lo largo del muro. */
interface Span {
  readonly xOffset: number;
  readonly width: number;
}

export interface SplitPlacement {
  /** `true` si va al segundo tramo (el muro nuevo). */
  readonly second: boolean;
  readonly xOffset: number;
  /** No cabía entero en su tramo y se arrimó dentro. */
  readonly clamped: boolean;
}

export interface WallSplitPlan {
  readonly at: Point2D;
  readonly first: WallVertical;
  readonly second: WallVertical;
  readonly secondLength: number;
}

/**
 * Plan para partir el muro `start`→`end` a `distance` metros del arranque, o
 * `null` si algún tramo quedaría más corto que MIN_SPLIT_PIECE.
 */
export function planWallSplit(
  start: Point2D,
  end: Point2D,
  vertical: WallVertical,
  levels: LevelElevations,
  distance: number,
): WallSplitPlan | null {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance < MIN_SPLIT_PIECE || length - distance < MIN_SPLIT_PIECE) return null;
  const t = distance / length;
  const mid: VerticalExtent = extentAt(vertical, t, levels);
  return {
    at: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t },
    first: { start: vertical.start, end: mid },
    second: { start: mid, end: vertical.end },
    secondLength: length - distance,
  };
}

/** Tramo y desfase de un vano al partir en `distance` un muro de largo `length`. */
export function placeSpan(span: Span, distance: number, length: number): SplitPlacement {
  const second = span.xOffset + span.width / 2 >= distance;
  const from = second ? distance : 0;
  const room = (second ? length : distance) - from;
  const local = span.xOffset - from;
  const xOffset = span.width >= room ? 0 : Math.max(0, Math.min(local, room - span.width));
  return { second, xOffset, clamped: Math.abs(xOffset - local) > 1e-6 };
}

/** Reparte los huecos del alzado entre los dos tramos. */
export function splitOpenings(
  openings: readonly WallOpening[],
  distance: number,
  length: number,
): { first: WallOpening[]; second: WallOpening[] } {
  const first: WallOpening[] = [];
  const second: WallOpening[] = [];
  for (const o of openings) {
    const p = placeSpan(o, distance, length);
    (p.second ? second : first).push({ ...o, xOffset: p.xOffset });
  }
  return { first, second };
}
