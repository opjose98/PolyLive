// =============================================================================
// sketch.ts — Trazos a mano sobre el lienzo (Avance M3, Revisión M4)
// =============================================================================
//
// Formas simples en coordenadas MUNDO (las del lienzo donde se dibujan: la
// planta en metros del modelo, o el alzado en (u, v) del muro) que se pintan
// encima del dibujo. Sirven para el trazo en curso (capa viva, como el muro
// que se está trazando) y para las marcas ya guardadas.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';

export type SketchShape =
  /** Trazo con ancho en METROS (pincel) o en PÍXELES (marcador de revisión). */
  | { readonly kind: 'stroke'; readonly points: readonly Point2D[]; readonly width: number; readonly widthIn: 'm' | 'px'; readonly color: string; readonly opacity?: number }
  | { readonly kind: 'rect'; readonly a: Point2D; readonly b: Point2D; readonly color: string; readonly fill?: boolean; readonly opacity?: number }
  | { readonly kind: 'arrow'; readonly a: Point2D; readonly b: Point2D; readonly color: string }
  | { readonly kind: 'cloud'; readonly a: Point2D; readonly b: Point2D; readonly color: string }
  | { readonly kind: 'text'; readonly at: Point2D; readonly text: string; readonly color: string }
  /** Número de comentario (círculo con el número). */
  | { readonly kind: 'pin'; readonly at: Point2D; readonly label: string; readonly color: string; readonly selected?: boolean };

/** Fuente viva de trazos: el lienzo se suscribe solo, como a la capa viva del editor. */
export interface SketchSource {
  subscribe(onChange: () => void): () => void;
  get(): readonly SketchShape[];
}

export const EMPTY_SKETCH: SketchSource = { subscribe: () => () => undefined, get: () => [] };

/** #RRGGBB + opacidad → rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Trazo de marcador de revisión (px), independiente del zoom. */
const MARKUP_PX = 2.5;

/** Contorno de nube de revisión: arcos a lo largo de los lados del rectángulo. */
export function cloudPath(a: Point2D, b: Point2D, bump: number): Point2D[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const out: Point2D[] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const n = Math.max(1, Math.round(len / (bump * 2)));
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    // Normal hacia afuera del rectángulo (recorrido horario en pantalla).
    const nx = uy;
    const ny = -ux;
    const seg = len / n;
    for (let k = 0; k < n; k++) {
      const cx = p.x + ux * seg * (k + 0.5);
      const cy = p.y + uy * seg * (k + 0.5);
      const r = seg / 2;
      for (let s = 0; s <= 8; s++) {
        const t = Math.PI - (Math.PI * s) / 8;
        out.push({ x: cx + ux * Math.cos(t) * r + nx * Math.sin(t) * r, y: cy + uy * Math.cos(t) * r + ny * Math.sin(t) * r });
      }
    }
  }
  return out;
}

/**
 * Dibuja las formas. `toScreen` lleva del mundo al lienzo y `scale` son px por
 * unidad de mundo (para los anchos en metros).
 */
export function drawSketch(r: ICanvasRenderer, shapes: readonly SketchShape[], toScreen: (p: Point2D) => Point2D, scale: number): void {
  for (const s of shapes) {
    switch (s.kind) {
      case 'stroke': {
        const pts = s.points.map(toScreen);
        const w = s.widthIn === 'm' ? s.width * scale : s.width;
        r.setStrokeStyle(withAlpha(s.color, s.opacity ?? 1));
        r.setFillStyle(withAlpha(s.color, s.opacity ?? 1));
        r.setLineWidth(w);
        if (pts.length === 1) r.fillCircle(pts[0].x, pts[0].y, w / 2);
        else r.strokePolyline(pts);
        break;
      }
      case 'rect': {
        const a = toScreen(s.a);
        const b = toScreen(s.b);
        const poly = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        if (s.fill) {
          r.setFillStyle(withAlpha(s.color, s.opacity ?? 0.5));
          r.fillPolygon(poly);
        } else {
          r.setStrokeStyle(withAlpha(s.color, s.opacity ?? 1));
          r.setLineWidth(MARKUP_PX);
          r.strokePolygon(poly);
        }
        break;
      }
      case 'arrow': {
        const a = toScreen(s.a);
        const b = toScreen(s.b);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const head = Math.min(18, len / 2);
        r.setStrokeStyle(s.color);
        r.setFillStyle(s.color);
        r.setLineWidth(MARKUP_PX);
        r.drawLine(a.x, a.y, b.x - ux * head * 0.6, b.y - uy * head * 0.6);
        r.fillPolygon([
          b,
          { x: b.x - ux * head - uy * head * 0.45, y: b.y - uy * head + ux * head * 0.45 },
          { x: b.x - ux * head + uy * head * 0.45, y: b.y - uy * head - ux * head * 0.45 },
        ]);
        break;
      }
      case 'cloud': {
        const a = toScreen(s.a);
        const b = toScreen(s.b);
        r.setStrokeStyle(s.color);
        r.setLineWidth(MARKUP_PX);
        r.strokePolygon(cloudPath(a, b, 9));
        break;
      }
      case 'text': {
        const p = toScreen(s.at);
        r.setFillStyle(s.color);
        r.drawText(s.text, p.x, p.y, 14, 'left');
        break;
      }
      case 'pin': {
        const p = toScreen(s.at);
        r.setFillStyle(s.color);
        r.fillCircle(p.x, p.y, s.selected ? 13 : 11);
        if (s.selected) {
          r.setStrokeStyle('#FFFFFF');
          r.setLineWidth(2);
          r.strokeCircle(p.x, p.y, 13);
        }
        r.setFillStyle('#FFFFFF');
        r.drawText(s.label, p.x, p.y + 4, 11, 'center');
        break;
      }
    }
  }
}
