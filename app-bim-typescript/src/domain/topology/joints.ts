// =============================================================================
// joints.ts — Uniones de muros: qué más se mueve cuando se mueve un extremo
// =============================================================================
//
// Una UNIÓN es un punto donde coinciden extremos de muros (el snap a nodo los
// deja en exactamente la misma coordenada). Un ENCUENTRO EN T es un extremo
// apoyado en el tramo interior de otro muro.
//
// La unión es parte del modelo, no un accidente del dibujo. Mover un extremo
// (arrastrarlo, aplicarle una medida) mueve con él todos los extremos unidos.
// Trasladar un muro entero estira a sus vecinos. Los encuentros en T apoyados
// en un muro que se mueve se re-proyectan sobre su nueva posición. Antes cada
// muro era un segmento suelto: mover uno abría la esquina y el recinto
// desaparecía.
//
// Funciones puras: devuelven el PLAN de cambios (qué extremo de qué muro va a
// dónde) y no persisten nada.
// =============================================================================

import type { Point2D } from '../geometry/types';

/** Lo mínimo de un muro que necesita la topología de uniones. */
export interface JointWall {
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
}

type WallEnd = 'start' | 'end';

/** Nueva posición de los extremos de un muro (solo los que cambian). */
export interface WallEndsChange {
  readonly id: string;
  readonly start?: Point2D;
  readonly end?: Point2D;
}

/** Distancia (m) a la que dos extremos son la misma unión. El snap los deja a 0. */
export const JOINT_TOLERANCE = 1e-3;

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

/** Parámetro t ∈ (0,1) del pie de `p` sobre el tramo a→b si `p` está sobre su interior; si no, `null`. */
function interiorParam(p: Point2D, a: Point2D, b: Point2D, tol: number): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const len = Math.sqrt(len2);
  // Fuera de los extremos (con margen de la tolerancia) no es un encuentro en T, es una unión.
  if (t * len <= tol || (1 - t) * len <= tol) return null;
  const fx = a.x + t * dx;
  const fy = a.y + t * dy;
  return Math.hypot(p.x - fx, p.y - fy) <= tol ? t : null;
}

/** Extremos de muros (distintos de `exclude`) que coinciden con `point`. */
export function endsAt(
  walls: readonly JointWall[],
  point: Point2D,
  exclude: ReadonlySet<string> = new Set(),
  tol = JOINT_TOLERANCE,
): { id: string; end: WallEnd }[] {
  const out: { id: string; end: WallEnd }[] = [];
  for (const w of walls) {
    if (exclude.has(w.id)) continue;
    if (dist(w.start, point) <= tol) out.push({ id: w.id, end: 'start' });
    if (dist(w.end, point) <= tol) out.push({ id: w.id, end: 'end' });
  }
  return out;
}

/**
 * Acumula cambios por muro: varios pasos del plan pueden tocar el mismo muro
 * (uno por cada extremo), y el resultado debe ser un cambio por muro.
 */
class Plan {
  private readonly byId = new Map<string, { start?: Point2D; end?: Point2D }>();

  set(id: string, end: WallEnd, p: Point2D): void {
    const cur = this.byId.get(id) ?? {};
    cur[end] = p;
    this.byId.set(id, cur);
  }

  has(id: string, end: WallEnd): boolean {
    return this.byId.get(id)?.[end] !== undefined;
  }

  changes(): WallEndsChange[] {
    return [...this.byId].map(([id, c]) => ({ id, ...c }));
  }
}

/**
 * Encuentros en T apoyados en el muro `host` que pasa de a→b a a2→b2: cada
 * extremo apoyado en su interior conserva el mismo parámetro sobre el muro
 * movido (un tabique que llegaba a la mitad sigue llegando a la mitad).
 */
function followTees(
  walls: readonly JointWall[],
  host: JointWall,
  a2: Point2D,
  b2: Point2D,
  plan: Plan,
  moving: ReadonlySet<string>,
  tol: number,
): void {
  for (const w of walls) {
    if (w.id === host.id || moving.has(w.id)) continue;
    for (const end of ['start', 'end'] as const) {
      if (plan.has(w.id, end)) continue;
      const t = interiorParam(w[end], host.start, host.end, tol);
      if (t === null) continue;
      plan.set(w.id, end, { x: a2.x + t * (b2.x - a2.x), y: a2.y + t * (b2.y - a2.y) });
    }
  }
}

/**
 * Mover UN extremo de un muro a `to`: los extremos unidos van con él, y los
 * encuentros en T apoyados en el muro (que cambia de forma) se re-proyectan.
 *
 * `detach` suelta el extremo de su unión (solo se mueve ese muro): es lo que
 * pide el operador cuando quiere separar dos muros a propósito.
 */
