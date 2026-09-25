// =============================================================================
// measurement.ts — Measurement: Medición BLE o manual
// Basado en: CaptureMeasurementUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Meters } from '../geometry/types';
import { RevitObjectId, RoomId, WallId, MeasurementId } from './base';

/**
 * Tipo de captura de medición.
 * - 'ble': 7 muestras via BLE, promedio con descarte de outliers (IQR)
 * - 'manual': 1 muestra ingresada por el usuario
 */
export type CaptureMethod = 'ble' | 'manual';

/**
 * Una medición almacena las muestras capturadas y su promedio.
 * No hereda de RevitObjectBase — es una entidad independiente vinculada a un Wall.
 *
 * INVARIANTES:
 * - capture_method es 'ble' o 'manual'
 * - values_json contiene array de muestras (Meters[])
 * - average es el promedio de muestras válidas (sin outliers)
 * - wallId referencia a un Wall existente
 */
export class Measurement {
  readonly id: MeasurementId;
  readonly roomId: RoomId;
  readonly wallId: WallId;

  capture_method: CaptureMethod;
  values_json: string;
  average: Meters;

  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  constructor(params: {
    id: MeasurementId;
    roomId: RoomId;
    wallId: WallId;
    capture_method: CaptureMethod;
    values_json: string;
    average: Meters;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
  }) {
    this.id = params.id;
    this.roomId = params.roomId;
    this.wallId = params.wallId;
    this.capture_method = params.capture_method;
    this.values_json = params.values_json;
    this.average = params.average;
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }

  /** Obtener las muestras parseadas. */
  get samples(): number[] {
    return JSON.parse(this.values_json);
  }
}
