// =============================================================================
// polygon-utils.ts — Área, centroide y orientación de polígonos 2D
// Portado de LevON: lib/core/geometry/polygons/polygon_utils.dart
// =============================================================================
//
// Funciones puras sobre coordenadas MUNDO (metros).
//
// CONVENCIÓN DE ORIENTACIÓN: PolyLive usa Y+ hacia ABAJO (ver Point2D en
// types.ts, convención de Canvas). Con Y-down, la fórmula de Shoelace canónica
// da área POSITIVA para orientación HORARIA (CW) — al revés que en la
// convención matemática Y-up. LevON comparte esta convención (Flutter también
// es Y-down), así que los signos se portan tal cual.
// =============================================================================

import { Point2D, Meters, SquareMeters, meters, squareMeters } from './types';

// ---------------------------------------------------------------------------
// Área
// ---------------------------------------------------------------------------

/**
 * Área con signo (fórmula de Shoelace).
 *
 * En Y-down: positivo = horario (CW), negativo = antihorario (CCW).
 * Retorna 0 con menos de 3 vértices.
 */
export function signedArea(vertices: readonly Point2D[]): number {
  const n = vertices.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

/** Área absoluta, siempre positiva. */
export function polygonArea(vertices: readonly Point2D[]): SquareMeters {
  return squareMeters(Math.abs(signedArea(vertices)));
}

// ---------------------------------------------------------------------------
// Centroide
// ---------------------------------------------------------------------------

/**
 * Centroide matemático real del polígono (NO el promedio de vértices, que es
 * incorrecto para polígonos irregulares — un lado con muchos vértices juntos
 * arrastraría el promedio hacia él).
 *
 *   Cx = (1/6A) · Σ (xi + xi+1)(xi·yi+1 − xi+1·yi)
 *   Cy = (1/6A) · Σ (yi + yi+1)(xi·yi+1 − xi+1·yi)
 *
 * Para polígonos degenerados (área ≈ 0) cae al promedio de vértices, que ahí
 * sí es la única respuesta razonable.
 */
export function centroid(vertices: readonly Point2D[]): Point2D {
  const n = vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) return averageOfVertices(vertices);

  const a = signedArea(vertices);
  if (Math.abs(a) < 1e-10) return averageOfVertices(vertices);

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    cx += (vertices[i].x + vertices[j].x) * cross;
    cy += (vertices[i].y + vertices[j].y) * cross;
  }

  const factor = 1 / (6 * a);
  return { x: cx * factor, y: cy * factor };
}

// ---------------------------------------------------------------------------
// Orientación
// ---------------------------------------------------------------------------

/** `true` si los vértices están en orientación horaria (CW) en Y-down. */
export function isClockwise(vertices: readonly Point2D[]): boolean {
  return signedArea(vertices) > 0;
}

/** Devuelve los vértices garantizando orientación horaria; invierte si hace falta. */
export function ensureClockwise(vertices: readonly Point2D[]): Point2D[] {
  return isClockwise(vertices) ? [...vertices] : [...vertices].reverse();
}

// ---------------------------------------------------------------------------
// Consultas geométricas
// ---------------------------------------------------------------------------

/**
 * Distancia perpendicular mínima de `p` al SEGMENTO `a`→`b`.
 *
 * Clampea t a [0,1] para tratarlo como segmento y no como recta infinita —
 * de eso depende que el edge splitting del TopologyGraph no parta aristas
 * lejanas que solo estarían cerca si se prolongaran.
 */
export function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): Meters {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;

  if (lenSq < 1e-12) return meters(Math.hypot(p.x - a.x, p.y - a.y));

  const tRaw = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  const t = Math.max(0, Math.min(1, tRaw));
  return meters(Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)));
}

/**
 * Ray-casting: `true` si `point` cae dentro del polígono.
 * El comportamiento justo sobre el borde no está garantizado (depende de la
 * precisión en coma flotante).
 */
export function isPointInPolygon(point: Point2D, vertices: readonly Point2D[]): boolean {
  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const { x: xi, y: yi } = vertices[i];
    const { x: xj, y: yj } = vertices[j];
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Aproxima un arco como polilínea. Reexportado para tener la API poligonal junta. */

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

function averageOfVertices(vertices: readonly Point2D[]): Point2D {
  const n = vertices.length;
  let sx = 0;
  let sy = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
  }
  return { x: sx / n, y: sy / n };
}