export function planEndMove(
  walls: readonly JointWall[],
  wallId: string,
  end: WallEnd,
  to: Point2D,
  opts: { detach?: boolean; tol?: number } = {},
): WallEndsChange[] {
  const tol = opts.tol ?? JOINT_TOLERANCE;
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return [];
  const from = wall[end];
  const plan = new Plan();
  plan.set(wallId, end, to);

  const joined = opts.detach ? [] : endsAt(walls, from, new Set([wallId]), tol);
  for (const j of joined) plan.set(j.id, j.end, to);

  // Cada muro que cambió de forma arrastra sus encuentros en T.
  const moving = new Set([wallId, ...joined.map((j) => j.id)]);
  for (const id of moving) {
    const w = walls.find((x) => x.id === id)!;
    const c = plan.changes().find((x) => x.id === id)!;
    followTees(walls, w, c.start ?? w.start, c.end ?? w.end, plan, moving, tol);
  }
  return plan.changes();
}

/**
 * Trasladar un muro entero (dx, dy): sus dos extremos se mueven, los muros
 * unidos se estiran (solo su extremo unido) y los encuentros en T apoyados en
 * él lo siguen.
 */
export function planWallTranslate(
  walls: readonly JointWall[],
  wallId: string,
  dx: number,
  dy: number,
  opts: { tol?: number } = {},
): WallEndsChange[] {
  const tol = opts.tol ?? JOINT_TOLERANCE;
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return [];
  const a2 = { x: wall.start.x + dx, y: wall.start.y + dy };
  const b2 = { x: wall.end.x + dx, y: wall.end.y + dy };
  const plan = new Plan();
  plan.set(wallId, 'start', a2);
  plan.set(wallId, 'end', b2);

  const exclude = new Set([wallId]);
  const joined = [
    ...endsAt(walls, wall.start, exclude, tol).map((j) => ({ ...j, to: a2 })),
    ...endsAt(walls, wall.end, exclude, tol).map((j) => ({ ...j, to: b2 })),
  ];
  for (const j of joined) plan.set(j.id, j.end, j.to);

  // Un muro que tenga AMBOS extremos unidos al trasladado (p. ej. uno que lo
  // duplica) se traslada entero; los demás se estiran.
  const moving = new Set([wallId, ...joined.map((j) => j.id)]);
  followTees(walls, wall, a2, b2, plan, moving, tol);
  for (const j of joined) {
    const w = walls.find((x) => x.id === j.id)!;
    const c = plan.changes().find((x) => x.id === j.id)!;
    followTees(walls, w, c.start ?? w.start, c.end ?? w.end, plan, moving, tol);
  }
  return plan.changes();
}

/** Muros del plan que quedarían más cortos que `min` (el cambio se rechaza entero). */
export function degenerateInPlan(
  walls: readonly JointWall[],
  changes: readonly WallEndsChange[],
  min: number,
): string[] {
  const out: string[] = [];
  for (const c of changes) {
    const w = walls.find((x) => x.id === c.id);
    if (!w) continue;
    if (dist(c.start ?? w.start, c.end ?? w.end) < min) out.push(c.id);
  }
  return out;
}

/**
 * Aplicar una MEDIDA al muro `wallId` llevando su extremo final a `to`. En una
 * esquina en L (un solo vecino, no alineado) el vecino se TRASLADA entero (y
 * estira al siguiente): medir "este muro mide 3,70" deja el recinto con sus
 * ángulos, como lo entiende quien mide. Antes el vecino giraba sobre su otro
 * extremo y un rectángulo medido quedaba trapecio. En otros casos (T, varios
 * vecinos, extremo libre) se mueve el extremo con sus uniones.
 */
export function planMeasureMove(walls: readonly JointWall[], wallId: string, to: Point2D, tol = JOINT_TOLERANCE): WallEndsChange[] {
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return [];
  const joined = endsAt(walls, wall.end, new Set([wallId]), tol);
  if (joined.length === 1) {
    const nb = walls.find((w) => w.id === joined[0].id)!;
    const ux = wall.end.x - wall.start.x;
    const uy = wall.end.y - wall.start.y;
    const vx = nb.end.x - nb.start.x;
    const vy = nb.end.y - nb.start.y;
    const cross = Math.abs(ux * vy - uy * vx) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    if (cross > 1e-3) return planWallTranslate(walls, nb.id, to.x - wall.end.x, to.y - wall.end.y, { tol });
  }
  return planEndMove(walls, wallId, 'end', to, { tol });
}
