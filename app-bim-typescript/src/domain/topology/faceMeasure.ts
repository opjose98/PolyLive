// =============================================================================
// faceMeasure.ts — Medir de cara a cara (no de eje a eje)
// =============================================================================
//
// Un láser (o una cinta) mide de CARA a CARA: la cara interior de un muro va
// de la esquina interior con un vecino a la esquina interior con el otro. El
// modelo, en cambio, guarda EJES. Aplicar la medida directamente al eje metía
// un error de un espesor de muro (10–25 cm) en cada longitud.
//
// Aquí:
//   · `faceSpan`: dónde empieza y termina la cara de un lado de un muro, a lo
//     largo de su eje, según las uniones de cada extremo (esquina en L, T, X o
//     extremo libre);
//   · `interiorSide`: qué lado del muro da a un recinto;
//   · `axisLengthForFace`: qué longitud de EJE hace que la cara mida lo medido,
//     simulando que los muros unidos acompañan al extremo que se mueve.
//
// Lados: s = +1 es la normal (−uy, ux) del eje en el modelo (lado A del alzado);
// s = −1, el opuesto (lado B).
// =============================================================================

import type { Point2D } from '../geometry/types';
import { JOINT_TOLERANCE, JointWall, endsAt, planMeasureMove } from './joints';

type MeasureReference = 'interior' | 'exterior' | 'axis';
export type Side = 1 | -1;

export interface FaceWall extends JointWall {
  readonly thickness: number;
}

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

function frame(w: JointWall): { u: Point2D; n: Point2D; len: number } {
  const len = dist(w.start, w.end) || 1;
  const u = { x: (w.end.x - w.start.x) / len, y: (w.end.y - w.start.y) / len };
  return { u, n: { x: -u.y, y: u.x }, len };
}

/** ¿El punto está en el tramo interior de `w` (no en sus extremos)? */
function onInterior(p: Point2D, w: JointWall, tol: number): boolean {
  const { u, n, len } = frame(w);
  const dx = p.x - w.start.x;
  const dy = p.y - w.start.y;
  const t = dx * u.x + dy * u.y;
  return t > tol && t < len - tol && Math.abs(dx * n.x + dy * n.y) <= tol;
}

/**
 * Parámetro (a lo largo del eje de `w`, desde su inicio) donde la línea de la
 * cara `s` de `w` corta las dos caras de `other` (rectas paralelas a su eje a
 * ±espesor/2). `null` si son paralelas (muro que continúa en línea recta).
 */
function cutsWithFaces(w: FaceWall, s: Side, other: FaceWall): [number, number] | null {
  const f = frame(w);
  const g = frame(other);
  const denom = f.u.x * g.u.y - f.u.y * g.u.x; // cruz(u_w, u_o)
  if (Math.abs(denom) < 1e-9) return null;
  const p0 = { x: w.start.x + f.n.x * s * (w.thickness / 2), y: w.start.y + f.n.y * s * (w.thickness / 2) };
  const at = (k: number) => {
    const q0 = { x: other.start.x + g.n.x * k * (other.thickness / 2), y: other.start.y + g.n.y * k * (other.thickness / 2) };
    // p0 + t·u_w = q0 + r·u_o  →  t = cruz(q0 − p0, u_o) / cruz(u_w, u_o)
    return ((q0.x - p0.x) * g.u.y - (q0.y - p0.y) * g.u.x) / denom;
  };
  return [at(1), at(-1)];
}

/**
 * Extensión [u0, u1] de la cara `s` de `w` a lo largo de su eje. Con un vecino
 * del lado de la cara (esquina interior, T) la cara se ACORTA hasta la cara
 * cercana del vecino; con un vecino del otro lado (esquina exterior) se ALARGA
 * hasta su cara lejana; en un extremo libre termina en el extremo del eje.
 */
