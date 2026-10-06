// =============================================================================
// draftShapes.ts — Elementos de dibujo técnico (F6b) como formas del lienzo
// =============================================================================
//
// Convenciones (ISO 128 / NCS):
//   · cota: líneas de referencia, línea de cota con trazos a 45° y el valor;
//   · viga en planta: dos líneas de TRAZOS (está por encima del corte) con su
//     sección "V 30×40"; en alzado, su silueta llena;
//   · cercha: cordones y diagonales; correa: su sección con una cruz;
//   · polígono: contorno y su área; coordenada: cruz y N/E.
// Las coordenadas son las de la vista; `up` dice hacia dónde queda "arriba"
// en pantalla en esa vista (planta: −1, Y abajo; alzado: +1, v arriba).
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { centroid } from '../../domain/geometry/polygon-utils';
import { DraftItem, dimensionLine, itemLength, polygonMetrics, trussSegments } from '../../domain/drafting/drafting';
import type { SketchShape } from './sketch';

export interface DraftRenderContext {
  readonly color: string;
  readonly accent: string;
  readonly selectedId: string | null;
  /** Metros por píxel de pantalla (para separar rótulos un número fijo de px). */
  readonly mPerPx: number;
  readonly up: 1 | -1;
  /** Coordenada a mostrar en un punto (N/E reales o X/Y locales). */
  readonly coordText: (p: Point2D) => readonly string[];
  /** Centro del objeto etiquetado (para la línea de referencia de una etiqueta). */
  readonly targetCenter?: (id: string) => Point2D | null;
  /** Escala anotativa: multiplica el tamaño de textos y rótulos (1 = tamaño fijo en pantalla). */
  readonly textScale?: number;
}

/**
 * Factor de texto ANOTATIVO: un texto de N pt mide N pt en el papel a la
 * escala 1:`denominator`, así que en pantalla crece y decrece con el zoom.
 * 1 pt = 0,3528 mm; en el modelo, × denominador; en pantalla, ÷ mPerPx.
 * Se acota para que nunca desaparezca ni tape la vista.
 */
export function annotativeTextScale(denominator: number, mPerPx: number): number {
  if (!(denominator > 0) || !(mPerPx > 0)) return 1;
  const pxPerPt = (0.0003528 * denominator) / mPerPx;
  return Math.max(0.4, Math.min(6, pxPerPt));
}

function scaleText(shapes: SketchShape[], k: number | undefined): SketchShape[] {
  if (!k || k === 1) return shapes;
  return shapes.map((s) =>
    s.kind === 'text' ? { ...s, size: (s.size ?? 12) * k } : s.kind === 'label' ? { ...s, size: (s.size ?? 11) * k } : s,
  );
}

const f2 = (v: number) => v.toFixed(2);
const cm = (m: number) => Math.round(m * 100);

