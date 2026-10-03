// =============================================================================
// watchPosition.ts — Posición y rumbo en vivo (replanteo con GPS, M2b)
// =============================================================================

import * as Location from 'expo-location';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface LiveFix {
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  /** Precisión horizontal (m). */
  readonly accuracy: number | null;
}

/** Escucha la posición (≈1 por segundo) y el rumbo de la brújula. Devuelve cómo detener. */
export async function watchPositionAndHeading(
  onFix: (f: LiveFix) => void,
  onHeading: (trueHeadingDeg: number) => void,
): Promise<() => void> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new AppError({
      code: AppErrorCode.PERMISSION_DENIED,
      userMessage: 'Se necesita permiso de ubicación para replantear con GPS.',
      technicalDetail: `Location permission: ${perm.status}`,
    });
  }
  const pos = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (l) => onFix({ lat: l.coords.latitude, lon: l.coords.longitude, alt: l.coords.altitude ?? null, accuracy: l.coords.accuracy ?? null }),
  );
  let head: Location.LocationSubscription | null = null;
  try {
    head = await Location.watchHeadingAsync((h) => {
      // trueHeading es -1 mientras no hay ubicación: se usa el magnético.
      onHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
    });
  } catch {
    // Sin brújula: la guía sigue funcionando por N/E, sin flecha.
  }
  return () => {
    pos.remove();
    head?.remove();
  };
}
