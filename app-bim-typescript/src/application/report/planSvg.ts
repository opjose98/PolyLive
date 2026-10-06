// =============================================================================
// planSvg.ts — La planta como SVG (para los reportes PDF de Avance y Revisión)
// =============================================================================
//
// SVG en coordenadas del MODELO (metros, Y hacia abajo, que es también la
// convención de SVG): muros como trazos de su espesor, recintos con su
// rótulo, capas de avance (celdas pintadas) y marcas de revisión. El HTML del
// reporte lo escala al ancho de la hoja.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';

export interface SvgWall {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thickness: number;
  readonly existing?: boolean;
}

export interface SvgZone {
  readonly polygon: readonly Point2D[];
  readonly label: string;
  readonly sublabel?: string;
  readonly at: Point2D;
}

export interface SvgLayer {
  readonly color: string;
  readonly opacity: number;
  readonly runs: readonly { x: number; y: number; w: number; h: number }[];
}

export type SvgMark =
  | { readonly kind: 'polyline'; readonly points: readonly Point2D[]; readonly color: string; readonly closed?: boolean }
  | { readonly kind: 'arrow'; readonly a: Point2D; readonly b: Point2D; readonly color: string }
  | { readonly kind: 'text'; readonly at: Point2D; readonly text: string; readonly color: string }
  | { readonly kind: 'pin'; readonly at: Point2D; readonly label: string; readonly color: string };

export interface PlanSvgInput {
  readonly walls: readonly SvgWall[];
  readonly zones?: readonly SvgZone[];
  readonly layers?: readonly SvgLayer[];
  readonly marks?: readonly SvgMark[];
  /** Margen alrededor del dibujo (m). */
  readonly margin?: number;
  /** Escala gráfica (barra de metros) abajo a la izquierda: vale aunque el PDF se imprima a otro tamaño. */
  readonly scaleBar?: boolean;
}

