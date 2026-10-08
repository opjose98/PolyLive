// =============================================================================
// types.ts — Tipos Geométricos Fundamentales
// Basado en: tipos-geométricos.md, sistema-coordenadas-6-capas.md
// =============================================================================

// ---------------------------------------------------------------------------
// Branded Types — Unidades tipadas para evitar confusiones
// ---------------------------------------------------------------------------

/** Metros lineales (float64). Branded para no mezclar con píxeles o grados. */
export type Meters = number & { readonly __brand: 'Meters' };

/** Metros cuadrados (float64). Branded para no mezclar con longitudes. */
export type SquareMeters = number & { readonly __brand: 'SquareMeters' };

/** Grados sexagesimales, normalizados a [0, 360). */
export type Degrees = number & { readonly __brand: 'Degrees' };

// Constructores de branded types

export function meters(value: number): Meters {
  return value as Meters;
}

export function squareMeters(value: number): SquareMeters {
  return value as SquareMeters;
}

export function degrees(value: number): Degrees {
  const normalized = ((value % 360) + 360) % 360;
  return normalized as Degrees;
}

// ---------------------------------------------------------------------------
// Tipos geométricos base
// ---------------------------------------------------------------------------

/** Punto en 2D. Convención: X+ derecha, Y+ abajo en Canvas. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Resultado de triangulación
// ---------------------------------------------------------------------------

export type ValidationWarningType =
  | 'degenerate_triangle'
  | 'self_intersecting_polygon'
  | 'duplicate_vertices'
  | 'unclosed_polygon'
  | 'acute_angle';

export interface ValidationWarning {
  readonly type: ValidationWarningType;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transformación de Canvas (zoom + pan)
// ---------------------------------------------------------------------------

/** Escala y offset para convertir entre coordenadas mundo y pantalla. */
export interface CanvasTransform {
  readonly scale: number;    // píxeles por metro
  readonly offsetX: number;  // píxeles
  readonly offsetY: number;  // píxeles
  /**
   * Giro de la VISTA, en radianes (horario en pantalla). Solo visual: el
   * modelo no cambia. Ausente = 0, así que las cámaras de antes siguen igual.
   */
  readonly rotation?: number;
}

// ---------------------------------------------------------------------------
// Tipos de muro y vano (usados por miter, proyecciones)
// ---------------------------------------------------------------------------

export interface Wall {
  readonly startPoint: Point2D;
  readonly endPoint: Point2D;
  readonly thickness: Meters;
  readonly length: Meters;
}

export interface VanoDimensions {
  readonly offsetAlongWall: Meters;
  readonly offsetPerpendicular: Meters;
  readonly width: Meters;
  readonly height: Meters;
}

export interface MiterResult {
  readonly meetPoint: Point2D;
  readonly wall1EndPoint: Point2D;
  readonly wall2StartPoint: Point2D;
  readonly angle: Degrees;
  readonly isValid: boolean;
  readonly warning?: string;
}

// ---------------------------------------------------------------------------
// Constantes globales de geometría
// ---------------------------------------------------------------------------

/** Tolerancia para comparaciones de punto flotante (metros). */
export const EPSILON = 1e-9;
