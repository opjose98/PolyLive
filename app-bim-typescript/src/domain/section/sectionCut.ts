// =============================================================================
// sectionCut.ts — Qué corta un plano vertical (alzados de muro, cortes, columnas)
// =============================================================================
//
// La app no bloquea colisiones, pero las DIBUJA: en el alzado de un muro, el
// muro o la columna que lo atraviesa aparece como un corte rayado; en un corte
// (sección) se ve todo lo que el plano atraviesa; en el alzado de una columna,
// lo que toca cada cara.
//
// Un plano vertical se describe en planta por una línea (origen, dirección,
// largo) y una banda de medio ancho `halfWidth` a cada lado: para el alzado de
// un muro, su espesor (lo que se mete en el muro); para un corte, casi cero.
// Cada elemento cuya huella en planta entra en la banda da una pieza: su
// tramo [x0, x1] a lo largo de la línea y sus franjas de cota [z0, z1]
// (más de una si el plano pasa por un vano: el muro se corta arriba y abajo).
//
// Funciones puras sobre datos ya resueltos (cotas absolutas), sin la base.
// =============================================================================

import type { Point2D } from '../geometry/types';

export interface CutLine {
  readonly origin: Point2D;
  /** Dirección de la línea (se normaliza). */
  readonly dir: Point2D;
  readonly length: number;
  /** Medio ancho de la banda que se considera "dentro del plano". */
  readonly halfWidth: number;
}

/** Muro a cortar: eje, espesor, cota de base y tope a lo largo de su eje, y sus huecos. */
export interface CutWall {
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thickness: number;
  /** Base y tope absolutos a `s` m de su inicio. */
  readonly profileAt: (s: number) => { readonly base: number; readonly top: number };
  /** Huecos (puertas, ventanas, vanos): a lo largo del eje y en cota absoluta. */
  readonly openings: readonly { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }[];
}

export interface CutColumn {
  readonly id: string;
  /** Huella en planta (rectángulo girado o polígono del círculo). */
  readonly footprint: readonly Point2D[];
  readonly base: number;
  readonly top: number;
}

export interface CutSlab {
  readonly id: string;
  readonly outline: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
  /** Cara superior de la losa (cota del nivel) y espesor hacia abajo. */
  readonly top: number;
  readonly thickness: number;
}

interface CutBeam {
  readonly id: string;
  readonly a: Point2D;
  readonly b: Point2D;
  readonly width: number;
  /** Cara superior y peralte hacia abajo. */
  readonly top: number;
  readonly depth: number;
}

export interface CutModel {
  readonly walls?: readonly CutWall[];
  readonly columns?: readonly CutColumn[];
  readonly slabs?: readonly CutSlab[];
  readonly beams?: readonly CutBeam[];
}

export type CutKind = 'wall' | 'column' | 'slab' | 'beam';

export interface CutPiece {
  readonly id: string;
  readonly kind: CutKind;
  readonly x0: number;
  readonly x1: number;
  /** Franjas de cota absoluta cortadas (de abajo arriba). */
  readonly bands: readonly (readonly [number, number])[];
}

const EPS = 1e-6;
/** Una pieza más estrecha que esto es un roce (esquina compartida), no un corte. */
const MIN_PIECE = 0.005;

type Local = { x: number; v: number };

function frame(line: CutLine) {
  const l = Math.hypot(line.dir.x, line.dir.y) || 1;
  const u = { x: line.dir.x / l, y: line.dir.y / l };
  const toLocal = (p: Point2D): Local => {
    const dx = p.x - line.origin.x;
    const dy = p.y - line.origin.y;
    return { x: dx * u.x + dy * u.y, v: -dx * u.y + dy * u.x };
  };
  const toPlan = (x: number): Point2D => ({ x: line.origin.x + u.x * x, y: line.origin.y + u.y * x });
  return { toLocal, toPlan };
}

