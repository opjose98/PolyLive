// =============================================================================
// polygon-validator.ts — Pipeline de validación y normalización de polígonos
// Portado de LevON: lib/core/geometry/polygons/polygon_validator.dart
// =============================================================================
//
// Cinco pasos, en este orden:
//   1. mínimo 3 vértices
//   2. quitar el vértice de cierre duplicado, si lo hay
//   3. área por encima del mínimo (descarta micro-recintos de ruido)
//   4. sin auto-intersección
//   5. normalizar orientación a CW
//
// El orden importa: quitar el cierre ANTES de medir el área evita que un
// polígono con vértice repetido se mida mal, y validar la auto-intersección
// antes de normalizar evita invertir un polígono que se va a descartar.
// =============================================================================

import { Point2D, SquareMeters } from './types';
import { polygonArea, ensureClockwise } from './polygon-utils';

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

interface PolygonValid {
  readonly valid: true;
  /** Vértices normalizados en orientación horaria (CW). */
  readonly vertices: Point2D[];
  readonly area: SquareMeters;
}

interface PolygonInvalid {
  readonly valid: false;
  /** Describe qué paso del pipeline falló. */
  readonly reason: string;
}

type PolygonValidationResult = PolygonValid | PolygonInvalid;

interface PolygonValidatorOptions {
  /** Área mínima aceptable en m². Por debajo se descarta como micro-recinto. */
  readonly minArea?: number;
  /** Distancia por debajo de la cual dos vértices se consideran el mismo. */
  readonly epsilon?: number;
}

const DEFAULT_MIN_AREA = 0.01;
const DEFAULT_EPSILON = 0.001;

// ---------------------------------------------------------------------------
// Validador
// ---------------------------------------------------------------------------

export class PolygonValidator {
  private readonly minArea: number;
  private readonly epsilon: number;

  constructor(options: PolygonValidatorOptions = {}) {
    this.minArea = options.minArea ?? DEFAULT_MIN_AREA;
    this.epsilon = options.epsilon ?? DEFAULT_EPSILON;
  }

  validate(vertices: readonly Point2D[]): PolygonValidationResult {
    // Paso 1 — mínimo 3 vértices
    if (vertices.length < 3) {
      return { valid: false, reason: `Menos de 3 vértices (${vertices.length})` };
    }

    // Paso 2 — quitar duplicado de cierre
    let verts: readonly Point2D[] = vertices;
    if (verts.length > 3 && this.samePoint(verts[0], verts[verts.length - 1])) {
      verts = verts.slice(0, -1);
      if (verts.length < 3) {
        return { valid: false, reason: 'Menos de 3 vértices únicos tras quitar el cierre' };
      }
    }

    // Paso 3 — área suficiente
    const area = polygonArea(verts);
    if (area < this.minArea) {
      return {
        valid: false,
        reason: `Área insuficiente: ${area.toFixed(4)} m² < ${this.minArea.toFixed(4)} m²`,
      };
    }

    // Paso 4 — sin auto-intersección
    if (this.hasSelfIntersection(verts)) {
      return { valid: false, reason: 'El polígono se auto-intersecta' };
    }

    // Paso 5 — normalizar a CW
    return { valid: true, vertices: ensureClockwise(verts), area };
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private samePoint(a: Point2D, b: Point2D): boolean {
    return Math.hypot(b.x - a.x, b.y - a.y) < this.epsilon;
  }

  /** O(n²) sobre pares de lados no adyacentes. */
  private hasSelfIntersection(v: readonly Point2D[]): boolean {
    const n = v.length;
    for (let i = 0; i < n; i++) {
      const a1 = v[i];
      const a2 = v[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        // El par (n-1, 0) es adyacente al lado 0 por el cierre: no se comprueba.
        if (i === 0 && j === n - 1) continue;
        if (segmentsIntersect(a1, a2, v[j], v[(j + 1) % n])) return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Intersección estricta de segmentos
// ---------------------------------------------------------------------------

/**
 * Intersección ESTRICTA (propia): solo cuenta si los segmentos se cruzan de
 * verdad, no si apenas se tocan en un extremo o son colineales. Los muros de
 * un recinto comparten extremos por definición, así que un test inclusivo
 * marcaría todo recinto válido como auto-intersectado.
 */
function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const d1 = cross2d(sub(b2, b1), sub(a1, b1));
  const d2 = cross2d(sub(b2, b1), sub(a2, b1));
  const d3 = cross2d(sub(a2, a1), sub(b1, a1));
  const d4 = cross2d(sub(a2, a1), sub(b2, a1));

  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross2d(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}
