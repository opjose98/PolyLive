// =============================================================================
// progress.ts — Avance de obra (M3): actividades, cortes, marcas y cantidades
// =============================================================================
//
// El residente PINTA lo ejecutado sobre un SOPORTE:
//   · un suelo (en planta), ligado a un recinto con identidad (T0/F6a);
//   · una cara de muro (en alzado), lado A o B, sin los vanos.
// Cada trazo pertenece a una ACTIVIDAD (mampostería, pañete, pintura…) y a un
// CORTE (la fecha del reporte). La cantidad ejecutada es el área pintada
// DENTRO del soporte. No es la suma de los trazos: dos pasadas sobre el mismo
// sitio cuentan una vez, y el borrador resta.
//
// Cuantificación por MALLA: el soporte se muestrea en celdas de `cell` m
// (5 cm por defecto) y cada marca, en orden, enciende o apaga las celdas que
// cubre. Es exacto a la resolución de la malla (un error de ±½ celda en el
// borde) y no depende de geometría de polígonos frágil (uniones de trazos,
// autointersecciones). Las mismas celdas sirven para dibujar.
// =============================================================================

import type { Point2D } from '../geometry/types';
import { isPointInPolygon, polygonArea } from '../geometry/polygon-utils';

// ---------------------------------------------------------------------------
// Catálogo y cortes
// ---------------------------------------------------------------------------

export interface Activity {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  /** Color #RRGGBB con que se pinta. */
  readonly color: string;
  /** Unidad del reporte. Todo lo pintado se mide en m². */
  readonly unit: 'm²';
  readonly order: number;
}

/** Actividades con que nace el catálogo de un proyecto (editable). */
export const DEFAULT_ACTIVITIES: readonly { name: string; color: string }[] = [
  { name: 'Mampostería', color: '#B5651D' },
  { name: 'Pañete', color: '#8D8D8D' },
  { name: 'Estuco', color: '#C9B458' },
  { name: 'Pintura', color: '#1E88E5' },
  { name: 'Enchape', color: '#00897B' },
  { name: 'Piso', color: '#6D4C41' },
  { name: 'Cielo raso', color: '#8E24AA' },
];

/** Paleta para actividades nuevas. */
export const ACTIVITY_COLORS = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#3949AB', '#D81B60', '#5D4037'];

export interface ProgressCut {
  readonly id: string;
  readonly projectId: string;
  /** Fecha del corte, AAAA-MM-DD. */
  readonly date: string;
  readonly label: string;
  readonly createdAt: string;
}

/** Fecha local AAAA-MM-DD. */
export function todayIso(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Soportes y marcas
// ---------------------------------------------------------------------------

/** Dónde se pinta. Las coordenadas de la marca son las del soporte. */
export type ProgressTarget =
  /** Suelo del recinto `zoneId`: coordenadas del modelo de la planta. */
  | { readonly kind: 'floor'; readonly zoneId: string }
  /** Cara A o B del muro: (u, v) = (a lo largo del muro desde su inicio, altura sobre CSL 0). */
  | { readonly kind: 'wallFace'; readonly wallId: string; readonly side: 'A' | 'B' };

export type ProgressShape =
  /** Pincel: polilínea con ancho (m). */
  | { readonly kind: 'stroke'; readonly points: readonly Point2D[]; readonly width: number }
  /** Rectángulo entre dos esquinas. */
  | { readonly kind: 'rect'; readonly a: Point2D; readonly b: Point2D }
  /** Todo el soporte. */
  | { readonly kind: 'fill' };

export interface ProgressMark {
  readonly id: string;
  readonly spaceId: string;
  readonly cutId: string;
  readonly activityId: string;
  readonly target: ProgressTarget;
  readonly shape: ProgressShape;
  /** Borrador: apaga lo pintado de esta actividad. */
  readonly erase: boolean;
  readonly operator: string;
  readonly createdAt: string;
}

export function targetKey(t: ProgressTarget): string {
  return t.kind === 'floor' ? `floor:${t.zoneId}` : `wall:${t.wallId}:${t.side}`;
}

/** Superficie de un soporte: contorno exterior y huecos (vanos de un muro). */
export interface Support {
  readonly outline: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
}

export function supportArea(s: Support): number {
  return Math.max(0, (polygonArea(s.outline) as number) - s.holes.reduce((a, h) => a + (polygonArea(h) as number), 0));
}

// ---------------------------------------------------------------------------
// Malla
// ---------------------------------------------------------------------------

/** Celda de la malla (m): 2 cm, el trazo se ve continuo y el error de borde es de ±1 cm. */
export const DEFAULT_CELL = 0.02;
/** Tope de celdas por soporte: si se pasa, la celda crece (un muro de 100 m² a 5 cm son 40 000). */
const MAX_CELLS = 400_000;

export interface Grid {
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** 1 = celda dentro del soporte. */
  readonly inside: Uint8Array;
}

/** Malla del soporte con la máscara de celdas que caen dentro (centro de celda). */
export function supportGrid(s: Support, cell = DEFAULT_CELL): Grid {
  const xs = s.outline.map((p) => p.x);
  const ys = s.outline.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  let c = cell;
  while ((w / c) * (h / c) > MAX_CELLS) c *= 1.5;
  const cols = Math.max(1, Math.ceil(w / c));
  const rows = Math.max(1, Math.ceil(h / c));
  const inside = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * c;
    // Cruces de la fila con cada polígono (contorno y huecos): par/impar.
    const xsAt = crossings([s.outline, ...s.holes], y);
    for (let k = 0; k + 1 < xsAt.length; k += 2) {
      const from = Math.max(0, Math.ceil((xsAt[k] - x0) / c - 0.5));
      const to = Math.min(cols - 1, Math.floor((xsAt[k + 1] - x0) / c - 0.5));
      for (let col = from; col <= to; col++) inside[r * cols + col] = 1;
    }
  }
  return { x0, y0, cell: c, cols, rows, inside };
}

