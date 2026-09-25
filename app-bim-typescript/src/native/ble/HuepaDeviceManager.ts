// =============================================================================
// HuepaDeviceManager.ts — BLE integration with Huepa laser distance meter
// Basado en: ble-huepa-device.md, CaptureMeasurementUseCase.md
// =============================================================================
//
// Gestiona la conexión BLE con el dispositivo Huepa:
//   scan → connect → measure 7x → calculate → disconnect
//
// Incluye fallback mock para desarrollo sin hardware.
//
// INVARIANTES:
// - 7 muestras @ ~100ms intervalos
// - Resultado incluye promedio + desviación estándar
// - Precisión esperada: ±5mm
// =============================================================================

import { base64ToUint8Array } from '../../shared/encoding/base64';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MeasurementResult {
  readonly distance: number;       // metros (promedio de 7 muestras)
  readonly stdDeviation: number;   // metros
  readonly samples: readonly number[];  // las 7 mediciones individuales
  readonly timestamp: number;      // Date.now()
  readonly source: 'huepa' | 'mock';
}

export interface BLEDevice {
  readonly id: string;
  readonly name: string;
  readonly rssi: number;
}

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'measuring';

export interface HuepaConfig {
  readonly sampleCount: number;       // default: 7
  readonly sampleIntervalMs: number;  // default: 100
  readonly scanTimeoutMs: number;     // default: 10000
  readonly deviceNamePrefix: string;  // default: 'Huepa'
  readonly useMock: boolean;          // default: false
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: HuepaConfig = {
  sampleCount: 7,
  sampleIntervalMs: 100,
  scanTimeoutMs: 10000,
  deviceNamePrefix: 'Huepa',
  useMock: false,
};

// ---------------------------------------------------------------------------
// BLE Service/Characteristic UUIDs (Huepa protocol)
// ---------------------------------------------------------------------------

const HUEPA_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const HUEPA_MEASUREMENT_CHAR_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

// ---------------------------------------------------------------------------
// HuepaDeviceManager
// ---------------------------------------------------------------------------

export class HuepaDeviceManager {
  private config: HuepaConfig;
  private state: ConnectionState = 'disconnected';
  private connectedDevice: BLEDevice | null = null;
  private bleManager: any; // react-native-ble-plx BleManager

  constructor(config?: Partial<HuepaConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.useMock) {
      try {
        // Lazy import to allow mock usage without BLE native module
        const { BleManager } = require('react-native-ble-plx');
        this.bleManager = new BleManager();
      } catch {
        // BLE not available — fallback to mock
        this.config = { ...this.config, useMock: true };
      }
    }
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  getState(): ConnectionState {
    return this.state;
  }

  getConnectedDevice(): BLEDevice | null {
    return this.connectedDevice;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  // -------------------------------------------------------------------------
  // Scan
  // -------------------------------------------------------------------------

  async scan(): Promise<BLEDevice[]> {
    if (this.config.useMock) {
      return this.mockScan();
    }

    this.state = 'scanning';
    const devices: BLEDevice[] = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        this.state = 'disconnected';
        resolve(devices);
      }, this.config.scanTimeoutMs);

