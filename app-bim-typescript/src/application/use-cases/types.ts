// =============================================================================
// types.ts — Tipos compartidos de los UseCases
// =============================================================================

import { ValidationWarning } from '../../domain/geometry/types';

/** Resultado de validación genérico. */
export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}

/** Error de validación que impide persistencia. */
export class ValidationError extends Error {
  readonly warnings: ValidationWarning[];

  constructor(warnings: ValidationWarning[]) {
    super(`Validation failed: ${warnings.map((w) => w.message).join(', ')}`);
    this.name = 'ValidationError';
    this.warnings = warnings;
  }
}

/**
 * Servicio de validación genérico — interfaz para inyección.
 * Los UseCases lo usan para validar según el tipo de objeto.
 */
export interface IValidationService {
  validateWall(wall: any, context?: any): ValidationResult;
  validateColumn(column: any): ValidationResult;
  validateDoor(door: any, context?: { walls: any[] }): ValidationResult;
  validateWindow(window: any, context?: { walls: any[] }): ValidationResult;
  validateRoom(room: any, triangulation?: any): ValidationResult;
  validateExport(room: any): ValidationResult;
}

/** Interfaz BLE Manager para mediciones. */
export interface IBLEManager {
  measure(): Promise<number>;
}

/** Interfaz IFC Serializer. */
export interface IIFCSerializer {
  serialize(data: {
    room: any;
    walls: any[];
    doors: any[];
    windows: any[];
    columns: any[];
    floor: any;
    /** Niveles, fases, antepechos y metadatos (ver infrastructure/export/ifc/types.ts). */
    [extra: string]: unknown;
  }): Promise<string>;
}

/** Interfaz CDT (Constrained Delaunay Triangulation). */
export interface ICDT {
  triangulate(
    boundary: Array<{ x: number; y: number }>,
    holes?: Array<Array<{ x: number; y: number }>>,
  ): Promise<{ totalArea: number; triangles: any[]; valid: boolean; warnings: any[] }>;
}