function crossings(polys: readonly (readonly Point2D[])[], y: number): number[] {
  const out: number[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) out.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  return out.sort((m, n) => m - n);
}

function distToSegment2(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

/** Aplica una forma a la máscara `on` (valor `v`), solo en celdas del soporte. */
function stamp(g: Grid, on: Uint8Array, shape: ProgressShape, v: 0 | 1): void {
  const { x0, y0, cell, cols, rows, inside } = g;
  const set = (c0: number, c1: number, r0: number, r1: number, test: (p: Point2D) => boolean) => {
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        const i = r * cols + c;
        if (inside[i] && test({ x: x0 + (c + 0.5) * cell, y: y0 + (r + 0.5) * cell })) on[i] = v;
      }
    }
  };
  const colOf = (x: number) => Math.floor((x - x0) / cell);
  const rowOf = (y: number) => Math.floor((y - y0) / cell);
  if (shape.kind === 'fill') {
    for (let i = 0; i < on.length; i++) if (inside[i]) on[i] = v;
    return;
  }
  if (shape.kind === 'rect') {
    const minX = Math.min(shape.a.x, shape.b.x);
    const maxX = Math.max(shape.a.x, shape.b.x);
    const minY = Math.min(shape.a.y, shape.b.y);
    const maxY = Math.max(shape.a.y, shape.b.y);
    set(colOf(minX), colOf(maxX), rowOf(minY), rowOf(maxY), (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
    return;
  }
  const r = shape.width / 2;
  const r2 = r * r;
  const pts = shape.points;
  if (pts.length === 1) {
    const p0 = pts[0];
    set(colOf(p0.x - r), colOf(p0.x + r), rowOf(p0.y - r), rowOf(p0.y + r), (p) => (p.x - p0.x) ** 2 + (p.y - p0.y) ** 2 <= r2);
    return;
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    set(
      colOf(Math.min(a.x, b.x) - r),
      colOf(Math.max(a.x, b.x) + r),
      rowOf(Math.min(a.y, b.y) - r),
      rowOf(Math.max(a.y, b.y) + r),
      (p) => distToSegment2(p, a, b) <= r2,
    );
  }
}

/** Celdas pintadas por una secuencia de marcas (en orden: pintar enciende, borrar apaga). */
export function coverage(g: Grid, marks: readonly Pick<ProgressMark, 'shape' | 'erase'>[]): Uint8Array {
  const on = new Uint8Array(g.cols * g.rows);
  for (const m of marks) stamp(g, on, m.shape, m.erase ? 0 : 1);
  return on;
}

export function coveredArea(g: Grid, on: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < on.length; i++) n += on[i];
  return n * g.cell * g.cell;
}

