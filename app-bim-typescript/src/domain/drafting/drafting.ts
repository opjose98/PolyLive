// =============================================================================
// drafting.ts — Dibujo técnico y estructura liviana (F6b)
// =============================================================================
//
// Lo que un plano necesita además de muros y vanos: cotas, textos, etiquetas,
// coordenadas, líneas y polígonos (anotación), y vigas, cerchas y correas
// (estructura dibujada). Viven en una VISTA: la planta del espacio (metros del
// modelo, Y abajo) o una cara de muro ((u, v) del muro, v arriba).
//
// Son elementos de DIBUJO: no cierran recintos ni cambian la topología. Las
// vigas de planta sí salen al IFC (IfcBeam) y todo lo de planta, al DXF.
// =============================================================================

import type { Point2D } from '../geometry/types';
import { polygonArea } from '../geometry/polygon-utils';

export type DraftView = { readonly kind: 'plan' } | { readonly kind: 'wallFace'; readonly wallId: string; readonly side: 'A' | 'B' };

/** `section`: línea de corte guardada (su vista se abre desde la selección). */
export type DraftKind = 'dimension' | 'text' | 'tag' | 'coordinate' | 'line' | 'polygon' | 'beam' | 'truss' | 'purlin' | 'section';

/** Herramientas que se dibujan arrastrando de A a B. */
export const TWO_POINT_KINDS: readonly DraftKind[] = ['dimension', 'line', 'beam', 'truss', 'section'];
/** Herramientas de un solo toque. */
export const ONE_POINT_KINDS: readonly DraftKind[] = ['text', 'tag', 'coordinate', 'purlin'];

export interface DraftItem {
  readonly id: string;
  readonly spaceId: string;
  readonly view: DraftView;
  /** Nivel en que se dibujó (planta). '' en alzado. */
  readonly levelId: string;
  readonly kind: DraftKind;
  /** Puntos en coordenadas de la vista. 2 en las de A→B, 1 en las de un toque, ≥3 en polígono. */
  readonly points: readonly Point2D[];
  /** Texto (texto, etiqueta fija) o vacío. */
  readonly text: string;
  /**
   * Propiedades numéricas, en metros salvo el texto:
   *   dimension.offset   separación de la línea de cota al segmento medido
   *   text.size          tamaño de letra (pt)
   *   beam.width/depth   sección (base × peralte)
   *   truss.depth        altura de la cercha; purlin.depth / width sección
   */
  readonly props: Readonly<Record<string, number>>;
  /** Objeto etiquetado (muro, columna, vano) en `tag`. */
  readonly targetId?: string;
  readonly createdAt: string;
}

export function viewKeyOf(v: DraftView): string {
  return v.kind === 'plan' ? 'plan' : `wall:${v.wallId}:${v.side}`;
}

export function segmentLength(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Longitud medida por una cota, o largo de una línea/viga/cercha. */
export function itemLength(i: Pick<DraftItem, 'points'>): number {
  const [a, b] = i.points;
  return a && b ? segmentLength(a, b) : 0;
}

/** Área y perímetro de un polígono dibujado. */
export function polygonMetrics(points: readonly Point2D[]): { area: number; perimeter: number } {
  if (points.length < 3) return { area: 0, perimeter: 0 };
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) perimeter += segmentLength(points[i], points[(i + 1) % points.length]);
  return { area: polygonArea(points) as number, perimeter };
}

/** Línea de cota: el segmento medido desplazado `offset` hacia su izquierda. */
export function dimensionLine(a: Point2D, b: Point2D, offset: number): { a: Point2D; b: Point2D; nx: number; ny: number } {
  const len = segmentLength(a, b) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  return { a: { x: a.x + nx * offset, y: a.y + ny * offset }, b: { x: b.x + nx * offset, y: b.y + ny * offset }, nx, ny };
}

/**
 * Cercha (en alzado, v arriba): cordón inferior A→B, cordón superior a dos
 * aguas con la cumbrera a `depth`, y diagonales en Warren. Devuelve segmentos.
 */
