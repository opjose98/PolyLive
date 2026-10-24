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
import { LevelElevations, VerticalExtent, WallVertical, extentAt, stationsWithin } from './vertical';

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
  const mid: VerticalExtent = extentAt(vertical, distance, length, levels);
  // Las estaciones van a su tramo; la que coincide con el corte pasa a ser el extremo común.
  const inner = stationsWithin(vertical.stations, length).filter((s) => Math.abs(s.at - distance) > 1e-3);
  const before = inner.filter((s) => s.at < distance);
  const after = inner.filter((s) => s.at > distance).map((s) => ({ ...s, at: s.at - distance }));
  return {
    at: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t },
    first: before.length ? { start: vertical.start, end: mid, stations: before } : { start: vertical.start, end: mid },
    second: after.length ? { start: mid, end: vertical.end, stations: after } : { start: mid, end: vertical.end },
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

/**
 * Puntos del eje de un muro donde conviene partirlo: donde lo cruza el eje de
 * otro muro (X) o donde otro muro lo toca con un extremo (T), y su mitad.
 * Distancias desde el inicio, ordenadas, sin los extremos.
 */
export function splitSnapCandidates(
  start: Point2D,
  end: Point2D,
  others: readonly { readonly start: Point2D; readonly end: Point2D }[],
  touchTol = 0.02,
): number[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 2 * MIN_SPLIT_PIECE) return [];
  const ux = dx / length;
  const uy = dy / length;
  const out: number[] = [length / 2];
  for (const o of others) {
    const ex = o.end.x - o.start.x;
    const ey = o.end.y - o.start.y;
    // Extremos del otro muro sobre este eje (encuentro en T).
    for (const p of [o.start, o.end]) {
      const along = (p.x - start.x) * ux + (p.y - start.y) * uy;
      const off = Math.abs((p.x - start.x) * -uy + (p.y - start.y) * ux);
      if (off <= touchTol) out.push(along);
    }
    // Cruce de ejes (X).
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((o.start.x - start.x) * ey - (o.start.y - start.y) * ex) / den;
    const u = ((o.start.x - start.x) * dy - (o.start.y - start.y) * dx) / den;
    if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t * length);
  }
  const inside = out.filter((d) => d >= MIN_SPLIT_PIECE && d <= length - MIN_SPLIT_PIECE).sort((a, b) => a - b);
  return inside.filter((d, i) => i === 0 || d - inside[i - 1] > 1e-3);
}