/** Largo "redondo" de la escala gráfica para un dibujo de ancho `w` (m): ~1/5 del ancho. */
export function scaleBarLength(w: number): number {
  const target = w / 5;
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (s >= target) return s;
  return 100;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
const pts = (ps: readonly Point2D[]) => ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

export function planSvg(input: PlanSvgInput): string {
  const all: Point2D[] = [];
  for (const w of input.walls) all.push(w.start, w.end);
  for (const z of input.zones ?? []) all.push(...z.polygon);
  for (const m of input.marks ?? []) {
    if (m.kind === 'polyline') all.push(...m.points);
    else if (m.kind === 'arrow') all.push(m.a, m.b);
    else all.push(m.at);
  }
  if (all.length === 0) all.push({ x: 0, y: 0 }, { x: 1, y: 1 });
  const margin = input.margin ?? 1;
  const minX = Math.min(...all.map((p) => p.x)) - margin;
  const minY = Math.min(...all.map((p) => p.y)) - margin;
  const w = Math.max(...all.map((p) => p.x)) + margin - minX;
  const h = Math.max(...all.map((p) => p.y)) + margin - minY;
  // Tamaño de letra y trazos en proporción al dibujo, para que se lean en A4.
  const unit = Math.max(w, h) / 100;

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}" width="100%" style="max-height:170mm">`);
  out.push(`<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>`);
  for (const z of input.zones ?? []) {
    out.push(`<polygon points="${pts(z.polygon)}" fill="#f3f1ec" stroke="#b9b4a8" stroke-width="${n(unit * 0.12)}"/>`);
  }
  for (const l of input.layers ?? []) {
    // crispEdges y medio milímetro de solape: sin ellos el PDF muestra una costura entre filas de celdas.
    out.push(`<g fill="${esc(l.color)}" fill-opacity="${n(0.55 * l.opacity)}" shape-rendering="crispEdges">`);
    for (const r of l.runs) out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h + 0.0005)}"/>`);
    out.push('</g>');
  }
  for (const wl of input.walls) {
    const color = wl.existing ? '#9e9e9e' : '#222222';
    out.push(
      `<line x1="${n(wl.start.x)}" y1="${n(wl.start.y)}" x2="${n(wl.end.x)}" y2="${n(wl.end.y)}" stroke="${color}" stroke-width="${n(wl.thickness)}" stroke-linecap="square"/>`,
    );
  }
  for (const z of input.zones ?? []) {
    out.push(`<text x="${n(z.at.x)}" y="${n(z.at.y)}" font-size="${n(unit * 2.2)}" text-anchor="middle" font-family="sans-serif" fill="#333">${esc(z.label)}</text>`);
    if (z.sublabel) {
      out.push(
        `<text x="${n(z.at.x)}" y="${n(z.at.y + unit * 2.8)}" font-size="${n(unit * 1.8)}" text-anchor="middle" font-family="sans-serif" fill="#555">${esc(z.sublabel)}</text>`,
      );
    }
  }
  const sw = n(unit * 0.35);
  for (const m of input.marks ?? []) {
    if (m.kind === 'polyline') {
      const tag = m.closed ? 'polygon' : 'polyline';
      out.push(`<${tag} points="${pts(m.points)}" fill="none" stroke="${esc(m.color)}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
    } else if (m.kind === 'arrow') {
      const len = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) || 1;
      const ux = (m.b.x - m.a.x) / len;
      const uy = (m.b.y - m.a.y) / len;
      const hd = Math.min(unit * 3, len / 2);
      const p1 = { x: m.b.x - ux * hd - uy * hd * 0.45, y: m.b.y - uy * hd + ux * hd * 0.45 };
      const p2 = { x: m.b.x - ux * hd + uy * hd * 0.45, y: m.b.y - uy * hd - ux * hd * 0.45 };
      out.push(`<line x1="${n(m.a.x)}" y1="${n(m.a.y)}" x2="${n(m.b.x)}" y2="${n(m.b.y)}" stroke="${esc(m.color)}" stroke-width="${sw}"/>`);
      out.push(`<polygon points="${pts([m.b, p1, p2])}" fill="${esc(m.color)}"/>`);
    } else if (m.kind === 'text') {
      out.push(`<text x="${n(m.at.x)}" y="${n(m.at.y)}" font-size="${n(unit * 2.4)}" font-family="sans-serif" fill="${esc(m.color)}">${esc(m.text)}</text>`);
    } else {
      out.push(`<circle cx="${n(m.at.x)}" cy="${n(m.at.y)}" r="${n(unit * 1.8)}" fill="${esc(m.color)}"/>`);
      out.push(
        `<text x="${n(m.at.x)}" y="${n(m.at.y + unit * 0.7)}" font-size="${n(unit * 1.9)}" text-anchor="middle" font-family="sans-serif" fill="#fff">${esc(m.label)}</text>`,
      );
    }
  }
  if (input.scaleBar) {
    const len = scaleBarLength(w - 2 * margin);
    const x0 = minX + margin * 0.3;
    const y0 = minY + h - margin * 0.35;
    const hb = unit * 0.8;
    for (let i = 0; i < 4; i++) {
      out.push(
        `<rect x="${n(x0 + (len / 4) * i)}" y="${n(y0 - hb)}" width="${n(len / 4)}" height="${n(hb)}" fill="${i % 2 ? '#ffffff' : '#222222'}" stroke="#222" stroke-width="${n(unit * 0.08)}"/>`,
      );
    }
    out.push(`<text x="${n(x0)}" y="${n(y0 - hb * 1.6)}" font-size="${n(unit * 1.6)}" font-family="sans-serif" fill="#222">0</text>`);
    out.push(`<text x="${n(x0 + len)}" y="${n(y0 - hb * 1.6)}" font-size="${n(unit * 1.6)}" text-anchor="end" font-family="sans-serif" fill="#222">${len} m</text>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

/**
 * Una cara de muro como SVG: contorno, vanos y marcas. Las coordenadas de la
 * cara son (u, v) con v hacia arriba; el lado B se ve en espejo, como en el
 * alzado de la app.
 */
export function faceSvg(
  face: { readonly outline: readonly Point2D[]; readonly holes: readonly (readonly Point2D[])[] },
  mirrored: boolean,
  marks: readonly SvgMark[] = [],
  layers: readonly SvgLayer[] = [],
): string {
  const length = Math.max(0, ...face.outline.map((p) => p.x));
  const t = (p: Point2D): Point2D => ({ x: mirrored ? length - p.x : p.x, y: -p.y });
  const tm = (m: SvgMark): SvgMark =>
    m.kind === 'polyline'
      ? { ...m, points: m.points.map(t) }
      : m.kind === 'arrow'
        ? { ...m, a: t(m.a), b: t(m.b) }
        : { ...m, at: t(m.at) };
  const outline = face.outline.map(t);
  // Las celdas de avance, al mismo sistema (y hacia abajo, lado B en espejo).
  const tl = layers.map((l) => ({
    ...l,
    runs: l.runs.map((r) => ({ x: mirrored ? length - (r.x + r.w) : r.x, y: -(r.y + r.h), w: r.w, h: r.h })),
  }));
  const svg = planSvg({ walls: [], zones: [{ polygon: outline, label: '', at: outline[0] }], layers: tl, marks: marks.map(tm), margin: 0.5 });
  // Los vanos: huecos en blanco con borde, encima del contorno y debajo de las marcas.
  const holes = face.holes
    .map((h) => `<polygon points="${pts(h.map(t))}" fill="#ffffff" stroke="#888" stroke-width="0.02"/>`)
    .join('');
  return svg.replace(/(<polygon [^>]*fill="#f3f1ec"[^>]*\/>)/, `$1${holes}`);
}
