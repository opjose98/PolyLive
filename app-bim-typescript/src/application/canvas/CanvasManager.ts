// =============================================================================
// CanvasManager.ts — Orquestador de Canvas2D
// Basado en: Canvas2D-interacción.md, transformaciones-coordenadas.md
// =============================================================================
//
// Orquesta las transformaciones entre coordenadas de pantalla (CanvasPoint)
// y coordenadas mundo (Point2D en metros). Delega la matemática real al
// dominio (coordinates.ts), añadiendo validación y la API de aplicación.
//
// INVARIANTES:
// - worldToScreen(screenToWorld(p)) ≈ p  (ida y vuelta, salvo float)
// - scale ∈ [MIN_SCALE, MAX_SCALE]
// - rotate2D preserva distancias (isometría)
//
// PRESUPUESTO: snap + miter + transformaciones < 30ms (UI thread)
// =============================================================================

import { Point2D, CanvasTransform, Degrees, degrees } from '../../domain/geometry/types';
import {
  worldToScreen as domainWorldToScreen,
  screenToWorld as domainScreenToWorld,
  degreesToRadians,
} from '../../domain/geometry/coordinates';
import { CanvasPoint, canvasPoint, MIN_SCALE, MAX_SCALE } from './types';

export class CanvasManager {
  private transform: CanvasTransform;

  constructor(initialTransform?: Partial<CanvasTransform>) {
    this.transform = {
      scale: initialTransform?.scale ?? 100,
      offsetX: initialTransform?.offsetX ?? 0,
      offsetY: initialTransform?.offsetY ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  getTransform(): CanvasTransform {
    return this.transform;
  }

  setTransform(t: CanvasTransform): void {
    this.transform = {
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale)),
      offsetX: t.offsetX,
      offsetY: t.offsetY,
    };
  }

  // -------------------------------------------------------------------------
  // Transformaciones de coordenadas
  // -------------------------------------------------------------------------

  /**
   * Convierte coordenada mundo (metros) → pantalla (píxeles).
   * Forward: screen = world * scale + offset
   */
  worldToScreen(point: Point2D): CanvasPoint {
    const screen = domainWorldToScreen(point, this.transform);
    return canvasPoint(screen.x, screen.y);
  }

  /**
   * Convierte coordenada pantalla (píxeles) → mundo (metros).
   * Inverse: world = (screen - offset) / scale
   */
  screenToWorld(cp: CanvasPoint): Point2D {
    return domainScreenToWorld({ x: cp.x, y: cp.y }, this.transform);
  }

  /**
   * Rota un punto 2D alrededor de un centro arbitrario.
   *
   * Algoritmo: trasladar al origen, rotar, trasladar de vuelta.
   * Preserva distancias (isometría).
   */
  rotate2D(point: Point2D, centerPoint: Point2D, angle: Degrees): Point2D {
    const rad = degreesToRadians(angle);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Trasladar al origen
    const dx = point.x - centerPoint.x;
    const dy = point.y - centerPoint.y;

    // Rotar
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;

    // Trasladar de vuelta
    return {
      x: rotatedX + centerPoint.x,
      y: rotatedY + centerPoint.y,
    };
  }

  /**
   * Valida que un CanvasPoint esté dentro de un viewport dado.
   *
   * @param point  — Punto en píxeles de pantalla
   * @param width  — Ancho del viewport (default: Infinity = sin límite)
   * @param height — Alto del viewport (default: Infinity = sin límite)
   */
  validateCanvasPoint(
    point: CanvasPoint,
    width: number = Infinity,
    height: number = Infinity,
  ): boolean {
    return (
      isFinite(point.x) &&
      isFinite(point.y) &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= width &&
      point.y <= height
    );
  }
}