export function draftShapes(items: readonly DraftItem[], ctx: DraftRenderContext): SketchShape[] {
  const out: SketchShape[] = [];
  const off = (p: Point2D, px: number) => ({ x: p.x, y: p.y + ctx.up * px * ctx.mPerPx });
  for (const i of items) {
    const color = i.id === ctx.selectedId ? ctx.accent : ctx.color;
    const w = i.id === ctx.selectedId ? 2.4 : 1.2;
    const [a, b] = i.points;
    switch (i.kind) {
      case 'dimension': {
        const l = dimensionLine(a, b, i.props.offset ?? 0.4);
        const ext = (p: Point2D, q: Point2D) => [p, { x: q.x + l.nx * 2 * ctx.mPerPx * 4 * Math.sign(i.props.offset ?? 1), y: q.y + l.ny * 2 * ctx.mPerPx * 4 * Math.sign(i.props.offset ?? 1) }] as const;
        const t = 4 * ctx.mPerPx;
        const ux = (b.x - a.x) / (itemLength(i) || 1);
        const uy = (b.y - a.y) / (itemLength(i) || 1);
        const tick = (p: Point2D) => [{ x: p.x - (ux - uy) * t, y: p.y - (uy + ux) * t }, { x: p.x + (ux - uy) * t, y: p.y + (uy + ux) * t }] as const;
        out.push({ kind: 'segs', segments: [[l.a, l.b], ext(a, l.a), ext(b, l.b), tick(l.a), tick(l.b)], color, widthPx: w });
        const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
        out.push({ kind: 'label', at: off(mid, 9), lines: [f2(itemLength(i))], color, size: 11 });
        break;
      }
      case 'text':
        out.push({ kind: 'text', at: a, text: i.text, color, size: i.props.size ?? 12 });
        if (i.id === ctx.selectedId) out.push({ kind: 'ring', at: a, radius: 6 * ctx.mPerPx, color: ctx.accent });
        break;
      case 'tag': {
        const from = i.targetId ? ctx.targetCenter?.(i.targetId) : null;
        if (from) out.push({ kind: 'segs', segments: [[from, a]], color, widthPx: 0.9 });
        out.push({ kind: 'label', at: a, lines: i.text.split('\n'), color, size: 11 });
        break;
      }
      case 'coordinate': {
        const s = 6 * ctx.mPerPx;
        out.push({ kind: 'segs', segments: [[{ x: a.x - s, y: a.y }, { x: a.x + s, y: a.y }], [{ x: a.x, y: a.y - s }, { x: a.x, y: a.y + s }]], color, widthPx: w });
        out.push({ kind: 'label', at: { x: a.x + 8 * ctx.mPerPx, y: a.y }, lines: ctx.coordText(a), color, size: 10, align: 'left' });
        break;
      }
      case 'line':
        out.push({ kind: 'segs', segments: [[a, b]], color, widthPx: w + 0.4 });
        break;
      case 'polygon': {
        const pts = i.points;
        const m = polygonMetrics(pts);
        out.push({ kind: 'fill', points: pts, color: ctx.accent, opacity: 0.08 });
        out.push({ kind: 'segs', segments: pts.map((p, k) => [p, pts[(k + 1) % pts.length]] as const), color, widthPx: w + 0.4 });
        out.push({ kind: 'label', at: centroid(pts), lines: [`${f2(m.area)} m²`], color, size: 11 });
        break;
      }
      case 'beam': {
        const width = i.props.width ?? 0.3;
        const depth = i.props.depth ?? 0.4;
        const len = itemLength(i) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const label = `V ${cm(width)}×${cm(depth)}`;
        if (i.view.kind === 'plan') {
          const h = width / 2;
          out.push({
            kind: 'segs',
            segments: [
              [{ x: a.x + nx * h, y: a.y + ny * h }, { x: b.x + nx * h, y: b.y + ny * h }],
              [{ x: a.x - nx * h, y: a.y - ny * h }, { x: b.x - nx * h, y: b.y - ny * h }],
            ],
            color,
            widthPx: w,
            dash: true,
          });
        } else {
          // Alzado: la línea dibujada es la cara superior; la viga cuelga `depth`.
          const poly = [a, b, { x: b.x, y: b.y - depth }, { x: a.x, y: a.y - depth }];
          out.push({ kind: 'fill', points: poly, color: ctx.color, opacity: 0.35 });
          out.push({ kind: 'segs', segments: poly.map((p, k) => [p, poly[(k + 1) % 4]] as const), color, widthPx: w });
        }
        out.push({ kind: 'label', at: off({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 12), lines: [label], color, size: 10 });
        break;
      }
      case 'truss':
        out.push({ kind: 'segs', segments: trussSegments(a, b, i.props.depth ?? 0.6), color, widthPx: w });
        out.push({ kind: 'label', at: off({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, -10), lines: [`Cercha ${f2(itemLength(i))} m`], color, size: 10 });
        break;
      case 'purlin': {
        const hw = (i.props.width ?? 0.1) / 2;
        const hd = (i.props.depth ?? 0.2) / 2;
        const c = [
          { x: a.x - hw, y: a.y - hd },
          { x: a.x + hw, y: a.y - hd },
          { x: a.x + hw, y: a.y + hd },
          { x: a.x - hw, y: a.y + hd },
        ];
        out.push({ kind: 'segs', segments: [...c.map((p, k) => [p, c[(k + 1) % 4]] as const), [c[0], c[2]], [c[1], c[3]]], color, widthPx: w });
        break;
      }
    }
  }
  return scaleText(out, ctx.textScale);
}

/** Trazo en curso (A→B) y polígono a medio hacer, como formas vivas. */
export function draftPreviewShapes(
  draft: { kind: DraftItem['kind']; a: Point2D; b: Point2D; view: DraftItem['view'] } | null,
  polygon: { points: readonly Point2D[] } | null,
  props: Readonly<Record<string, number>>,
  ctx: DraftRenderContext,
): SketchShape[] {
  const shapes: SketchShape[] = [];
  if (draft) {
    const preview: DraftItem = {
      id: '__draft__',
      spaceId: '',
      view: draft.view,
      levelId: '',
      kind: draft.kind,
      points: [draft.a, draft.b],
      text: '',
      props,
      createdAt: '',
    };
    shapes.push(...draftShapes([preview], { ...ctx, selectedId: '__draft__' }));
  }
  if (polygon?.points.length) {
    const pts = polygon.points;
    shapes.push({ kind: 'segs', segments: pts.slice(1).map((p, k) => [pts[k], p] as const), color: ctx.accent, widthPx: 2 });
    for (const p of pts) shapes.push({ kind: 'ring', at: p, radius: 4 * ctx.mPerPx, color: ctx.accent });
  }
  return shapes;
}
