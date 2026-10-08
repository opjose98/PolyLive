// =============================================================================
// SnapHandler.ts — Snap Angular (capa de aplicación)
// Basado en: snap-angular.md, Canvas2D-interacción.md
// =============================================================================
//
// Wrapper de aplicación sobre domain/geometry/snap.ts.
// Añade:
// - snapPoint: ajusta un punto para que la línea ref→punto tenga ángulo snapeado
// - Estado configurable (enabled, tolerance)
// - Lista de ángulos predefinidos expuesta
//
// INVARIANTES:
// - Snap es INVISIBLE al usuario (no hay feedback visual de snap en sí)
// - Snap se aplica DESPUÉS de miter (miter primero, snap después)
// - Presupuesto: < 2ms por llamada
// =============================================================================

import { Point2D, Degrees, degrees } from '../../domain/geometry/types';
import { snapToNearestAngle } from '../../domain/geometry/snap';
import { degreesToRadians } from '../../domain/geometry/coordinates';

export class SnapHandler {
  private enabled: boolean;
  private tolerance: Degrees;

  constructor(enabled = true, tolerance: Degrees = degrees(5)) {
    this.enabled = enabled;
    this.tolerance = tolerance;
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getTolerance(): Degrees {
    return this.tolerance;
  }

  setTolerance(tolerance: Degrees): void {
    this.tolerance = tolerance;
  }

  // -------------------------------------------------------------------------
  // Snap angular
  // -------------------------------------------------------------------------

  /**
   * Ajusta un ángulo al ángulo predefinido más cercano si está dentro de la tolerancia.
   * Si snap está deshabilitado, retorna el ángulo original.
   */
  snapAngle(angle: Degrees, tolerance?: Degrees): Degrees {
    if (!this.enabled) return angle;
    return snapToNearestAngle(angle, tolerance ?? this.tolerance);
  }

  /**
   * Ajusta un punto para que la línea referencePoint→point tenga un ángulo snapeado.
   *
   * 1. Calcula el ángulo actual entre referencePoint y point
   * 2. Lo snapea al ángulo predefinido más cercano
   * 3. Recalcula point manteniendo la distancia original pero con el ángulo snapeado
   */
  snapPoint(
    point: Point2D,
    referencePoint: Point2D,
    tolerance?: Degrees,
  ): Point2D {
    if (!this.enabled) return point;

    const dx = point.x - referencePoint.x;
    const dy = point.y - referencePoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1e-9) return point; // puntos coincidentes

    // Ángulo actual en grados [0, 360)
    const currentAngle = degrees(
      Math.atan2(dy, dx) * (180 / Math.PI),
    );

    // Snap
    const snappedAngle = this.snapAngle(currentAngle, tolerance);

    // Si no cambió, retornar original
    if ((snappedAngle as number) === (currentAngle as number)) return point;

    // Recalcular punto con ángulo snapeado y misma distancia
    const rad = degreesToRadians(snappedAngle);
    return {
      x: referencePoint.x + dist * Math.cos(rad),
      y: referencePoint.y + dist * Math.sin(rad),
    };
  }
}
