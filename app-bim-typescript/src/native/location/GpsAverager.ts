// =============================================================================
// GpsAverager.ts — Tomar un punto GPS promediando N segundos
// =============================================================================
//
// Se pide al operador dejar el celular QUIETO; se escuchan las posiciones
// (una por segundo aprox.) y al terminar se promedian (domain/geo/gpsAverage).
// Se puede cancelar en cualquier momento. La interfaz recibe el progreso para
// dibujar el anillo y la precisión en vivo.
// =============================================================================

import * as Location from 'expo-location';
import { GpsAverage, GpsFix, averageFixes } from '../../domain/geo/gpsAverage';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface GpsProgress {
  readonly elapsedMs: number;
  readonly totalMs: number;
  readonly samples: number;
  /** Promedio parcial (para mostrar la precisión mientras se mide). */
  readonly partial: GpsAverage | null;
}

export interface GpsSession {
  /** Resuelve con el promedio al cumplirse el tiempo (o al detener antes). */
  readonly result: Promise<GpsAverage>;
  /** Termina ya y promedia lo que haya. */
  stop(): void;
  /** Descarta todo. */
  cancel(): void;
}

async function ensurePermission(): Promise<void> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return;
  const asked = await Location.requestForegroundPermissionsAsync();
  if (asked.status !== 'granted') {
    throw new AppError({
      code: AppErrorCode.PERMISSION_DENIED,
      userMessage: 'Se necesita permiso de ubicación para tomar un punto GPS.',
      technicalDetail: `Location permission: ${asked.status}`,
    });
  }
}

export function startGpsAveraging(seconds: number, onProgress: (p: GpsProgress) => void): GpsSession {
  const totalMs = Math.max(5, seconds) * 1000;
  const fixes: GpsFix[] = [];
  let sub: Location.LocationSubscription | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finished = false;
  let resolveFn: (v: GpsAverage) => void = () => undefined;
  let rejectFn: (e: unknown) => void = () => undefined;
  const t0 = Date.now();

  const result = new Promise<GpsAverage>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  const cleanup = () => {
    finished = true;
    sub?.remove();
    if (timer) clearInterval(timer);
  };

  const finish = () => {
    if (finished) return;
    cleanup();
    const avg = averageFixes(fixes);
    if (avg) resolveFn(avg);
    else
      rejectFn(
        new AppError({
          code: AppErrorCode.GPS_UNAVAILABLE,
          userMessage: 'No llegó ninguna posición GPS. Prueba al aire libre o digita las coordenadas.',
          technicalDetail: 'GpsAverager: 0 fixes',
        }),
      );
  };

  (async () => {
    try {
      await ensurePermission();
      if (finished) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          fixes.push({
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            alt: loc.coords.altitude,
            accuracy: loc.coords.accuracy ?? 50,
            altitudeAccuracy: loc.coords.altitudeAccuracy,
            timestamp: loc.timestamp,
          });
        },
      );
      timer = setInterval(() => {
        const elapsedMs = Date.now() - t0;
        onProgress({ elapsedMs, totalMs, samples: fixes.length, partial: averageFixes(fixes) });
        if (elapsedMs >= totalMs) finish();
      }, 500);
    } catch (err) {
      cleanup();
      rejectFn(err);
    }
  })();

  return {
    result,
    stop: finish,
    cancel: () => {
      if (finished) return;
      cleanup();
      rejectFn(new AppError({ code: AppErrorCode.GPS_UNAVAILABLE, userMessage: 'Medición cancelada.', technicalDetail: 'cancelled' }));
    },
  };
}
