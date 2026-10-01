// =============================================================================
// ExpoGpsProvider.test.ts — Lectura de posición GPS
// =============================================================================
//
// Lo que estos tests protegen: que nunca salga de aquí una `GpsCoordinates` con
// `accuracy <= 0`. El constructor de `SurveyControlPoint` la rechaza, y si el
// proveedor dejara pasar el `accuracy: null` que Android puede devolver, el
// fallo aparecería en el dominio, lejos de su causa, con un mensaje que no
// menciona el GPS.
// =============================================================================

import * as Location from 'expo-location';
import { ExpoGpsProvider } from '../../../src/native/location/ExpoGpsProvider';
import { AppError, AppErrorCode } from '../../../src/shared/errors/AppError';

const mockGetPermissions = Location.getForegroundPermissionsAsync as jest.Mock;
const mockRequestPermissions = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockGetPosition = Location.getCurrentPositionAsync as jest.Mock;

function fix(overrides: Record<string, unknown> = {}) {
  return {
    coords: {
      latitude: 40.4168,
      longitude: -3.7038,
      altitude: 667,
      accuracy: 5,
      altitudeAccuracy: 3,
      heading: 0,
      speed: 0,
      ...overrides,
    },
    timestamp: 1700000000000,
  };
}

describe('ExpoGpsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockGetPosition.mockResolvedValue(fix());
  });

  it('devuelve las coordenadas y la precisión de la lectura', async () => {
    const coords = await new ExpoGpsProvider().getCurrentPosition();

    expect(coords.latitude).toBeCloseTo(40.4168);
    expect(coords.longitude).toBeCloseTo(-3.7038);
    expect(Number(coords.altitude)).toBeCloseTo(667);
    expect(Number(coords.accuracy)).toBeCloseTo(5);
  });

  it('la precisión es siempre > 0 (nunca se asume precisión perfecta)', async () => {
    // Lo que sale de aquí alimenta mojones y fotos: una precisión 0 haría
    // creer que el punto es exacto.
    const coords = await new ExpoGpsProvider().getCurrentPosition();
    expect(Number(coords.accuracy)).toBeGreaterThan(0);
  });

  it('pide el permiso si no lo tiene, y continúa si se concede', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });

    await new ExpoGpsProvider().getCurrentPosition();

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockGetPosition).toHaveBeenCalledTimes(1);
  });

  it('no vuelve a pedir el permiso si ya lo tiene', async () => {
    await new ExpoGpsProvider().getCurrentPosition();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('lanza PERMISSION_DENIED si el permiso se deniega, sin intentar leer la posición', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });
    mockRequestPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await expect(new ExpoGpsProvider().getCurrentPosition()).rejects.toMatchObject({
      code: AppErrorCode.PERMISSION_DENIED,
    });
    expect(mockGetPosition).not.toHaveBeenCalled();
  });

  it('rechaza una lectura sin precisión informada en vez de inventar un valor', async () => {
    mockGetPosition.mockResolvedValue(fix({ accuracy: null }));

    await expect(new ExpoGpsProvider().getCurrentPosition()).rejects.toMatchObject({
      code: AppErrorCode.GPS_UNAVAILABLE,
    });
  });

  it('rechaza una precisión de 0 — "precisión perfecta" no existe', async () => {
    mockGetPosition.mockResolvedValue(fix({ accuracy: 0 }));

    await expect(new ExpoGpsProvider().getCurrentPosition()).rejects.toMatchObject({
      code: AppErrorCode.GPS_UNAVAILABLE,
    });
  });

  it('rechaza una precisión peor que el máximo aceptable, y lo dice con números', async () => {
    mockGetPosition.mockResolvedValue(fix({ accuracy: 80 }));

    let error: unknown;
    try {
      await new ExpoGpsProvider({ maxAcceptableAccuracyMeters: 25 }).getCurrentPosition();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).userMessage).toContain('±80');
    expect((error as AppError).userMessage).toContain('±25');
  });

  it('acepta una lectura sin altitud, tomándola como 0', async () => {
    // La cota se toma con nivel, no con GPS: la falta de altitud no invalida
    // la referencia horizontal del mojón.
    mockGetPosition.mockResolvedValue(fix({ altitude: null }));

    const coords = await new ExpoGpsProvider().getCurrentPosition();
    expect(Number(coords.altitude)).toBe(0);
  });

  it('corta con GPS_UNAVAILABLE si el fix no llega en el tiempo previsto', async () => {
    // En interiores el fix puede no llegar nunca; sin tope la pantalla se
    // quedaría colgada para siempre.
    mockGetPosition.mockImplementation(() => new Promise(() => undefined));

    await expect(
      new ExpoGpsProvider({ timeoutMs: 20 }).getCurrentPosition(),
    ).rejects.toMatchObject({ code: AppErrorCode.GPS_UNAVAILABLE });
  });

  it('envuelve un error nativo inesperado como GPS_UNAVAILABLE conservando la causa', async () => {
    mockGetPosition.mockRejectedValue(new Error('Location services are disabled'));

    let error: unknown;
    try {
      await new ExpoGpsProvider().getCurrentPosition();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.GPS_UNAVAILABLE);
    expect(String((error as AppError).cause)).toContain('Location services are disabled');
  });
});
