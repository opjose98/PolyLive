// =============================================================================
// snap.ts — Snap Angular
// Basado en: snap-angular.md
// =============================================================================

import { Degrees, degrees } from './types';

// ---------------------------------------------------------------------------
// Ángulos predefinidos para snap
// ---------------------------------------------------------------------------

/**
 * Ángulos comunes en arquitectura a los que el trazo "salta" automáticamente.
 * Incluye equivalentes normalizados para cubrir todo el rango [0, 360).
 */
const SNAP_ANGLES: readonly Degrees[] = [
  degrees(0),
  degrees(30),
  degrees(45),
  degrees(60),
  degrees(90),
  degrees(120),
  degrees(135),
  degrees(150),
  degrees(180),
  degrees(210),
  degrees(225),
  degrees(240),
  degrees(270),
  degrees(300),
  degrees(315),
  degrees(330),
];

// ---------------------------------------------------------------------------
// Snap angular
// ---------------------------------------------------------------------------

/**
 * Calcula la diferencia angular mínima entre dos ángulos (considerando wrap-around).
 * Retorna un valor en [0, 180].
 */
function angleDifference(a: Degrees, b: Degrees): number {
  let diff = Math.abs((a as number) - (b as number)) % 360;
  if (diff > 180) {
    diff = 360 - diff;
  }
  return diff;
}

/**
 * Ajusta un ángulo al ángulo predefinido más cercano si está dentro de la tolerancia.
 *
 * @param wallAngle  — Ángulo calculado del muro (en grados, [0, 360))
 * @param tolerance  — Rango de tolerancia en grados (típicamente 5°)
 * @returns El ángulo snapeado, o el ángulo original si ninguno está dentro de la tolerancia
 */
export function snapToNearestAngle(
  wallAngle: Degrees,
  tolerance: Degrees = degrees(5),
): Degrees {
  let nearest: Degrees = wallAngle;
  let minDifference: number = tolerance as number;

  for (const snapAngle of SNAP_ANGLES) {
    const difference = angleDifference(wallAngle, snapAngle);
    if (difference < minDifference) {
      minDifference = difference;
      nearest = snapAngle;
    }
  }

  return nearest;
}
