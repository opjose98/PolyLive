// =============================================================================
// CaptureMeasurementUseCase.ts — Captura medición BLE o manual
// Basado en: CaptureMeasurementUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Meters, meters } from '../../domain/geometry/types';
import { measurementId, IObjectStore, WallId, RoomId, MeasurementId, Measurement, generateId } from '../../domain/objects';
import { IBLEManager } from './types';
import type { MeasurementKind } from '../../domain/objects/measurement';

interface CaptureMeasurementInput {
  roomId: RoomId;
  wallId: WallId;
  method: 'ble' | 'manual';
  value?: Meters; // si method='manual'
  /**
   * Muestras YA capturadas por el llamador (si method='ble').
   *
   * POR QUÉ EXISTE: `HuepaDeviceManager.measure()` no devuelve una lectura,
   * devuelve una ráfaga de 7 ya promediada. Si la UI se la pasara a este
   * UseCase a través de `IBLEManager.measure()`, el bucle de abajo pediría 7
   * ráfagas — 49 disparos del láser por medición, unos 20 segundos de espera
   * con el operador apuntando al muro, y un promedio de promedios que ya no
   * es el que el método IQR pretende calcular.
   *
   * Con este campo, quien ya tiene las 7 muestras crudas las entrega y el
   * UseCase solo hace lo suyo: descartar outliers, promediar y persistir.
   * La vía `bleManager` se conserva intacta para los llamadores que tengan
   * un manager de lectura simple.
   */
  samples?: readonly number[];
  /** Qué se midió (cara interior / exterior / eje). Por defecto, eje. */
  reference?: MeasurementKind;
}

interface CaptureMeasurementOutput {
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

    if (input.method === 'ble' && input.samples) {
      if (input.samples.length === 0) throw new Error('La ráfaga BLE no trae ninguna muestra');
      samples.push(...input.samples);
    } else if (input.method === 'ble') {
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
    const id = measurementId(generateId());
    const measurement = new Measurement({
      id,
      roomId: input.roomId,
      wallId: input.wallId,
      capture_method: input.method,
      values_json: JSON.stringify(samples),
      average,
      reference: input.reference ?? 'axis',
    });

    await (this.store as any).createMeasurement(measurement);

    return { measurementId: id, average, samples, outliers };
  }
}
