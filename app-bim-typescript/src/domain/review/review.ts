// =============================================================================
// review.ts — Revisión (M4): marcas sobre el plano y el alzado, con comentario
// =============================================================================
//
// Una OBSERVACIÓN es una marca dibujada (trazo libre, flecha, rectángulo, nube
// o texto) en una vista (la planta del espacio o una cara de muro), con un
// número, un comentario, quién la hizo, cuándo, su estado (abierta/resuelta)
// y opcionalmente una foto. Es lo que el supervisor o la interventoría deja
// para que alguien lo atienda, y lo que sale en el acta.
//
// Las coordenadas de las marcas son las de su vista: metros del modelo en
// planta (Y abajo), (u, v) del muro en alzado (v arriba).
// =============================================================================

import type { Point2D } from '../geometry/types';

export type MarkupKind = 'freehand' | 'arrow' | 'rect' | 'cloud' | 'text';

export type Markup =
  | { readonly kind: 'freehand'; readonly points: readonly Point2D[] }
  | { readonly kind: 'arrow'; readonly a: Point2D; readonly b: Point2D }
  | { readonly kind: 'rect'; readonly a: Point2D; readonly b: Point2D }
  | { readonly kind: 'cloud'; readonly a: Point2D; readonly b: Point2D }
  | { readonly kind: 'text'; readonly at: Point2D; readonly text: string };

export type ReviewView = { readonly kind: 'plan' } | { readonly kind: 'wallFace'; readonly wallId: string; readonly side: 'A' | 'B' };

export type ReviewStatus = 'open' | 'resolved';

export interface ReviewItem {
  readonly id: string;
  readonly spaceId: string;
  /** Número correlativo en el espacio: así se cita en el acta ("observación 7"). */
  readonly number: number;
  readonly view: ReviewView;
  readonly markup: Markup;
  readonly color: string;
  readonly comment: string;
  readonly author: string;
  readonly createdAt: string;
  readonly status: ReviewStatus;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  /** Foto de soporte (id de AuditPhoto). */
  readonly photoId?: string;
}

/** Colores de marcador: rojo (corregir), naranja (verificar), azul (información), verde (aprobado), morado. */
export const REVIEW_COLORS = ['#E53935', '#FB8C00', '#1E88E5', '#43A047', '#8E24AA'] as const;

export function viewKey(v: ReviewView): string {
  return v.kind === 'plan' ? 'plan' : `wall:${v.wallId}:${v.side}`;
}

/** Dónde va el número de la observación: el inicio de la marca. */
export function anchorOf(m: Markup): Point2D {
  if (m.kind === 'freehand') return m.points[0] ?? { x: 0, y: 0 };
  if (m.kind === 'text') return m.at;
  return m.a;
}

/** Puntos de una marca (para encuadrar y para tocarla). */
export function markupPoints(m: Markup): Point2D[] {
  if (m.kind === 'freehand') return [...m.points];
  if (m.kind === 'text') return [m.at];
  return [m.a, m.b];
}

/** ¿La marca tiene tamaño suficiente para ser intencional? (un toque no es un rectángulo). */
export function isMeaningful(m: Markup, minSize: number): boolean {
  if (m.kind === 'text') return m.text.trim().length > 0;
  const ps = markupPoints(m);
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= minSize;
}

/** Distancia de un punto a la marca (para tocarla). */
export function distanceToMarkup(p: Point2D, m: Markup): number {
  const seg = (a: Point2D, b: Point2D) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  if (m.kind === 'text') return Math.hypot(p.x - m.at.x, p.y - m.at.y);
  if (m.kind === 'freehand') {
    let d = Infinity;
    for (let i = 0; i + 1 < m.points.length; i++) d = Math.min(d, seg(m.points[i], m.points[i + 1]));
    return m.points.length === 1 ? Math.hypot(p.x - m.points[0].x, p.y - m.points[0].y) : d;
  }
  if (m.kind === 'arrow') return seg(m.a, m.b);
  const c = [m.a, { x: m.b.x, y: m.a.y }, m.b, { x: m.a.x, y: m.b.y }];
  return Math.min(...c.map((q, i) => seg(q, c[(i + 1) % 4])));
}

export interface ReviewCounts {
  readonly open: number;
  readonly resolved: number;
}

export function countByStatus(items: readonly ReviewItem[]): ReviewCounts {
  let open = 0;
  for (const i of items) if (i.status === 'open') open++;
  return { open, resolved: items.length - open };
}
