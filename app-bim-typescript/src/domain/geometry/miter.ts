// =============================================================================
// miter.ts — Encuentros Limpios de Muros
// Basado en: miter-encuentros.md
// =============================================================================

import {
  Point2D,
  Wall,
  MiterResult,
  Meters,
  Degrees,
  EPSILON,
  meters,
  degrees,
} from './types';
import { radiansToDegrees } from './coordinates';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Distancia entre dos puntos. */
function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ángulo de un segmento respecto al eje X, en grados [0, 360). */
function segmentAngle(start: Point2D, end: Point2D): Degrees {
  const rad = Math.atan2(end.y - start.y, end.x - start.x);
  return radiansToDegrees(rad);
}

/**
 * Intersección de dos líneas infinitas definidas por pares de puntos.
 * Retorna null si las líneas son paralelas o colineales.
 */
function lineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;

  // Líneas paralelas o colineales
  if (Math.abs(denom) < EPSILON) {
    return null;
  }

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;

  return {
    x: p1.x + t * d1x,
    y: p1.y + t * d1y,
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Calcula el punto de encuentro (miter) entre dos muros.
 *
 * Extiende los ejes centrales de ambos muros como líneas infinitas,
 * encuentra su intersección, y valida el ángulo resultante.
 *
 * @param wall1     — Primer muro
 * @param wall2     — Segundo muro
 * @param tolerance — Tolerancia de cercanía para detectar encuentro (default 0.05m)
 */
export function calculateMiter(
  wall1: Wall,
  wall2: Wall,
  tolerance: Meters = meters(0.05),
): MiterResult {
  // Detectar cuál extremo de wall1 está cerca de cuál extremo de wall2
  const combinations: Array<{
    w1End: Point2D;
    w2Start: Point2D;
    w1Other: Point2D;
    w2Other: Point2D;
  }> = [
    {
      w1End: wall1.endPoint,
      w2Start: wall2.startPoint,
      w1Other: wall1.startPoint,
      w2Other: wall2.endPoint,
    },
    {
      w1End: wall1.endPoint,
      w2Start: wall2.endPoint,
      w1Other: wall1.startPoint,
      w2Other: wall2.startPoint,
    },
    {
      w1End: wall1.startPoint,
      w2Start: wall2.startPoint,
      w1Other: wall1.endPoint,
      w2Other: wall2.endPoint,
    },
    {
      w1End: wall1.startPoint,
      w2Start: wall2.endPoint,
      w1Other: wall1.endPoint,
      w2Other: wall2.startPoint,
    },
  ];

  // Encontrar la combinación más cercana
  let bestCombo = combinations[0];
  let bestDist = distance(bestCombo.w1End, bestCombo.w2Start);

  for (let i = 1; i < combinations.length; i++) {
    const d = distance(combinations[i].w1End, combinations[i].w2Start);
    if (d < bestDist) {
      bestDist = d;
      bestCombo = combinations[i];
    }
  }

  // Si están demasiado lejos, no hay encuentro
  if (bestDist > (tolerance as number) * 10) {
    return {
      meetPoint: bestCombo.w1End,
      wall1EndPoint: bestCombo.w1End,
      wall2StartPoint: bestCombo.w2Start,
      angle: degrees(0),
      isValid: false,
      warning: 'walls_too_far',
    };
  }

  // Calcular intersección de líneas infinitas
  const intersection = lineIntersection(
    bestCombo.w1Other,
    bestCombo.w1End,
    bestCombo.w2Other,
    bestCombo.w2Start,
  );

  // Muros paralelos o colineales
  if (intersection === null) {
    return {
      meetPoint: bestCombo.w1End,
      wall1EndPoint: bestCombo.w1End,
      wall2StartPoint: bestCombo.w2Start,
      angle: degrees(0),
      isValid: false,
      warning: 'parallel_walls',
    };
  }

  // Calcular ángulo de encuentro
  const angle1 = segmentAngle(bestCombo.w1Other, bestCombo.w1End);
  const angle2 = segmentAngle(bestCombo.w2Other, bestCombo.w2Start);
  let meetAngle = Math.abs((angle1 as number) - (angle2 as number)) % 360;
  if (meetAngle > 180) meetAngle = 360 - meetAngle;

  const meetAngleDeg = degrees(meetAngle);
  let warning: string | undefined;

  if (meetAngle < 10) {
    warning = 'acute_angle';
  }

  return {
    meetPoint: intersection,
    wall1EndPoint: intersection,
    wall2StartPoint: intersection,
    angle: meetAngleDeg,
    isValid: true,
    warning,
  };
}
