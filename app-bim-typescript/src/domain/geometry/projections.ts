// =============================================================================
// projections.ts — Proyecciones punto-muro y validación de vanos
// Basado en: proyecciones-punto-muro.md
// =============================================================================

import { Point2D, Wall, VanoDimensions, Meters, meters } from './types';

// ---------------------------------------------------------------------------
// Proyección de punto al sistema local del muro
// ---------------------------------------------------------------------------

/**
 * Proyecta un punto (en coordenadas locales del Room) al sistema del muro.
 *
 * Retorna:
 * - offsetAlong: distancia a lo largo del muro desde su inicio
 * - offsetPerp: distancia perpendicular desde la línea central del muro
 *   (+X = lado izquierdo visto desde inicio hacia fin)
 *
 * La proyección es idempotente: proyectar dos veces da el mismo resultado.
 */
export function projectPointToWall(
  point: Point2D,
  wall: Wall,
): { offsetAlong: Meters; offsetPerp: Meters } {
  const wallStart = wall.startPoint;
  const wallEnd = wall.endPoint;

  const wallDirX = wallEnd.x - wallStart.x;
  const wallDirY = wallEnd.y - wallStart.y;
  const wallLength = Math.sqrt(wallDirX * wallDirX + wallDirY * wallDirY);

  // Evitar división por cero en muros degenerados
  if (wallLength < 1e-12) {
    return { offsetAlong: meters(0), offsetPerp: meters(0) };
  }

  // Dirección normalizada del muro
  const wallDirNormX = wallDirX / wallLength;
  const wallDirNormY = wallDirY / wallLength;

  // Vector desde inicio del muro al punto
  const toPointX = point.x - wallStart.x;
  const toPointY = point.y - wallStart.y;

  // Proyección paralela (dot product con dirección del muro)
  const offsetAlong = toPointX * wallDirNormX + toPointY * wallDirNormY;

  // Proyección perpendicular (dot product con perpendicular)
  // Perpendicular = (-wallDirNormY, wallDirNormX)
  const offsetPerp = toPointX * (-wallDirNormY) + toPointY * wallDirNormX;

  return {
    offsetAlong: meters(offsetAlong),
    offsetPerp: meters(offsetPerp),
  };
}

// ---------------------------------------------------------------------------
// Validación de vano dentro del muro
// ---------------------------------------------------------------------------

/**
 * Valida que un vano (puerta/ventana) cabe dentro de un muro.
 *
 * Un vano es válido si:
 * 1. Su inicio (offsetAlongWall) es >= 0
 * 2. Su fin (offset + width) no excede la longitud del muro
 * 3. Su offset perpendicular no excede la mitad del espesor del muro
 */
export function isVanoWithinWall(vano: VanoDimensions, wall: Wall): boolean {
  return (
    (vano.offsetAlongWall as number) >= 0 &&
    (vano.offsetAlongWall as number) + (vano.width as number) <=
      (wall.length as number) &&
    Math.abs(vano.offsetPerpendicular as number) <=
      (wall.thickness as number) / 2
  );
}