export function trussSegments(a: Point2D, b: Point2D, depth: number, panels = 4): [Point2D, Point2D][] {
  const p = trussParts(a, b, depth, panels);
  return [...p.chords, ...p.webs];
}

/** Cercha separada en cordones (inferior y superior) y alma (montantes y diagonales), para el IFC. */
export function trussParts(a: Point2D, b: Point2D, depth: number, panels = 4): { chords: [Point2D, Point2D][]; webs: [Point2D, Point2D][] } {
  const n = Math.max(2, panels % 2 === 0 ? panels : panels + 1);
  const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const top = (t: number) => {
    const p = at(t);
    // Altura de la cuerda superior: 0 en los apoyos, `depth` al centro.
    const h = depth * (1 - Math.abs(2 * t - 1));
    return { x: p.x, y: p.y + h };
  };
  const chords: [Point2D, Point2D][] = [[a, b]];
  const webs: [Point2D, Point2D][] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    chords.push([top(t0), top(t1)]);
    // Montante y diagonal de cada paño.
    if (i > 0) webs.push([at(t0), top(t0)]);
    webs.push(i < n / 2 ? [at(t0), top(t1)] : [top(t0), at(t1)]);
  }
  return { chords, webs };
}

/** Profundidad de vista de un corte sin `depth` guardado (m). */
export const SECTION_DEFAULT_DEPTH = 3;

/**
 * Cómo mira un corte (H-89). La línea A→B se mira hacia su IZQUIERDA tal como
 * se ve en la planta (Y hacia abajo): con A→B hacia la derecha de la
 * pantalla, se mira hacia arriba, y en la vista A queda a la izquierda.
 * `flip` (props.flip = 1) mira al otro lado: la línea se toma de B a A.
 * `depth` = hasta dónde se ve lo que hay detrás del plano de corte.
 */
export function sectionView(i: Pick<DraftItem, 'points' | 'props'>): { a: Point2D; b: Point2D; depth: number; dir: Point2D; flipped: boolean } {
  const flipped = (i.props.flip ?? 0) >= 0.5;
  const [p0, p1] = i.points;
  const a = flipped ? p1 : p0;
  const b = flipped ? p0 : p1;
  const len = segmentLength(a, b) || 1;
  return {
    a,
    b,
    depth: Math.max(0, i.props.depth ?? SECTION_DEFAULT_DEPTH),
    dir: { x: (b.y - a.y) / len, y: -(b.x - a.x) / len },
    flipped,
  };
}

/** Manejadores de un corte seleccionado: sus extremos, la profundidad de vista y el botón de lado. */
export type SectionHandle = 'a' | 'b' | 'depth' | 'flip';

/** Puntos de los manejadores de un corte (en la vista). */
export function sectionHandles(i: Pick<DraftItem, 'points' | 'props'>): Record<SectionHandle, Point2D> {
  const v = sectionView(i);
  const mid = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
  // El botón de lado va del lado contrario al de vista, para no tapar el rango.
  const off = Math.min(0.6, segmentLength(v.a, v.b) / 6);
  return {
    a: i.points[0],
    b: i.points[1],
    depth: { x: mid.x + v.dir.x * v.depth, y: mid.y + v.dir.y * v.depth },
    flip: { x: mid.x - v.dir.x * off, y: mid.y - v.dir.y * off },
  };
}

/** Defaults por herramienta (el catálogo los muestra como píldoras). */
export const DRAFT_DEFAULTS: Readonly<Record<DraftKind, Readonly<Record<string, number>>>> = {
  dimension: { offset: 0.4 },
  text: { size: 12 },
  tag: {},
  coordinate: {},
  line: {},
  polygon: {},
  beam: { width: 0.3, depth: 0.4 },
  truss: { depth: 0.6 },
  purlin: { width: 0.1, depth: 0.2 },
  section: { depth: SECTION_DEFAULT_DEPTH, flip: 0 },
};
