// =============================================================================
// ExpoGpsProvider.ts — Lectura de posición GPS sobre expo-location
// Basado en: gpsAnchor-referencia.md, SurveyControlPoint.md,
//            permissions-ios-android.md
// =============================================================================
//
// GAP CERRADO: `expo-location` estaba declarado en package.json y el único
// archivo que lo importaba era PermissionsManager — solo para PEDIR el permiso.
// Nunca se leía una posición. El resultado: `SurveyControlPoint` exige unas
// `GpsCoordinates` con `accuracy > 0`, y no existía ninguna forma de obtenerlas
// en la app; cualquier pantalla de topografía habría tenido que inventarlas.
//
// CONTRATO: `IGpsProvider` deja la capa de aplicación independiente de Expo, lo
// que permite inyectar un proveedor fijo en tests y en el modo de escritorio.
//
// INVARIANTE QUE ESTA CLASE SOSTIENE: nunca devuelve `accuracy <= 0`. Android
// e iOS pueden entregar `accuracy: null` (sin estimación) o 0; aceptarlo tal
// cual haría estallar el constructor de SurveyControlPoint más tarde, lejos de
// la causa. Aquí se convierte en un error explícito o en el peor caso conocido.
// =============================================================================

import * as Location from 'expo-location';
import { meters, Meters } from '../../domain/geometry/types';
import { GpsCoordinates } from '../../domain/objects/survey';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface IGpsProvider {
  /** Posición actual. Lanza AppError si no hay permiso o no se puede fijar. */
  getCurrentPosition(): Promise<GpsCoordinates>;
}

export interface ExpoGpsProviderConfig {
  /**
   * Precisión pedida al sistema. `High` es lo adecuado en topografía: el modo
   * `Balanced` puede resolver por red y devolver un error de cientos de metros,
   * que como referencia de un mojón no sirve de nada.
   */
  accuracy: Location.LocationAccuracy;
  /** Tope de espera. En interiores el fix puede no llegar nunca. */
  timeoutMs: number;
  /**
   * Precisión máxima aceptable, en metros. Una lectura peor se rechaza en vez
   * de guardarse: un mojón con ±80 m de error es peor que no tener mojón,
   * porque parece un dato y no lo es.
   */
  maxAcceptableAccuracyMeters: number;
}

export const DEFAULT_GPS_CONFIG: ExpoGpsProviderConfig = {
  accuracy: 4 as Location.LocationAccuracy, // LocationAccuracy.High
  timeoutMs: 15000,
  maxAcceptableAccuracyMeters: 25,
};

export class ExpoGpsProvider implements IGpsProvider {
  private readonly config: ExpoGpsProviderConfig;

  constructor(config?: Partial<ExpoGpsProviderConfig>) {
    this.config = { ...DEFAULT_GPS_CONFIG, ...config };
  }

  async getCurrentPosition(): Promise<GpsCoordinates> {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      if (requested.status !== 'granted') {
        throw new AppError({
          code: AppErrorCode.PERMISSION_DENIED,
          userMessage: 'Se necesita permiso de ubicación para capturar un punto de control.',
          technicalDetail: `Location foreground permission status: ${requested.status}`,
        });
      }
    }

    let position: Location.LocationObject;
    try {
      // `Promise.race` y no la opción nativa de timeout: expo-location no
      // expone ninguna, y sin tope la pantalla se queda colgada para siempre
      // dentro de un edificio — el escenario habitual de un levantamiento.
      position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: this.config.accuracy }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new AppError({
                  code: AppErrorCode.GPS_UNAVAILABLE,
                  userMessage:
                    'No se pudo fijar la posición GPS. Prueba al aire libre o introduce las coordenadas a mano.',
                  technicalDetail: `getCurrentPositionAsync timed out after ${this.config.timeoutMs} ms`,
                }),
              ),
            this.config.timeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.wrap(err, AppErrorCode.GPS_UNAVAILABLE, 'No se pudo leer la posición GPS.');
    }

    return this.toGpsCoordinates(position);
  }

  private toGpsCoordinates(position: Location.LocationObject): GpsCoordinates {
    const { latitude, longitude, altitude, accuracy } = position.coords;

    // El sistema puede devolver `null` en accuracy (sin estimación disponible).
    // Se rechaza en vez de sustituirlo por un número inventado: la invariante
    // de SurveyControlPoint es precisamente "nunca asumir precisión perfecta".
    if (accuracy == null || !(accuracy > 0)) {
      throw new AppError({
        code: AppErrorCode.GPS_UNAVAILABLE,
        userMessage: 'El dispositivo no informó de la precisión de la posición. No se puede guardar el punto.',
        technicalDetail: `Location reported accuracy = ${String(accuracy)}`,
      });
    }

    if (accuracy > this.config.maxAcceptableAccuracyMeters) {
      throw new AppError({
        code: AppErrorCode.GPS_UNAVAILABLE,
        userMessage:
          `La precisión GPS es de ±${accuracy.toFixed(0)} m, peor que el máximo aceptable ` +
          `(±${this.config.maxAcceptableAccuracyMeters} m). Espera a tener mejor señal.`,
        technicalDetail: `accuracy ${accuracy} > max ${this.config.maxAcceptableAccuracyMeters}`,
      });
    }

    return {
      latitude,
      longitude,
      // Altitud ausente no invalida la lectura: la cota se toma con nivel, no
      // con GPS, y el plano horizontal es lo que interesa del mojón.
      altitude: meters(altitude ?? 0),
      accuracy: meters(accuracy) as Meters,
    };
  }
}
