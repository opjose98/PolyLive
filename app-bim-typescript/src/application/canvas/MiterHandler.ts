// =============================================================================
// MiterHandler.ts — Encuentros Limpios (capa de aplicación)
// Basado en: miter-encuentros.md, Canvas2D-interacción.md
// =============================================================================
//
// Wrapper de aplicación sobre domain/geometry/miter.ts.
// Añade:
// - validateMiterAngle: validación aislada de ángulo de encuentro
// - calculateMiterPoint: API simplificada que retorna solo el punto
// - Constantes de negocio (ángulo mínimo)
//
// INVARIANTES:
// - El punto de encuentro es la misma coordenada exacta para ambos muros
// - Miter se aplica ANTES de snap angular
// - Ángulo < 10° → warning (acute_angle), pero permitido
// - Muros paralelos/colineales → error bloqueante
// - Presupuesto: < 3ms por llamada
// =============================================================================

import { Point2D, Wall, MiterResult, Degrees, Meters, degrees, meters } from '../../domain/geometry/types';
import { calculateMiter } from '../../domain/geometry/miter';

/** Ángulo mínimo antes de emitir warning. */
export const ACUTE_ANGLE_THRESHOLD: Degrees = degrees(10);

export class MiterHandler {
  private tolerance: Meters;

  constructor(tolerance: Meters = meters(0.05)) {
    this.tolerance = tolerance;
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  /**
   * Calcula el punto exacto de encuentro entre dos muros.
   * Delega al dominio y retorna solo el punto (API simplificada).
   */
  calculateMiterPoint(wall1: Wall, wall2: Wall): Point2D {
    const result = this.calculateMiter(wall1, wall2);
    return result.meetPoint;
  }

  /**
   * Calcula el resultado completo del miter entre dos muros.
   */
  calculateMiter(wall1: Wall, wall2: Wall): MiterResult {
    return calculateMiter(wall1, wall2, this.tolerance);
  }

  /**
   * Valida si un ángulo de encuentro es aceptable.
   *
   * - < 10° (ACUTE_ANGLE_THRESHOLD): warning, isValid = false
   * - >= 10°: ok, isValid = true
   *
   * Nota: según matriz-reglas-de-negocio.md, ángulos < 10° son warning
   * pero permitidos. isValid aquí indica si el ángulo está por encima
   * del umbral de warning, no si está prohibido.
   */
  validateMiterAngle(angle: Degrees): { isValid: boolean; warning?: string } {
    const angleVal = angle as number;

    if (angleVal < (ACUTE_ANGLE_THRESHOLD as number)) {
      return {
        isValid: false,
        warning: `acute_angle: ${angleVal.toFixed(1)}° < ${ACUTE_ANGLE_THRESHOLD}° threshold`,
      };
    }

    return { isValid: true };
  }

  /**
   * Actualiza la tolerancia de cercanía (metros).
   */
  setTolerance(tolerance: Meters): void {
    this.tolerance = tolerance;
  }

  getTolerance(): Meters {
    return this.tolerance;
  }
}