/** Recorta un polígono (local) al semiplano `sign·v ≤ limit` (Sutherland–Hodgman). */
function clipHalf(poly: Local[], limit: number, sign: 1 | -1): Local[] {
  const inside = (p: Local) => sign * p.v <= limit + EPS;
  const out: Local[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (limit * sign - a.v) / (b.v - a.v);
      out.push({ x: a.x + (b.x - a.x) * t, v: sign * limit });
    }
  }
  return out;
}

/** Tramo [x0, x1] de la huella dentro de la banda y de la línea, o null. */
function bandSpan(poly: readonly Point2D[], line: CutLine, toLocal: (p: Point2D) => Local): [number, number] | null {
  let p = poly.map(toLocal);
  p = clipHalf(p, line.halfWidth, 1);
  p = clipHalf(p, line.halfWidth, -1);
  if (p.length < 2) return null;
  const x0 = Math.max(0, Math.min(...p.map((q) => q.x)));
  const x1 = Math.min(line.length, Math.max(...p.map((q) => q.x)));
  return x1 - x0 >= MIN_PIECE ? [x0, x1] : null;
}

/** Tramos donde la línea (v = 0) cruza un polígono con huecos (par/impar). */
function lineSpans(rings: readonly (readonly Point2D[])[], line: CutLine, toLocal: (p: Point2D) => Local): [number, number][] {
  const xs: number[] = [];
  for (const ring of rings) {
    const r = ring.map(toLocal);
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      if ((a.v <= 0 && b.v > 0) || (b.v <= 0 && a.v > 0)) xs.push(a.x + ((0 - a.v) / (b.v - a.v)) * (b.x - a.x));
    }
  }
  xs.sort((m, n) => m - n);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const x0 = Math.max(0, xs[k]);
    const x1 = Math.min(line.length, xs[k + 1]);
    if (x1 - x0 >= MIN_PIECE) out.push([x0, x1]);
  }
  return out;
}

/** Rectángulo de una barra de ancho `w` entre `a` y `b`. */
function strip(a: Point2D, b: Point2D, w: number): Point2D[] {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (-(b.y - a.y) / l) * (w / 2), y: ((b.x - a.x) / l) * (w / 2) };
  return [
    { x: a.x + n.x, y: a.y + n.y },
    { x: b.x + n.x, y: b.y + n.y },
    { x: b.x - n.x, y: b.y - n.y },
    { x: a.x - n.x, y: a.y - n.y },
  ];
}

/** Resta huecos [z0, z1] de la franja [lo, hi]. */
function subtract(lo: number, hi: number, gaps: readonly (readonly [number, number])[]): [number, number][] {
  let parts: [number, number][] = [[lo, hi]];
  for (const [g0, g1] of gaps) {
    parts = parts.flatMap(([a, b]): [number, number][] => {
      if (g1 <= a + EPS || g0 >= b - EPS) return [[a, b]];
      return [
        ...(g0 > a + EPS ? [[a, g0] as [number, number]] : []),
        ...(g1 < b - EPS ? [[g1, b] as [number, number]] : []),
      ];
    });
  }
  return parts.filter(([a, b]) => b - a > MIN_PIECE);
}

/** Lo que corta el plano: piezas ordenadas a lo largo de la línea. */
export function sectionCuts(line: CutLine, model: CutModel): CutPiece[] {
  const { toLocal, toPlan } = frame(line);
  const out: CutPiece[] = [];

  for (const w of model.walls ?? []) {
    const span = bandSpan(strip(w.start, w.end, w.thickness), line, toLocal);
    if (!span) continue;
    // Cota en el punto medio del tramo, medido sobre el eje del muro cortado.
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) || 1;
    const along = (p: Point2D) => ((p.x - w.start.x) * (w.end.x - w.start.x) + (p.y - w.start.y) * (w.end.y - w.start.y)) / len;
    const s = Math.max(0, Math.min(len, along(toPlan((span[0] + span[1]) / 2))));
    const { base, top } = w.profileAt(s);
    const gaps = w.openings.filter((o) => s > o.x0 + EPS && s < o.x1 - EPS).map((o) => [o.z0, o.z1] as const);
    const bands = subtract(base, top, gaps);
    if (bands.length) out.push({ id: w.id, kind: 'wall', x0: span[0], x1: span[1], bands });
  }

  for (const c of model.columns ?? []) {
    const span = bandSpan(c.footprint, line, toLocal);
    if (span && c.top - c.base > MIN_PIECE) out.push({ id: c.id, kind: 'column', x0: span[0], x1: span[1], bands: [[c.base, c.top]] });
  }

  for (const b of model.beams ?? []) {
    const span = bandSpan(strip(b.a, b.b, b.width), line, toLocal);
    if (span) out.push({ id: b.id, kind: 'beam', x0: span[0], x1: span[1], bands: [[b.top - b.depth, b.top]] });
  }

  for (const sl of model.slabs ?? []) {
    for (const [x0, x1] of lineSpans([sl.outline, ...sl.holes], line, toLocal)) {
      out.push({ id: sl.id, kind: 'slab', x0, x1, bands: [[sl.top - sl.thickness, sl.top]] });
    }
  }

  return out.sort((a, b) => a.x0 - b.x0);
}

