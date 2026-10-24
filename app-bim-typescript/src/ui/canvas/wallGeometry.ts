// =============================================================================
// wallGeometry.ts — Contorno arquitectónico de los muros (en coordenadas mundo)
// =============================================================================
//
// Un muro en planta se dibuja como en un plano: dos caras paralelas al eje,
// separadas por su espesor, con relleno (poché). Donde varios muros comparten
// un extremo, las caras se cortan a inglete: cada cara se prolonga hasta
// cruzarse con la cara del muro vecino que le queda enfrente, así la esquina
// queda cerrada sin solapes ni huecos.
//
// Cómo se elige el vecino de cada cara en un nudo P (con dirección `a` del
// muro saliendo de P y su normal izquierda n = rot90(a)):
//   · la cara +n mira al hueco entre `a` y el primer muro en sentido
//     antihorario → se cruza con la cara −n de ese vecino;
//   · la cara −n mira al primer muro en sentido horario → se cruza con su +n.
// Con un solo vecino (esquina en L) las dos caras se cruzan con él; con tres o
// más (T, cruz) cada cara toma el vecino de su lado.
//
// Si el cruce no existe (muros colineales) o se dispara (ángulo muy agudo), el
// muro termina recto en ese nudo: un pico de varios metros sería peor que una
// esquina sin cerrar.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';

interface WallInput {
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thickness: number;
}

export interface WallOutline {
  readonly id: string;
  /** Cuatro esquinas: [inicio izq, fin izq, fin der, inicio der]. */
  readonly polygon: readonly [Point2D, Point2D, Point2D, Point2D];
  /** El extremo no toca ningún otro muro: se dibuja la tapa. */
  readonly startFree: boolean;
  readonly endFree: boolean;
}

/** Distancia (m) a la que dos extremos se consideran el mismo nudo. */
const NODE_TOLERANCE = 1e-3;
/** Largo máximo del inglete, en múltiplos del espesor mayor. */
const MAX_MITER_RATIO = 4;