function faceSpan(w: FaceWall, s: Side, walls: readonly FaceWall[], tol = JOINT_TOLERANCE): { u0: number; u1: number } {
  const f = frame(w);
  const byId = new Map(walls.map((x) => [x.id, x]));
  const neighbours = (node: Point2D): { wall: FaceWall; side: Side | 0 }[] => {
    const out: { wall: FaceWall; side: Side | 0 }[] = [];
    for (const e of endsAt(walls, node, new Set([w.id]), tol)) {
      const o = byId.get(e.id)!;
      const far = e.end === 'start' ? o.end : o.start;
      const d = { x: far.x - node.x, y: far.y - node.y };
      const side = d.x * f.n.x + d.y * f.n.y; // hacia dónde va el vecino
      out.push({ wall: o, side: Math.abs(side) < 1e-9 ? 0 : side > 0 ? 1 : -1 });
    }
    // Encuentro en T: `w` termina sobre el tramo de otro muro, que ocupa los dos lados.
    for (const o of walls) if (o.id !== w.id && onInterior(node, o, tol)) out.push({ wall: o, side: s });
    return out;
  };
  const endParam = (node: Point2D, atStart: boolean, base: number): number => {
    const cut: number[] = [];
    const ext: number[] = [];
    for (const nb of neighbours(node)) {
      const c = cutsWithFaces(w, s, nb.wall);
      if (!c || nb.side === 0) continue;
      const near = atStart ? Math.max(...c) : Math.min(...c);
      const far = atStart ? Math.min(...c) : Math.max(...c);
      (nb.side === s ? cut : ext).push(nb.side === s ? near : far);
    }
    // El primer muro con que choca la cara la corta; si ninguno, la esquina exterior la alarga.
    if (cut.length) return atStart ? Math.min(...cut) : Math.max(...cut);
    if (ext.length) return atStart ? Math.max(...ext) : Math.min(...ext);
    return base;
  };
  return { u0: endParam(w.start, true, 0), u1: endParam(w.end, false, f.len) };
}

export function faceLength(w: FaceWall, s: Side, walls: readonly FaceWall[]): number {
  const { u0, u1 } = faceSpan(w, s, walls);
  return u1 - u0;
}

/** Punto dentro de un polígono (par-impar). */
function inside(p: Point2D, poly: readonly Point2D[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Lado del muro que da a un recinto (polígonos a cara interior). Si dan los
 * dos (tabique entre recintos) se devuelve el lado A (+1); si ninguno, `null`.
 */
export function interiorSide(w: FaceWall, rooms: readonly (readonly Point2D[])[]): Side | null {
  const f = frame(w);
  const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
  const probe = (s: Side) => {
    const o = w.thickness / 2 + 0.05;
    const p = { x: mid.x + f.n.x * s * o, y: mid.y + f.n.y * s * o };
    return rooms.some((r) => r.length >= 3 && inside(p, r));
  };
  const a = probe(1);
  const b = probe(-1);
  if (a) return 1;
  if (b) return -1;
  return null;
}

/**
 * Longitud de EJE con la que la cara `s` del muro mide `target`, moviendo su
 * extremo final a lo largo de su dirección como al aplicar la medida
 * (`planMeasureMove`). Se itera por si la esquina cambia con el movimiento
 * (vecinos que giran en una T o con varios muros); converge en 2–3 pasos.
 */
export function axisLengthForFace(target: number, w: FaceWall, s: Side, walls: readonly FaceWall[]): number {
  const f = frame(w);
  let axis = f.len;
  for (let i = 0; i < 6; i++) {
    const end = { x: w.start.x + f.u.x * axis, y: w.start.y + f.u.y * axis };
    const sim = simulate(walls, w.id, end);
    const me = sim.find((x) => x.id === w.id)!;
    const err = target - faceLength(me, s, sim);
    if (Math.abs(err) < 1e-6) break;
    axis += err;
  }
  return axis;
}

/** Las paredes después de mover el extremo final de `id` a `end` (con sus uniones). */
function simulate(walls: readonly FaceWall[], id: string, end: Point2D): FaceWall[] {
  const changes = planMeasureMove(walls, id, end);
  const byId = new Map(changes.map((c) => [c.id, c]));
  return walls.map((x) => {
    const c = byId.get(x.id);
    return c ? { ...x, start: c.start ?? x.start, end: c.end ?? x.end } : x;
  });
}

/** Longitud de eje para una medida con su referencia (interior/exterior/eje). */
export function axisLengthFor(
  measured: number,
  reference: MeasureReference,
  w: FaceWall,
  walls: readonly FaceWall[],
  rooms: readonly (readonly Point2D[])[],
): { axis: number; side: Side | null; reference: MeasureReference } {
  if (reference === 'axis') return { axis: measured, side: null, reference };
  const inner = interiorSide(w, rooms);
  if (inner === null) return { axis: measured, side: null, reference: 'axis' }; // sin recinto: no hay "interior"
  const side: Side = reference === 'interior' ? inner : inner === 1 ? -1 : 1;
  return { axis: axisLengthForFace(measured, w, side, walls), side, reference };
}
