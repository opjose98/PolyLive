// =============================================================================
// gpsAverage.ts — Promedio de lecturas GPS (celular quieto N segundos)
// =============================================================================
//
// Un GPS de celular salta varios metros entre lecturas. Dejarlo quieto y
// promediar reduce el ruido aleatorio (no el sesgo). Cada lectura pesa según
// su precisión declarada (1/σ²); se reporta la dispersión real observada, que
// suele ser más honesta que la precisión que declara el sistema.
// =============================================================================

/**
 * Una posición del GPS tal como la entrega el proveedor (una lectura suelta,
 * p. ej. para la foto o para sugerir el sistema de coordenadas).
 */
export interface GpsCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number;
  /** Precisión horizontal (m). SIEMPRE > 0: nunca se asume precisión perfecta. */
  readonly accuracy: number;
}

export interface GpsFix {
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  /** Precisión horizontal declarada (m, 1σ). */
  readonly accuracy: number;
  readonly altitudeAccuracy?: number | null;
  readonly timestamp: number;
}

export interface GpsAverage {
  readonly lat: number;
  readonly lon: number;
  readonly alt: number | null;
  readonly samples: number;
  /** Dispersión horizontal observada (m, RMS respecto de la media). */
  readonly spread: number;
  /** Precisión declarada media (m). */
  readonly meanAccuracy: number;
}

const M_PER_DEG_LAT = 111_320;

export function averageFixes(fixes: readonly GpsFix[]): GpsAverage | null {
  const valid = fixes.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && f.accuracy > 0);
  if (valid.length === 0) return null;
  let w = 0;
  let lat = 0;
  let lon = 0;
  let altW = 0;
  let alt = 0;
  for (const f of valid) {
    const k = 1 / (f.accuracy * f.accuracy);
    w += k;
    lat += f.lat * k;
    lon += f.lon * k;
    if (f.alt !== null && Number.isFinite(f.alt)) {
      altW += k;
      alt += f.alt * k;
    }
  }
  lat /= w;
  lon /= w;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const spread = Math.sqrt(
    valid.reduce((acc, f) => {
      const dy = (f.lat - lat) * M_PER_DEG_LAT;
      const dx = (f.lon - lon) * mPerDegLon;
      return acc + dx * dx + dy * dy;
    }, 0) / valid.length,
  );
  return {
    lat,
    lon,
    alt: altW > 0 ? alt / altW : null,
    samples: valid.length,
    spread,
    meanAccuracy: valid.reduce((a, f) => a + f.accuracy, 0) / valid.length,
  };
}

/** Umbral a partir del cual se AVISA (no se bloquea) que el punto es impreciso. */
export const GPS_WARN_METERS = 5;