type Vec = { x: number; y: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const len = (a: Vec) => Math.hypot(a.x, a.y);
const unit = (a: Vec): Vec => {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
const left = (a: Vec): Vec => ({ x: -a.y, y: a.x });

/** Cruce de las rectas p + t·d y q + s·e, o null si son paralelas. */
function intersect(p: Vec, d: Vec, q: Vec, e: Vec): Vec | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

/** Ángulo antihorario de `b` respecto de `a`, en (0, 2π]. */
function ccwAngle(a: Vec, b: Vec): number {
  let ang = Math.atan2(cross(a, b), a.x * b.x + a.y * b.y);
  if (ang <= 1e-9) ang += Math.PI * 2;
  return ang;
}

interface Arm {
  /** Dirección del muro saliendo del nudo. */
  readonly dir: Vec;
  readonly half: number;
}

/**
 * Esquinas de un extremo: [lado +n, lado −n] respecto de la dirección `a`
 * con la que el muro sale de ese nudo.
 */
function endCorners(node: Vec, own: Arm, others: readonly Arm[]): { plus: Vec; minus: Vec; free: boolean } {
  const n = left(own.dir);
  const butt = { plus: add(node, mul(n, own.half)), minus: sub(node, mul(n, own.half)), free: others.length === 0 };
  if (others.length === 0) return butt;

  const byCcw = [...others].sort((p, q) => ccwAngle(own.dir, p.dir) - ccwAngle(own.dir, q.dir));
  const firstCcw = byCcw[0];
  const firstCw = byCcw[byCcw.length - 1];

  const limit = MAX_MITER_RATIO * Math.max(own.half, ...others.map((o) => o.half)) * 2;
  const miter = (ownSide: 1 | -1, other: Arm): Vec | null => {
    const p = add(node, mul(n, own.half * ownSide));
    const on = left(other.dir);
    const q = add(node, mul(on, other.half * -ownSide));
    const hit = intersect(p, own.dir, q, other.dir);
    if (!hit || len(sub(hit, node)) > limit) return null;
    return hit;
  };

  return {
    plus: miter(1, firstCcw) ?? butt.plus,
    minus: miter(-1, firstCw) ?? butt.minus,
    free: false,
  };
}

export function buildWallOutlines(walls: readonly WallInput[], tolerance = NODE_TOLERANCE): Map<string, WallOutline> {
  const near = (a: Vec, b: Vec) => len(sub(a, b)) <= tolerance;

  /** Brazos de los demás muros que salen de `node`. */
  const armsAt = (node: Vec, exceptId: string): Arm[] => {
    const arms: Arm[] = [];
    for (const w of walls) {
      if (w.id === exceptId) continue;
      if (len(sub(w.end, w.start)) < 1e-9) continue;
      if (near(w.start, node)) arms.push({ dir: unit(sub(w.end, w.start)), half: w.thickness / 2 });
      else if (near(w.end, node)) arms.push({ dir: unit(sub(w.start, w.end)), half: w.thickness / 2 });
    }
    return arms;
  };

  const out = new Map<string, WallOutline>();
  for (const w of walls) {
    const axis = sub(w.end, w.start);
    if (len(axis) < 1e-9) continue;
    const dir = unit(axis);
    const half = w.thickness / 2;

    const atStart = endCorners(w.start, { dir, half }, armsAt(w.start, w.id));
    const atEnd = endCorners(w.end, { dir: mul(dir, -1), half }, armsAt(w.end, w.id));

    // En el fin, la dirección saliente es −dir: su lado +n es el lado derecho del muro.
    out.set(w.id, {
      id: w.id,
      polygon: [atStart.plus, atEnd.minus, atEnd.plus, atStart.minus],
      startFree: atStart.free,
      endFree: atEnd.free,
    });
  }
  return out;
}

/**
 * Proyección escalar de `p` sobre el eje del muro, medida desde `start`.
 * Sirve para cortar las caras por los vanos (que se definen a lo largo del eje).
 */
function alongAxis(start: Point2D, end: Point2D, p: Point2D): number {
  const d = unit(sub(end, start));
  return (p.x - start.x) * d.x + (p.y - start.y) * d.y;
}

/**
 * Tramos de una cara [a, b] que quedan fuera de los huecos (intervalos sobre
 * el eje, medidos desde `start`). Los extremos de la cara pueden sobresalir
 * del eje por el inglete; los huecos solo recortan dentro de su intervalo.
 */
export function faceSegments(
  start: Point2D,
  end: Point2D,
  a: Point2D,
  b: Point2D,
  gaps: readonly (readonly [number, number])[],
): [Point2D, Point2D][] {
  const ta = alongAxis(start, end, a);
  const tb = alongAxis(start, end, b);
  if (Math.abs(tb - ta) < 1e-12) return [[a, b]];
  const at = (t: number): Point2D => {
    const k = (t - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  const sorted = gaps
    .map(([g0, g1]) => [Math.max(lo, Math.min(g0, g1)), Math.min(hi, Math.max(g0, g1))] as const)
    .filter(([g0, g1]) => g1 > g0)
    .sort((p, q) => p[0] - q[0]);

  const segments: [Point2D, Point2D][] = [];
  let cursor = lo;
  for (const [g0, g1] of sorted) {
    if (g0 > cursor) segments.push([at(cursor), at(g0)]);
    cursor = Math.max(cursor, g1);
  }
  if (hi > cursor) segments.push([at(cursor), at(hi)]);
  return segments;
}

/**
 * Trama de un polígono (en px de pantalla): segmentos paralelos a `angle`
 * (rad) cada `spacing` px, recortados por el polígono (par/impar, sirve para
 * cuadriláteros a inglete aunque no sean convexos). Es la trama de 45° con
 * que se representa la mampostería cortada.
 */
export function hatchSegments(
  polygon: readonly Point2D[],
  spacing: number,
  angle = Math.PI / 4,
): [Point2D, Point2D][] {
  if (polygon.length < 3 || spacing <= 0) return [];
  // Se trabaja en un marco girado: las líneas de trama son horizontales.
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rot = polygon.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rot) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const out: [Point2D, Point2D][] = [];
  const back = (x: number, y: number): Point2D => ({ x: x * c + y * s, y: -x * s + y * c });
  // Las líneas caen en múltiplos de `spacing` del marco girado: dos muros
  // vecinos comparten la misma trama y se leen como uno.
  for (let y = Math.ceil(minY / spacing) * spacing; y <= maxY; y += spacing) {
    const xs: number[] = [];
    for (let i = 0; i < rot.length; i++) {
      const a = rot[i];
      const b = rot[(i + 1) % rot.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([back(xs[k], y), back(xs[k + 1], y)]);
  }
  return out;
}

/** Parche de un nudo: el hueco que dejan los ingletes entre los muros que llegan a él. */
export interface JointPatch {
  readonly polygon: readonly Point2D[];
  readonly wallIds: readonly string[];
}

/**
 * En un encuentro en T (o cruz, o un inglete que no se pudo cerrar) un muro
 * acaba a inglete por un lado y recto por el otro: entre los extremos queda un
 * triángulo sin poché. El parche es la envolvente convexa de las esquinas de
 * todos los muros en ese nudo; dibujado bajo los muros, cierra el hueco.
 */
export function jointPatches(
  walls: readonly WallInput[],
  outlines: ReadonlyMap<string, WallOutline>,
  tolerance = NODE_TOLERANCE,
): JointPatch[] {
  const nodes: { at: Vec; corners: Vec[]; ids: string[] }[] = [];
  const nodeAt = (p: Vec) => {
    let n = nodes.find((q) => len(sub(q.at, p)) <= tolerance);
    if (!n) nodes.push((n = { at: p, corners: [], ids: [] }));
    return n;
  };
  for (const w of walls) {
    const o = outlines.get(w.id);
    if (!o) continue;
    const [sL, eL, eR, sR] = o.polygon;
    const s = nodeAt(w.start);
    s.corners.push(sL, sR);
    s.ids.push(w.id);
    const e = nodeAt(w.end);
    e.corners.push(eL, eR);
    e.ids.push(w.id);
  }
  const out: JointPatch[] = [];
  for (const n of nodes) {
    if (n.ids.length < 2) continue;
    const hull = convexHull(n.corners);
    if (hull.length >= 3) out.push({ polygon: hull, wallIds: n.ids });
  }
  return out;
}

/** Envolvente convexa (cadena monótona de Andrew), antihoraria. */
function convexHull(points: readonly Vec[]): Vec[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const build = (src: Vec[]) => {
    const h: Vec[] = [];
    for (const p of src) {
      while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 2])) <= 1e-12) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...build(pts), ...build([...pts].reverse())];
}