      this.bleManager.startDeviceScan(
        [HUEPA_SERVICE_UUID],
        null,
        (error: any, device: any) => {
          if (error) {
            clearTimeout(timeout);
            this.state = 'disconnected';
            reject(new Error(`BLE scan error: ${error.message}`));
            return;
          }

          if (device?.name?.startsWith(this.config.deviceNamePrefix)) {
            const bleDevice: BLEDevice = {
              id: device.id,
              name: device.name,
              rssi: device.rssi ?? -100,
            };

            if (!devices.find(d => d.id === bleDevice.id)) {
              devices.push(bleDevice);
            }
          }
        },
      );
    });
  }

  // -------------------------------------------------------------------------
  // Connect / Disconnect
  // -------------------------------------------------------------------------

  async connect(deviceId: string): Promise<void> {
    if (this.config.useMock) {
      this.state = 'connected';
      this.connectedDevice = { id: 'mock-huepa', name: 'Huepa Mock', rssi: -50 };
      return;
    }

    this.state = 'connecting';

    try {
      const device = await this.bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      this.connectedDevice = {
        id: device.id,
        name: device.name ?? 'Huepa',
        rssi: device.rssi ?? -100,
      };
      this.state = 'connected';
    } catch (error: any) {
      this.state = 'disconnected';
      throw new Error(`BLE connect error: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.config.useMock) {
      this.state = 'disconnected';
      this.connectedDevice = null;
      return;
    }

    if (this.connectedDevice) {
      try {
        await this.bleManager.cancelDeviceConnection(this.connectedDevice.id);
      } catch {
        // Ignore disconnect errors
      }
    }

    this.state = 'disconnected';
    this.connectedDevice = null;
  }

  // -------------------------------------------------------------------------
  // Measure
  // -------------------------------------------------------------------------

  async measure(): Promise<MeasurementResult> {
    if (this.config.useMock) {
      return this.mockMeasure();
    }

    if (this.state !== 'connected' || !this.connectedDevice) {
      throw new Error('Not connected to Huepa device');
    }

    this.state = 'measuring';
    const samples: number[] = [];

    try {
      for (let i = 0; i < this.config.sampleCount; i++) {
        const characteristic = await this.bleManager.readCharacteristicForDevice(
          this.connectedDevice.id,
          HUEPA_SERVICE_UUID,
          HUEPA_MEASUREMENT_CHAR_UUID,
        );

        const value = this.parseDistance(characteristic.value ?? '');
        samples.push(value);

        if (i < this.config.sampleCount - 1) {
          await this.delay(this.config.sampleIntervalMs);
        }
      }

      this.state = 'connected';
      return this.calculateResult(samples, 'huepa');
    } catch (error: any) {
      this.state = 'connected';
      throw new Error(`BLE measurement error: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Full flow: scan → connect → measure → disconnect
  // -------------------------------------------------------------------------

  async scanAndMeasure(): Promise<MeasurementResult> {
    const devices = await this.scan();

    if (devices.length === 0) {
      if (this.config.useMock) {
        return this.mockMeasure();
      }
      throw new Error('No Huepa device found');
    }

    // Connect to the closest device (highest RSSI)
    const closest = devices.reduce((a, b) => (a.rssi > b.rssi ? a : b));
    await this.connect(closest.id);

    try {
      const result = await this.measure();
      return result;
    } finally {
      await this.disconnect();
    }
  }

  // -------------------------------------------------------------------------
  // Mock implementation (development fallback)
  // -------------------------------------------------------------------------

  private mockScan(): Promise<BLEDevice[]> {
    return Promise.resolve([
      { id: 'mock-huepa-001', name: 'Huepa DM-200', rssi: -45 },
    ]);
  }

  private async mockMeasure(): Promise<MeasurementResult> {
    this.state = 'measuring';
    const samples: number[] = [];
    const baseDistance = 3.45; // metros simulados

    for (let i = 0; i < this.config.sampleCount; i++) {
      // Simula variación ±5mm (distribución normal simplificada)
      const noise = (Math.random() - 0.5) * 0.01; // ±5mm
      samples.push(baseDistance + noise);

      if (i < this.config.sampleCount - 1) {
        await this.delay(this.config.sampleIntervalMs);
      }
    }

    this.state = this.connectedDevice ? 'connected' : 'disconnected';
    return this.calculateResult(samples, 'mock');
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private calculateResult(
    samples: number[],
    source: 'huepa' | 'mock',
  ): MeasurementResult {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((sum, s) => sum + (s - mean) ** 2, 0) / samples.length;
    const stdDeviation = Math.sqrt(variance);

    return {
      distance: Math.round(mean * 1000) / 1000, // 3 decimales (mm)
      stdDeviation: Math.round(stdDeviation * 10000) / 10000,
      samples: Object.freeze([...samples]),
      timestamp: Date.now(),
      source,
    };
  }

  private parseDistance(base64Value: string): number {
    // Huepa protocol: 4 bytes IEEE 754 float (little-endian)
    //
    // GAP CORREGIDO durante auditoría: usaba `Buffer.from(...)` +
    // `Buffer.readFloatLE()` (API de Node), pero el global `Buffer` no existe
    // en Hermes/React Native — esto habría lanzado `ReferenceError: Buffer is
    // not defined` en cuanto llegara una medición real de un Huepa por BLE en
    // un dispositivo (el modo `useMock` de este manager nunca ejercitaba esta
    // ruta, así que el bug era invisible en los tests existentes). Se
    // reemplaza por `base64ToUint8Array` (sin dependencias de plataforma) +
    // `DataView.getFloat32` (API estándar de JS, disponible en cualquier motor).
    const bytes = base64ToUint8Array(base64Value);
    if (bytes.length >= 4) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return view.getFloat32(0, /* littleEndian */ true);
    }
    throw new Error('Invalid measurement data');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async destroy(): Promise<void> {
    await this.disconnect();
    if (this.bleManager) {
      this.bleManager.destroy();
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function for easy usage
// ---------------------------------------------------------------------------

export function createHuepaManager(useMock: boolean = false): HuepaDeviceManager {
  return new HuepaDeviceManager({ useMock });
}
