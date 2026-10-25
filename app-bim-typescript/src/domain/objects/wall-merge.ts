// =============================================================================
// wall-merge.ts — Unir dos muros colineales en uno (inverso de partir, H-74)
// =============================================================================
//
// Dos tramos que comparten un extremo y siguen la misma recta son un solo muro
// (p. ej. una culata que se dibujó partida en la cumbrera). Unirlos deja el
// muro A con el eje de punta a punta; el punto común pasa a ser una estación
// de altura si el perfil quiebra ahí (si no, sobra). Los vanos, huecos y
// estaciones de B pasan a A con su posición medida desde el nuevo inicio.
// =============================================================================

import type { Point2D } from '../geometry/types';
import { LevelElevations, VerticalExtent, WallStation, WallVertical, resolveExtent, sameExtent } from './vertical';

/** Tolerancia (m) para el extremo común y para la colinealidad. */
const NODE_TOL = 2e-3;
const ANGLE_TOL = 0.01; // rad ≈ 0,6°

interface Seg {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly vertical: WallVertical;
}

export interface MergePlan {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly vertical: WallVertical;
  /** Posición en el muro unido de un punto a `x` m del inicio de A (o de B). */
  readonly mapA: (x: number) => number;
  readonly mapB: (x: number) => number;
  /** A o B quedan invertidos: un vano [x, x+w] pasa a [m(x+w), m(x)]. */
  readonly flipA: boolean;
  readonly flipB: boolean;
  readonly length: number;
}

const near = (p: Point2D, q: Point2D) => Math.hypot(p.x - q.x, p.y - q.y) <= NODE_TOL;
const len = (s: Seg) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);

/** Plan para unir A y B, o el motivo por el que no se puede. */
export function planWallMerge(a: Seg, b: Seg, levels: LevelElevations): MergePlan | string {
  const aP = near(a.end, b.start) || near(a.end, b.end) ? 'end' : near(a.start, b.start) || near(a.start, b.end) ? 'start' : null;
  if (!aP) return 'Los muros no comparten un extremo.';
  const P = aP === 'end' ? a.end : a.start;
  const bP = near(b.start, P) ? 'start' : 'end';
  const Fa = aP === 'end' ? a.start : a.end;
  const Fb = bP === 'start' ? b.end : b.start;
  const ang = (p: Point2D, q: Point2D) => Math.atan2(q.y - p.y, q.x - p.x);
  let d = Math.abs(ang(Fa, P) - ang(P, Fb));
  if (d > Math.PI) d = 2 * Math.PI - d;
  if (d > ANGLE_TOL) return 'Los muros no están alineados: solo se unen tramos de una misma recta.';

  const La = len(a);
  const Lb = len(b);
  const flipA = aP === 'start'; // A va de P a Fa: se invierte
  const flipB = bP === 'end'; // B va de Fb a P: se invierte
  const mapA = (x: number) => (flipA ? La - x : x);
  const mapB = (x: number) => La + (flipB ? Lb - x : x);

  const extA = (which: 'start' | 'end') => a.vertical[which];
  const extB = (which: 'start' | 'end') => b.vertical[which];
  const startExt = flipA ? extA('end') : extA('start');
  const endExt = flipB ? extB('start') : extB('end');
  const pExt = aP === 'end' ? extA('end') : extA('start');

  const stations: WallStation[] = [
    ...(a.vertical.stations ?? []).map((s) => ({ at: mapA(s.at), ext: s.ext })),
    ...(b.vertical.stations ?? []).map((s) => ({ at: mapB(s.at), ext: s.ext })),
  ];
  // El punto común queda como estación si el perfil quiebra ahí.
  const withP = [...stations, { at: La, ext: pExt }].sort((x, y) => x.at - y.at);
  const L = La + Lb;
  const i = withP.findIndex((s) => Math.abs(s.at - La) < 1e-9);
  const prev = i > 0 ? withP[i - 1] : { at: 0, ext: startExt };
  const next = i < withP.length - 1 ? withP[i + 1] : { at: L, ext: endExt };
  const kept = breaks(prev, { at: La, ext: pExt }, next, levels) ? withP : stations.sort((x, y) => x.at - y.at);

  const vertical: WallVertical = kept.length ? { start: startExt, end: endExt, stations: kept } : { start: startExt, end: endExt };
  return { start: Fa, end: Fb, vertical, mapA, mapB, flipA, flipB, length: L };
}

/** ¿El perfil cambia de pendiente en `mid` (base o tope)? */
function breaks(
  prev: { at: number; ext: VerticalExtent },
  mid: { at: number; ext: VerticalExtent },
  next: { at: number; ext: VerticalExtent },
  levels: LevelElevations,
): boolean {
  if (sameExtent(prev.ext, mid.ext) && sameExtent(mid.ext, next.ext)) return false;
  const p = resolveExtent(prev.ext, levels);
  const m = resolveExtent(mid.ext, levels);
  const n = resolveExtent(next.ext, levels);
  const t = (mid.at - prev.at) / (next.at - prev.at || 1);
  const lerp = (u: number, v: number) => u + (v - u) * t;
  return Math.abs(lerp(p.top, n.top) - m.top) > 1e-3 || Math.abs(lerp(p.base, n.base) - m.base) > 1e-3;
}
