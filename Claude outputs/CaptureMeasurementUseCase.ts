// =============================================================================
// CaptureMeasurementUseCase.ts — Captura medición BLE o manual
// Basado en: CaptureMeasurementUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Meters, meters } from '../../domain/geometry/types';
import {
  IObjectStore,
  WallId,
  RoomId,
  MeasurementId,
  Measurement,
  measurementId as toMeasurementId,
  generateId,
} from '../../domain/objects';
import { IBLEManager } from './types';

export interface CaptureMeasurementInput {
  roomId: RoomId;
  wallId: WallId;
  method: 'ble' | 'manual';
  value?: Meters; // si method='manual'
}

export interface CaptureMeasurementOutput {
  measurementId: MeasurementId;
  average: Meters;
  samples: number[];
  outliers: number[];
}

export class CaptureMeasurementUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly bleManager?: IBLEManager,
  ) {}

  async execute(input: CaptureMeasurementInput): Promise<CaptureMeasurementOutput> {
    const samples: number[] = [];

    if (input.method === 'ble') {
      if (!this.bleManager) throw new Error('BLE Manager no disponible');
      // Capturar 7 muestras
      for (let i = 0; i < 7; i++) {
        const distance = await this.bleManager.measure();
        samples.push(distance);
      }
    } else {
      if (input.value == null) throw new Error('Valor manual requerido');
      samples.push(input.value as number);
    }

    // Descartar outliers (IQR method)
    const sorted = [...samples].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(samples.length * 0.25)];
    const q3 = sorted[Math.floor(samples.length * 0.75)];
    const iqr = q3 - q1;

    const outliers: number[] = [];
    const validSamples = samples.filter((s, i) => {
      if (s < q1 - 1.5 * iqr || s > q3 + 1.5 * iqr) {
        outliers.push(i);
        return false;
      }
      return true;
    });

    const avg = validSamples.reduce((a, b) => a + b, 0) / validSamples.length;
    const average = meters(avg);

    // Persistir
    const id = generateId() as unknown as MeasurementId;
    const measurement = new Measurement({
      id,
      roomId: input.roomId,
      wallId: input.wallId,
      capture_method: input.method,
      values_json: JSON.stringify(samples),
      average,
    });

    await (this.store as any).createMeasurement(measurement);

    return { measurementId: id, average, samples, outliers };
  }
}
