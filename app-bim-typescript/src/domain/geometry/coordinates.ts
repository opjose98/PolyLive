// =============================================================================
// coordinates.ts — Transformaciones de coordenadas entre capas
// Basado en: sistema-coordenadas-6-capas.md, transformaciones-coordenadas.md
// =============================================================================

import {
  Point2D,
  Point3D,
  Meters,
  Degrees,
  CanvasTransform,
  EPSILON,
  meters,
  degrees,
} from './types';

// ---------------------------------------------------------------------------
// Conversión grados ↔ radianes
// ---------------------------------------------------------------------------

/** Convierte grados sexagesimales a radianes. */
export function degreesToRadians(deg: Degrees): number {
  return (deg as number) * (Math.PI / 180);
}

/** Convierte radianes a grados sexagesimales (normalizados a [0, 360)). */
export function radiansToDegrees(rad: number): Degrees {
  return degrees(rad * (180 / Math.PI));
}

// ---------------------------------------------------------------------------
// Screen ↔ World (Canvas ↔ Room local)
// ---------------------------------------------------------------------------

/**
 * Convierte coordenada de pantalla (píxeles) a coordenada mundo (metros).
 * Inverse de worldToScreen.
 */
export function screenToWorld(point: Point2D, t: CanvasTransform): Point2D {
  const dx = point.x - t.offsetX;
  const dy = point.y - t.offsetY;
  const r = t.rotation ?? 0;
  if (r === 0) return { x: dx / t.scale, y: dy / t.scale };
  // Inversa de worldToScreen: se deshace el giro y luego la escala.
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: (dx * c + dy * s) / t.scale, y: (-dx * s + dy * c) / t.scale };
}

/**
 * Convierte coordenada mundo (metros) a coordenada de pantalla (píxeles).
 * Forward transform.
 */
export function worldToScreen(point: Point2D, t: CanvasTransform): Point2D {
  const x = point.x * t.scale;
  const y = point.y * t.scale;
  const r = t.rotation ?? 0;
  if (r === 0) return { x: x + t.offsetX, y: y + t.offsetY };
  // pantalla = offset + R(rotación) · (mundo · escala) — el mismo orden que
  // la transformación del Group de Skia (translate → rotate → scale).
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s + t.offsetX, y: x * s + y * c + t.offsetY };
}

// ---------------------------------------------------------------------------
// Rotaciones
// ---------------------------------------------------------------------------

/** Rota un punto 2D alrededor del origen por el ángulo dado. */
export function rotatePoint2D(point: Point2D, angle: Degrees): Point2D {
  const rad = degreesToRadians(angle);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/** Rota un punto 3D alrededor del eje Z por el ángulo dado. Z no se afecta. */
export function rotatePoint3D_Z(point: Point3D, angle: Degrees): Point3D {
  const rotated2D = rotatePoint2D(
    { x: point.x as number, y: point.y as number },
    angle,
  );
  return {
    x: meters(rotated2D.x),
    y: meters(rotated2D.y),
    z: point.z,
  };
}

// ---------------------------------------------------------------------------
// Proyección y distancia punto-línea
// ---------------------------------------------------------------------------

/**
 * Proyecta un punto sobre un segmento de línea (clamped a [0,1]).
 * Retorna el punto más cercano sobre el segmento.
 */
export function projectPointToLine(
  point: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D,
): Point2D {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const denom = dx * dx + dy * dy;

  if (denom < EPSILON * EPSILON) {
    // Línea degenerada (puntos coincidentes): retornar lineStart
    return { x: lineStart.x, y: lineStart.y };
  }

  const t =
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / denom;
  const clamped = Math.max(0, Math.min(1, t));

  return {
    x: lineStart.x + clamped * dx,
    y: lineStart.y + clamped * dy,
  };
}

/**
 * Distancia de un punto a un segmento de línea (perpendicular clamped).
 */
export function distancePointToLine(
  point: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D,
): Meters {
  const projected = projectPointToLine(point, lineStart, lineEnd);
  const dx = point.x - projected.x;
  const dy = point.y - projected.y;
  return meters(Math.sqrt(dx * dx + dy * dy));
}

// ---------------------------------------------------------------------------
// Comparación con tolerancia
// ---------------------------------------------------------------------------

/** Compara si dos puntos 2D son iguales dentro de una tolerancia. */
export function pointsEqual(
  p1: Point2D,
  p2: Point2D,
  tolerance: number = EPSILON,
): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy) < tolerance;
}