/** Celdas encendidas como rectángulos por fila (para dibujar barato). */
export function coverageRuns(g: Grid, on: Uint8Array): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < g.rows; r++) {
    let start = -1;
    for (let c = 0; c <= g.cols; c++) {
      const v = c < g.cols ? on[r * g.cols + c] : 0;
      if (v && start < 0) start = c;
      else if (!v && start >= 0) {
        out.push({ x: g.x0 + start * g.cell, y: g.y0 + r * g.cell, w: (c - start) * g.cell, h: g.cell });
        start = -1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cantidades
// ---------------------------------------------------------------------------

export interface QuantityRow {
  readonly targetKey: string;
  readonly activityId: string;
  /** Ejecutado EN el corte (lo que se pintó con ese corte). */
  readonly inCut: number;
  /** Acumulado hasta el corte inclusive. */
  readonly cumulative: number;
  /** Área del soporte. */
  readonly supportArea: number;
}

/**
 * Cantidades de un corte, por soporte y actividad. El acumulado aplica las
 * marcas de todos los cortes hasta este (por fecha), así que borrar en un
 * corte posterior no cambia lo reportado en uno anterior.
 */
export function quantities(
  supports: ReadonlyMap<string, Support>,
  marks: readonly ProgressMark[],
  cuts: readonly ProgressCut[],
  cutId: string,
  cell = DEFAULT_CELL,
): QuantityRow[] {
  const cut = cuts.find((c) => c.id === cutId);
  if (!cut) return [];
  const upTo = new Set(cuts.filter((c) => c.date < cut.date || (c.date === cut.date && c.createdAt <= cut.createdAt)).map((c) => c.id));
  const rows: QuantityRow[] = [];
  const byTarget = new Map<string, ProgressMark[]>();
  for (const m of marks) {
    const k = targetKey(m.target);
    byTarget.set(k, [...(byTarget.get(k) ?? []), m]);
  }
  for (const [key, ms] of byTarget) {
    const support = supports.get(key);
    if (!support || support.outline.length < 3) continue;
    const g = supportGrid(support, cell);
    const area = supportArea(support);
    const activities = [...new Set(ms.map((m) => m.activityId))];
    for (const a of activities) {
      const ordered = ms.filter((m) => m.activityId === a).sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));
      const inCut = coveredArea(g, coverage(g, ordered.filter((m) => m.cutId === cutId)));
      const cumulative = coveredArea(g, coverage(g, ordered.filter((m) => upTo.has(m.cutId))));
      if (inCut > 0 || cumulative > 0) rows.push({ targetKey: key, activityId: a, inCut, cumulative, supportArea: area });
    }
  }
  return rows;
}

/** ¿Un punto (coordenadas del soporte) cae en el soporte? */
export function insideSupport(s: Support, p: Point2D): boolean {
  return isPointInPolygon(p, s.outline) && !s.holes.some((h) => isPointInPolygon(p, h));
}

// ---------------------------------------------------------------------------
// Soporte de una cara de muro
// ---------------------------------------------------------------------------

/**
 * Cara de un muro en su sistema (u, v): u a lo largo del muro desde el
 * inicio, v hacia arriba desde el CSL 0. El contorno sigue el perfil (base y
 * tope en cada extremo); los vanos son huecos: no se pinta sobre una ventana.
 */
export function faceSupport(
  length: number,
  profile: { leftBase: number; rightBase: number; leftTop: number; rightTop: number },
  openings: readonly { xOffset: number; width: number; sillHeight: number; height: number }[],
): Support {
  return {
    outline: [
      { x: 0, y: profile.leftBase },
      { x: length, y: profile.rightBase },
      { x: length, y: profile.rightTop },
      { x: 0, y: profile.leftTop },
    ],
    holes: openings
      .filter((o) => o.width > 0 && o.height > 0)
      .map((o) => [
        { x: o.xOffset, y: o.sillHeight },
        { x: o.xOffset + o.width, y: o.sillHeight },
        { x: o.xOffset + o.width, y: o.sillHeight + o.height },
        { x: o.xOffset, y: o.sillHeight + o.height },
      ]),
  };
}
