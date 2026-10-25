// =============================================================================
// HuepaDeviceManager.test.ts — Tests for BLE Huepa device manager
// =============================================================================

// Mock react-native-ble-plx to prevent native module loading
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(() => ({
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn(),
    cancelDeviceConnection: jest.fn(),
    readCharacteristicForDevice: jest.fn(),
    destroy: jest.fn(),
  })),
}));

import {
  HuepaDeviceManager,
  createHuepaManager,
} from '../../../src/native/ble/HuepaDeviceManager';

// ---------------------------------------------------------------------------
// Tests — Mock mode (no hardware required)
// ---------------------------------------------------------------------------

describe('HuepaDeviceManager (mock mode)', () => {
  let manager: HuepaDeviceManager;

  beforeEach(() => {
    manager = new HuepaDeviceManager({ useMock: true, sampleCount: 7 });
  });

  afterEach(async () => {
    await manager.destroy();
  });

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  describe('state management', () => {
    it('should start in disconnected state', () => {
      expect(manager.getState()).toBe('disconnected');
      expect(manager.isConnected()).toBe(false);
      expect(manager.getConnectedDevice()).toBeNull();
    });

    it('should transition to connected on mock connect', async () => {
      await manager.connect('mock-id');
      expect(manager.getState()).toBe('connected');
      expect(manager.isConnected()).toBe(true);
      expect(manager.getConnectedDevice()).not.toBeNull();
    });

    it('should transition back to disconnected on disconnect', async () => {
      await manager.connect('mock-id');
      await manager.disconnect();
      expect(manager.getState()).toBe('disconnected');
      expect(manager.isConnected()).toBe(false);
      expect(manager.getConnectedDevice()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Scan
  // -----------------------------------------------------------------------

  describe('scan (mock)', () => {
    it('should return mock devices', async () => {
      const devices = await manager.scan();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].name).toContain('Huepa');
      expect(devices[0].id).toBeDefined();
      expect(devices[0].rssi).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Measure
  // -----------------------------------------------------------------------

  describe('measure (mock)', () => {
    it('should return 7 samples', async () => {
      await manager.connect('mock-id');
      const result = await manager.measure();

      expect(result.samples).toHaveLength(7);
      expect(result.source).toBe('mock');
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should return distance around 3.45m', async () => {
      await manager.connect('mock-id');
      const result = await manager.measure();

      expect(result.distance).toBeGreaterThan(3.4);
      expect(result.distance).toBeLessThan(3.5);
    });

    it('should calculate standard deviation', async () => {
      await manager.connect('mock-id');
      const result = await manager.measure();

      expect(result.stdDeviation).toBeDefined();
      expect(result.stdDeviation).toBeGreaterThanOrEqual(0);
      expect(result.stdDeviation).toBeLessThan(0.01); // <10mm deviation
    });

    it('should have all samples within ±5mm of base', async () => {
      await manager.connect('mock-id');
      const result = await manager.measure();

      for (const sample of result.samples) {
        expect(Math.abs(sample - 3.45)).toBeLessThan(0.006); // ±5mm + epsilon
      }
    });

    it('should have 3 decimal precision on distance', async () => {
      await manager.connect('mock-id');
      const result = await manager.measure();

      const decimals = result.distance.toString().split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // Full flow: scanAndMeasure
  // -----------------------------------------------------------------------

  describe('scanAndMeasure (mock)', () => {
    it('should complete full flow and return result', async () => {
      const result = await manager.scanAndMeasure();

      expect(result.samples).toHaveLength(7);
      expect(result.distance).toBeGreaterThan(0);
      expect(result.source).toBe('mock');
      expect(manager.getState()).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Custom sample count
  // -----------------------------------------------------------------------

  describe('custom configuration', () => {
    it('should support custom sample count', async () => {
      const custom = new HuepaDeviceManager({ useMock: true, sampleCount: 3 });
      await custom.connect('mock-id');
      const result = await custom.measure();

      expect(result.samples).toHaveLength(3);
      await custom.destroy();
    });

    it('should support single sample', async () => {
      const custom = new HuepaDeviceManager({ useMock: true, sampleCount: 1 });
      await custom.connect('mock-id');
      const result = await custom.measure();

      expect(result.samples).toHaveLength(1);
      expect(result.stdDeviation).toBe(0); // 1 sample = 0 deviation
      await custom.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe('createHuepaManager factory', () => {
    it('should create mock manager', () => {
      const m = createHuepaManager(true);
      expect(m).toBeInstanceOf(HuepaDeviceManager);
      expect(m.getState()).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Destroy
  // -----------------------------------------------------------------------

  describe('destroy', () => {
    it('should disconnect and cleanup', async () => {
      await manager.connect('mock-id');
      expect(manager.isConnected()).toBe(true);

      await manager.destroy();
      expect(manager.getState()).toBe('disconnected');
      expect(manager.getConnectedDevice()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // parseDistance — decodificación del valor BLE (protocolo Huepa)
  // -----------------------------------------------------------------------
  //
  // GAP CERRADO durante auditoría: este método usaba `Buffer.from(...)` +
  // `Buffer.readFloatLE()` (API de Node) para decodificar el float32 que
  // llega del characteristic BLE — el global `Buffer` no existe en
  // Hermes/React Native. El modo `useMock: true` (usado por el resto de esta
  // suite) NUNCA ejercita este método, así que el bug era invisible sin un
  // test dedicado. `parseDistance` es privado — se accede vía `as any`
  // porque no existe ninguna ruta pública que lo ejercite sin hardware BLE real.
  describe('parseDistance (decodificación del protocolo Huepa)', () => {
    it('decodifica un float32 little-endian codificado en Base64 sin usar Buffer', () => {
      // 1.234 como float32 little-endian, Base64 — generado una sola vez con
      // Node (Buffer.from(new Float32Array([1.234]).buffer).toString('base64'))
      // y fijado como golden value: el propio test no debe depender de Buffer
      // para no enmascarar una futura regresión del mismo tipo.
      const base64Float = 'tvOdPw==';

      const result = (manager as any).parseDistance(base64Float);

      expect(result).toBeCloseTo(1.234, 3);
    });

    it('lanza un error claro si el valor decodificado tiene menos de 4 bytes', () => {
      const tooShort = 'AA=='; // 1 byte decodificado, no alcanza para un float32
      expect(() => (manager as any).parseDistance(tooShort)).toThrow('Invalid measurement data');
    });
  });
});