// ---------------------------------------------------------------------------
// Lo que se ve DETRÁS del plano de corte (H-89)
// ---------------------------------------------------------------------------

/** Elemento visto (no cortado) dentro de la profundidad de vista: su silueta en (x, z). */
export interface BeyondPiece {
  readonly id: string;
  readonly kind: CutKind;
  /** Distancia al plano de corte (m): se dibuja de lo más lejano a lo más cercano. */
  readonly dist: number;
  readonly poly: readonly { readonly x: number; readonly z: number }[];
  /** Vanos vistos en un muro (rectángulos en x, z). */
  readonly holes: readonly (readonly { readonly x: number; readonly z: number }[])[];
}

/** Polígono (local) recortado a la franja de vista v ∈ [−depth, 0]. */
function clipToView(poly: readonly Point2D[], toLocal: (p: Point2D) => Local, depth: number, length: number): Local[] {
  let p = poly.map(toLocal);
  p = clipHalf(p, 0, 1); // v ≤ 0
  p = clipHalf(p, depth, -1); // v ≥ −depth
  // Recorte a lo largo de la línea [0, length].
  const clipX = (q: Local[], limit: number, sign: 1 | -1): Local[] => {
    const inside = (a: Local) => sign * a.x <= limit + EPS;
    const out: Local[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      const b = q[(i + 1) % q.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = (limit * sign - a.x) / (b.x - a.x);
        out.push({ x: sign * limit, v: a.v + (b.v - a.v) * t });
      }
    }
    return out;
  };
  p = clipX(p, length, 1);
  p = clipX(p, 0, -1);
  return p;
}

const spanOf = (p: readonly Local[]): [number, number] | null => {
  if (p.length < 3) return null;
  const x0 = Math.min(...p.map((q) => q.x));
  const x1 = Math.max(...p.map((q) => q.x));
  return x1 - x0 >= MIN_PIECE ? [x0, x1] : null;
};
const distOf = (p: readonly Local[]) => Math.abs(p.reduce((a, q) => a + q.v, 0) / p.length);
const rect = (x0: number, x1: number, z0: number, z1: number) => [
  { x: x0, z: z0 },
  { x: x1, z: z0 },
  { x: x1, z: z1 },
  { x: x0, z: z1 },
];

/**
 * Lo que se ve detrás del plano, mirando hacia `v < 0` (el lado de vista del
 * corte) hasta `depth` m: muros con su perfil y sus vanos, columnas, vigas y
 * cantos de losa, proyectados sobre el plano. De lo más lejano a lo más
 * cercano: dibujados en ese orden, lo de adelante tapa lo de atrás.
 */
