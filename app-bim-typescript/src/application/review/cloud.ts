// =============================================================================
// cloud.ts — Contorno de "nube" de revisión (la marca clásica de los planos)
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';

/** Contorno de nube de revisión: arcos a lo largo de los lados del rectángulo. */
export function cloudOutline(a: Point2D, b: Point2D, bump?: number): Point2D[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  // Sin tamaño de arco: unos 6 por lado largo.
  const r0 = bump ?? Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 12;
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
    if (len < 1e-9) continue;
    const n = Math.max(1, Math.round(len / (r0 * 2)));
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

