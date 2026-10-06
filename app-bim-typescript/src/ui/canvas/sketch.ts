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
import { cloudOutline } from '../../application/review/cloud';

export type SketchShape =
  /** Trazo con ancho en METROS (pincel) o en PÍXELES (marcador de revisión). */
  | { readonly kind: 'stroke'; readonly points: readonly Point2D[]; readonly width: number; readonly widthIn: 'm' | 'px'; readonly color: string; readonly opacity?: number }
  | { readonly kind: 'rect'; readonly a: Point2D; readonly b: Point2D; readonly color: string; readonly fill?: boolean; readonly opacity?: number }
  | { readonly kind: 'arrow'; readonly a: Point2D; readonly b: Point2D; readonly color: string }
  | { readonly kind: 'cloud'; readonly a: Point2D; readonly b: Point2D; readonly color: string }
  | { readonly kind: 'text'; readonly at: Point2D; readonly text: string; readonly color: string; readonly size?: number }
  /** Segmentos sueltos de ancho en px; `dash` = línea de trazos (elementos ocultos, como vigas en planta). */
  | { readonly kind: 'segs'; readonly segments: readonly (readonly [Point2D, Point2D])[]; readonly color: string; readonly widthPx: number; readonly dash?: boolean }
  /** Rótulo de varias líneas con fondo claro (cotas, coordenadas, etiquetas). */
  | { readonly kind: 'label'; readonly at: Point2D; readonly lines: readonly string[]; readonly color: string; readonly size?: number; readonly align?: 'left' | 'center' }
  /** Relleno translúcido de un polígono. */
  | { readonly kind: 'fill'; readonly points: readonly Point2D[]; readonly color: string; readonly opacity: number }
  /** Contorno de un círculo de radio en metros (tamaño del pincel bajo el dedo). */
  | { readonly kind: 'ring'; readonly at: Point2D; readonly radius: number; readonly color: string }
  /** Número de comentario (círculo con el número). */
  | { readonly kind: 'pin'; readonly at: Point2D; readonly label: string; readonly color: string; readonly selected?: boolean };

/** Fuente viva de trazos: el lienzo se suscribe solo, como a la capa viva del editor. */
export interface SketchSource {
  subscribe(onChange: () => void): () => void;
  get(): readonly SketchShape[];
}

export const EMPTY_SKETCH: SketchSource = { subscribe: () => () => undefined, get: () => [] };

/** Une varias capas vivas en una (el lienzo tiene una sola). Conserva la identidad mientras nada cambie. */
export function mergeSketches(...sources: readonly SketchSource[]): SketchSource {
  let parts: (readonly SketchShape[])[] = [];
  let cached: SketchShape[] = [];
  return {
    subscribe: (cb) => {
      const subs = sources.map((s) => s.subscribe(cb));
      return () => subs.forEach((u) => u());
    },
    get: () => {
      const next = sources.map((s) => s.get());
      if (next.length === parts.length && next.every((p, i) => p === parts[i])) return cached;
      parts = next;
      cached = next.flat();
      return cached;
    },
  };
}

/** #RRGGBB + opacidad → rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Trazo de marcador de revisión (px), independiente del zoom. */
const MARKUP_PX = 2.5;

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
        r.strokePolygon(cloudOutline(a, b, 9));
        break;
      }
      case 'text': {
        const p = toScreen(s.at);
        r.setFillStyle(s.color);
        r.drawText(s.text, p.x, p.y, s.size ?? 14, 'left');
        break;
      }
      case 'segs': {
        r.setStrokeStyle(s.color);
        r.setLineWidth(s.widthPx);
        for (const [a0, b0] of s.segments) {
          const a = toScreen(a0);
          const b = toScreen(b0);
          if (!s.dash) {
            r.drawLine(a.x, a.y, b.x, b.y);
            continue;
          }
          // Trazos de 8 px con huecos de 5 px, en pantalla (no cambian con el zoom).
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const ux = (b.x - a.x) / (len || 1);
          const uy = (b.y - a.y) / (len || 1);
          for (let t = 0; t < len; t += 13) {
            const e = Math.min(len, t + 8);
            r.drawLine(a.x + ux * t, a.y + uy * t, a.x + ux * e, a.y + uy * e);
          }
        }
        break;
      }
      case 'label': {
        const p = toScreen(s.at);
        const size = s.size ?? 11;
        const w = Math.max(...s.lines.map((l) => l.length)) * size * 0.56 + 8;
        const h = s.lines.length * (size + 3) + 4;
        const x0 = s.align === 'left' ? p.x : p.x - w / 2;
        r.setFillStyle('rgba(255, 255, 255, 0.85)');
        r.fillRect(x0, p.y - h / 2, w, h);
        r.setFillStyle(s.color);
        s.lines.forEach((line, i) => {
          const y = p.y - h / 2 + 2 + (i + 1) * (size + 3) - 3;
          r.drawText(line, s.align === 'left' ? x0 + 4 : p.x, y, size, s.align === 'left' ? 'left' : 'center');
        });
        break;
      }
      case 'fill': {
        r.setFillStyle(withAlpha(s.color, s.opacity));
        r.fillPolygon(s.points.map(toScreen));
        break;
      }
      case 'ring': {
        const p = toScreen(s.at);
        r.setStrokeStyle(withAlpha(s.color, 0.9));
        r.setLineWidth(1.5);
        r.strokeCircle(p.x, p.y, Math.max(3, s.radius * scale));
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
