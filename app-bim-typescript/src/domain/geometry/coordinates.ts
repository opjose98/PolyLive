// =============================================================================
// coordinates.ts — Transformaciones de coordenadas entre capas
// Basado en: sistema-coordenadas-6-capas.md, transformaciones-coordenadas.md
// =============================================================================

import { Point2D, Degrees, CanvasTransform, degrees } from './types';

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

// ---------------------------------------------------------------------------
// Proyección punto-línea
// ---------------------------------------------------------------------------
