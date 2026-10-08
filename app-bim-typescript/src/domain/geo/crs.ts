// =============================================================================
// crs.ts — Sistemas de coordenadas de referencia (Colombia)
// =============================================================================
//
// MAGNA-SIRGAS (el datum oficial de Colombia) en sus proyecciones planas:
//   - Gauss-Krüger con 5 orígenes (Oeste-Oeste, Oeste, Bogotá, Este,
//     Este-Este), cada uno cubre una franja de 3° de longitud.
//   - Origen Único Nacional (CTM12, MAGNA-SIRGAS 2018): un solo plano para
//     todo el país, el que exige hoy el IGAC.
//   - Geográficas (latitud / longitud).
//
// Las definiciones proj4 van embebidas: la conversión funciona sin red, en
// obra. Fuente: EPSG (epsg.io) 3114–3118, 9377, 4686.
// =============================================================================

import proj4 from 'proj4';

export type CrsId = 'EPSG:3114' | 'EPSG:3115' | 'EPSG:3116' | 'EPSG:3117' | 'EPSG:3118' | 'EPSG:9377' | 'EPSG:4686';

interface CrsDef {
  readonly id: CrsId;
  readonly name: string;
  readonly short: string;
  /** Proyectado (metros E/N) o geográfico (grados). */
  readonly kind: 'projected' | 'geographic';
  /** Meridiano central (grados) de las Gauss-Krüger: sirve para sugerir el origen. */
  readonly centralMeridian?: number;
  readonly proj4: string;
}

const MAGNA_GK = (lon0: number) =>
  `+proj=tmerc +lat_0=4.596200416666666 +lon_0=${lon0} +k=1 +x_0=1000000 +y_0=1000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;

export const CRS_LIST: readonly CrsDef[] = [
  { id: 'EPSG:9377', name: 'MAGNA-SIRGAS 2018 / Origen-Nacional (CTM12)', short: 'Origen Nacional', kind: 'projected', proj4: '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { id: 'EPSG:3116', name: 'MAGNA-SIRGAS / Colombia Bogotá (Centro)', short: 'Bogotá', kind: 'projected', centralMeridian: -74.07750791666666, proj4: MAGNA_GK(-74.07750791666666) },
  { id: 'EPSG:3117', name: 'MAGNA-SIRGAS / Colombia Este', short: 'Este', kind: 'projected', centralMeridian: -71.07750791666666, proj4: MAGNA_GK(-71.07750791666666) },
  { id: 'EPSG:3118', name: 'MAGNA-SIRGAS / Colombia Este-Este', short: 'Este-Este', kind: 'projected', centralMeridian: -68.07750791666666, proj4: MAGNA_GK(-68.07750791666666) },
  { id: 'EPSG:3115', name: 'MAGNA-SIRGAS / Colombia Oeste', short: 'Oeste', kind: 'projected', centralMeridian: -77.07750791666666, proj4: MAGNA_GK(-77.07750791666666) },
  { id: 'EPSG:3114', name: 'MAGNA-SIRGAS / Colombia Oeste-Oeste', short: 'Oeste-Oeste', kind: 'projected', centralMeridian: -80.07750791666666, proj4: MAGNA_GK(-80.07750791666666) },
  { id: 'EPSG:4686', name: 'MAGNA-SIRGAS geográficas (latitud, longitud)', short: 'Lat/Long', kind: 'geographic', proj4: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs' },
];

export function crsDef(id: CrsId): CrsDef {
  const d = CRS_LIST.find((c) => c.id === id);
  if (!d) throw new Error(`CRS desconocido: ${id}`);
  return d;
}

const GEO = crsDef('EPSG:4686').proj4;

/** Coordenadas planas en metros (Este, Norte). */
export interface GridPoint {
  readonly e: number;
  readonly n: number;
}

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Plano en que se trabaja un CRS: los proyectados son su propio plano; para
 * "geográficas" se trabaja en el Origen Nacional (grados no sirven para medir)
 * y solo se MUESTRAN en lat/long.
 */
export function workingCrs(id: CrsId): CrsId {
  return crsDef(id).kind === 'geographic' ? 'EPSG:9377' : id;
}

export function latLonToGrid(id: CrsId, p: LatLon): GridPoint {
  const [e, n] = proj4(GEO, crsDef(workingCrs(id)).proj4, [p.lon, p.lat]);
  return { e, n };
}

export function gridToLatLon(id: CrsId, p: GridPoint): LatLon {
  const [lon, lat] = proj4(crsDef(workingCrs(id)).proj4, GEO, [p.e, p.n]);
  return { lat, lon };
}

/**
 * Origen Gauss-Krüger más cercano a una longitud (el que menos deforma). El
 * Origen Nacional sirve en todo el país; esto es para quien trabaja con los
 * orígenes clásicos.
 */
export function suggestGaussKruger(lon: number): CrsId {
  let best: CrsDef = crsDef('EPSG:3116');
  for (const c of CRS_LIST) {
    if (c.centralMeridian === undefined) continue;
    if (Math.abs(lon - c.centralMeridian) < Math.abs(lon - (best.centralMeridian ?? 0))) best = c;
  }
  return best.id;
}

/**
 * Convergencia de meridianos en un punto (grados, positivo al este): ángulo
 * entre el norte de cuadrícula y el norte geográfico. Se calcula
 * numéricamente con la propia proyección (sin fórmulas aproximadas).
 */
export function meridianConvergence(id: CrsId, p: GridPoint): number {
  const a = gridToLatLon(id, p);
  const b = latLonToGrid(id, { lat: a.lat + 0.001, lon: a.lon });
  // Dirección del norte geográfico expresada en la cuadrícula.
  return (Math.atan2(b.e - p.e, b.n - p.n) * 180) / Math.PI;
}

/** "N 1.234.567,123" con separadores legibles en campo. */
export function formatMeters(v: number, decimals = 3): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Grados decimales a "4°35'46.321\"N". */
export function formatDms(deg: number, pos: string, neg: string): string {
  const sign = deg >= 0 ? pos : neg;
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(3).padStart(6, '0')}"${sign}`;
}