export function sectionBeyond(line: CutLine, depth: number, model: CutModel): BeyondPiece[] {
  if (depth <= MIN_PIECE) return [];
  const { toLocal } = frame(line);
  const out: BeyondPiece[] = [];

  for (const w of model.walls ?? []) {
    const clipped = clipToView(strip(w.start, w.end, w.thickness), toLocal, depth, line.length);
    const span = spanOf(clipped);
    if (!span) continue;
    const S = toLocal(w.start);
    const E = toLocal(w.end);
    const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) || 1;
    const oblique = Math.abs(E.x - S.x) > 1e-6;
    // s (a lo largo del muro) de un x de la vista; un muro perpendicular al corte es una franja: sus dos caras.
    const sAt = (x: number) => (oblique ? Math.max(0, Math.min(L, ((x - S.x) / (E.x - S.x)) * L)) : L / 2);
    const xs: number[] = [];
    const n = Math.min(40, Math.max(1, Math.ceil((span[1] - span[0]) / 0.5)));
    for (let k = 0; k <= n; k++) xs.push(span[0] + ((span[1] - span[0]) * k) / n);
    const bottom = xs.map((x) => ({ x, z: w.profileAt(sAt(x)).base }));
    const top = xs.map((x) => ({ x, z: w.profileAt(sAt(x)).top })).reverse();
    const holes = oblique
      ? w.openings
          .map((o) => {
            const a = S.x + (o.x0 / L) * (E.x - S.x);
            const b = S.x + (o.x1 / L) * (E.x - S.x);
            const x0 = Math.max(span[0], Math.min(a, b));
            const x1 = Math.min(span[1], Math.max(a, b));
            return x1 - x0 >= MIN_PIECE ? rect(x0, x1, o.z0, o.z1) : null;
          })
          .filter((h): h is ReturnType<typeof rect> => h !== null)
      : [];
    out.push({ id: w.id, kind: 'wall', dist: distOf(clipped), poly: [...bottom, ...top], holes });
  }

  for (const c of model.columns ?? []) {
    const clipped = clipToView(c.footprint, toLocal, depth, line.length);
    const span = spanOf(clipped);
    if (span && c.top - c.base > MIN_PIECE) out.push({ id: c.id, kind: 'column', dist: distOf(clipped), poly: rect(span[0], span[1], c.base, c.top), holes: [] });
  }

  for (const b of model.beams ?? []) {
    const clipped = clipToView(strip(b.a, b.b, b.width), toLocal, depth, line.length);
    const span = spanOf(clipped);
    if (span) out.push({ id: b.id, kind: 'beam', dist: distOf(clipped), poly: rect(span[0], span[1], b.top - b.depth, b.top), holes: [] });
  }

  for (const sl of model.slabs ?? []) {
    const clipped = clipToView(sl.outline, toLocal, depth, line.length);
    const span = spanOf(clipped);
    if (span) out.push({ id: sl.id, kind: 'slab', dist: distOf(clipped), poly: rect(span[0], span[1], sl.top - sl.thickness, sl.top), holes: [] });
  }

  return out.sort((a, b) => b.dist - a.dist);
}

/**
 * Caras de una columna rectangular girada, en orden antihorario desde la cara
 * inferior (−Y local): cada una es una línea de corte de banda fina hacia
 * afuera. El alzado de la columna las pone una al lado de otra (desdobladas).
 */
export function columnFaces(center: Point2D, w: number, d: number, rotationDeg = 0): { line: CutLine; label: string }[] {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const at = (lx: number, ly: number): Point2D => ({ x: center.x + lx * c - ly * s, y: center.y + lx * s + ly * c });
  const corners = [at(-w / 2, -d / 2), at(w / 2, -d / 2), at(w / 2, d / 2), at(-w / 2, d / 2)];
  const labels = ['Cara 1', 'Cara 2', 'Cara 3', 'Cara 4'];
  return corners.map((p, i) => {
    const q = corners[(i + 1) % 4];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    // Banda fina por fuera de la cara (de 1 mm a 3 cm): lo que la atraviesa. Un
    // muro enrasado con la cara la toca sin atravesarla y no cuenta.
    const half = 0.0145;
    const mid = 0.001 + half;
    const n = { x: (q.y - p.y) / len, y: -(q.x - p.x) / len };
    return {
      line: { origin: { x: p.x + n.x * mid, y: p.y + n.y * mid }, dir: { x: q.x - p.x, y: q.y - p.y }, length: len, halfWidth: half },
      label: labels[i],
    };
  });
}
