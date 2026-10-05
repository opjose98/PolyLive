// =============================================================================
// surveyTools.ts — Herramientas de Topografía de apoyo (M2b), lógica pura
// =============================================================================
//
//   · inverso: distancia, azimut y diferencias entre dos puntos;
//   · área y perímetro en coordenadas planas reales;
//   · replanteo: cuánto y hacia dónde moverse para llegar a un punto;
//   · cuadrícula de coordenadas: líneas de E y N redondos en el dibujo;
//   · importación (CSV de estación total) y exportación (CSV, KML);
//   · parámetros de IfcMapConversion para el IFC georreferenciado.
//
// Los azimuts son de CUADRÍCULA (desde el norte de la proyección, horario),
// que es como trabaja la topografía en Colombia con MAGNA-SIRGAS.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import type { GridPoint, LatLon } from '../../domain/geo/crs';
import { Georeference, gridToModel, modelToGrid, placementOf } from '../../domain/geo/georeference';

// ---------------------------------------------------------------------------
// Inverso
// ---------------------------------------------------------------------------

export interface InverseResult {
  /** Distancia horizontal en el plano de la proyección (m). */
  readonly distance: number;
  /** Azimut de cuadrícula de A→B (grados, 0–360, horario desde el norte). */
  readonly azimuth: number;
  readonly dN: number;
  readonly dE: number;
  /** Diferencia de cota B − A (m), si se conocen ambas. */
  readonly dZ: number | null;
  /** Distancia inclinada (m), si se conoce dZ. */
  readonly slope: number | null;
  /** Pendiente B respecto de A (%), si se conoce dZ. */
  readonly grade: number | null;
}

export function azimuthOf(dE: number, dN: number): number {
  const a = (Math.atan2(dE, dN) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

export function inverse(a: GridPoint, b: GridPoint, za: number | null = null, zb: number | null = null): InverseResult {
  const dE = b.e - a.e;
  const dN = b.n - a.n;
  const distance = Math.hypot(dE, dN);
  const dZ = za !== null && zb !== null ? zb - za : null;
  return {
    distance,
    azimuth: azimuthOf(dE, dN),
    dN,
    dE,
    dZ,
    slope: dZ !== null ? Math.hypot(distance, dZ) : null,
    grade: dZ !== null && distance > 1e-9 ? (dZ / distance) * 100 : null,
  };
}

/** Azimut como grados, minutos y segundos: 123°45'06". */
export function formatAzimuth(deg: number): string {
  let d = Math.floor(deg);
  let m = Math.floor((deg - d) * 60);
  let s = Math.round(((deg - d) * 60 - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${d % 360}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/** Rumbo (N 45°30' E) a partir de un azimut. */
export function bearingOf(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  const ns = a <= 90 || a >= 270 ? 'N' : 'S';
  const ew = a <= 180 ? 'E' : 'W';
  const angle = a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a;
  let d = Math.floor(angle);
  let m = Math.round((angle - d) * 60);
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${ns} ${d}°${String(m).padStart(2, '0')}' ${ew}`;
}

// ---------------------------------------------------------------------------
// Área y perímetro reales
// ---------------------------------------------------------------------------

export function gridPolygonMetrics(points: readonly GridPoint[]): { area: number; perimeter: number } {
  let twice = 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.e * b.n - b.e * a.n;
    if (points.length > 1) perimeter += Math.hypot(b.e - a.e, b.n - a.n);
  }
  return { area: Math.abs(twice) / 2, perimeter: points.length > 2 ? perimeter : perimeter / 2 };
}

// ---------------------------------------------------------------------------
// Replanteo
// ---------------------------------------------------------------------------

export interface StakeoutResult extends InverseResult {
  /** Indicación para el operador: "3,20 m al Norte · 1,05 m al Este". */
  readonly instruction: string;
  /** Llegó (dentro de la tolerancia). */
  readonly arrived: boolean;
}

export function stakeout(current: GridPoint, target: GridPoint, tolerance = 0.5): StakeoutResult {
  const inv = inverse(current, target);
  const part = (v: number, pos: string, neg: string) => (Math.abs(v) < 0.005 ? null : `${Math.abs(v).toFixed(2)} m al ${v >= 0 ? pos : neg}`);
  const parts = [part(inv.dN, 'Norte', 'Sur'), part(inv.dE, 'Este', 'Oeste')].filter(Boolean);
  return {
    ...inv,
    instruction: parts.length ? parts.join(' · ') : 'En el punto',
    arrived: inv.distance <= tolerance,
  };
}

// ---------------------------------------------------------------------------
// Cuadrícula de coordenadas
// ---------------------------------------------------------------------------

export interface GridLine {
  /** 'E' = línea de Este constante (va de sur a norte); 'N' = de Norte constante. */
  readonly kind: 'E' | 'N';
  readonly value: number;
  readonly from: Point2D;
  readonly to: Point2D;
}

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** Paso redondo para que entren ~`target` líneas en `extent` metros. */
export function niceStep(extent: number, target = 6): number {
  const raw = extent / Math.max(1, target);
  return NICE.find((s) => s >= raw) ?? NICE[NICE.length - 1];
}

/**
 * Líneas de E y N redondos que cruzan la ventana `bounds` (en coordenadas del
 * MODELO del espacio). Los extremos van en coordenadas del modelo, listas para
 * dibujar; si el proyecto está girado respecto al norte, las líneas salen
 * oblicuas, como en un plano topográfico.
 */
export function coordinateGrid(
  geo: Georeference,
  spaceId: string,
  bounds: { min: Point2D; max: Point2D },
  step?: number,
): { step: number; lines: GridLine[] } {
  const corners = [
    bounds.min,
    { x: bounds.max.x, y: bounds.min.y },
    bounds.max,
    { x: bounds.min.x, y: bounds.max.y },
  ].map((p) => modelToGrid(geo, spaceId, p));
  const es = corners.map((c) => c.e);
  const ns = corners.map((c) => c.n);
  const eMin = Math.min(...es);
  const eMax = Math.max(...es);
  const nMin = Math.min(...ns);
  const nMax = Math.max(...ns);
  const s = step ?? niceStep(Math.max(eMax - eMin, nMax - nMin));
  const lines: GridLine[] = [];
  const MAX_LINES = 60;
  for (let e = Math.ceil(eMin / s) * s; e <= eMax && lines.length < MAX_LINES; e += s) {
    lines.push({ kind: 'E', value: e, from: gridToModel(geo, spaceId, { e, n: nMin }), to: gridToModel(geo, spaceId, { e, n: nMax }) });
  }
  for (let n = Math.ceil(nMin / s) * s; n <= nMax && lines.length < MAX_LINES * 2; n += s) {
    lines.push({ kind: 'N', value: n, from: gridToModel(geo, spaceId, { e: eMin, n }), to: gridToModel(geo, spaceId, { e: eMax, n }) });
  }
  return { step: s, lines };
}

// ---------------------------------------------------------------------------
// CSV de puntos (estación total / GNSS)
// ---------------------------------------------------------------------------

/** Orden de columnas: P (punto), N, E, Z, D (descripción). PNEZD es el formato habitual. */
export type PointOrder = 'PNEZD' | 'PENZD';

export interface ImportedPoint {
  readonly name: string;
  readonly n: number;
  readonly e: number;
  readonly z: number | null;
  readonly description: string;
  /** Línea del archivo (1 = primera), para avisar errores. */
  readonly line: number;
}

export interface CsvParseResult {
  readonly points: ImportedPoint[];
  readonly errors: { line: number; message: string }[];
  readonly separator: string;
}

/** Acepta coma decimal si el separador de campos no es la coma. */
function num(s: string | undefined, separator: string): number | null {
  if (s === undefined) return null;
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  const v = Number(separator === ',' ? t : t.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

export function parsePointsCsv(text: string, order: PointOrder = 'PNEZD'): CsvParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const sample = lines.find((l) => l.trim()) ?? '';
  const separator = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ',';
  const points: ImportedPoint[] = [];
  const errors: { line: number; message: string }[] = [];
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const f = raw.split(separator).map((x) => x.trim().replace(/^"|"$/g, ''));
    const [p, a, b, z, ...d] = f;
    const first = num(a, separator);
    const second = num(b, separator);
    // Encabezado: la primera fila con coordenadas no numéricas se ignora.
    if (points.length === 0 && errors.length === 0 && (first === null || Number.isNaN(first)) && /[a-z]/i.test(a ?? '')) return;
    if (first === null || second === null || Number.isNaN(first) || Number.isNaN(second)) {
      errors.push({ line, message: 'Coordenadas no numéricas' });
      return;
    }
    const zv = num(z, separator);
    const [n, e] = order === 'PNEZD' ? [first, second] : [second, first];
    points.push({
      name: p || `P${points.length + 1}`,
      n,
      e,
      z: zv === null || Number.isNaN(zv) ? null : zv,
      description: d.join(' ').trim(),
      line,
    });
  });
  return { points, errors, separator };
}

/** Exporta puntos a CSV PNEZD (coma, punto decimal: el que leen Civil 3D y las estaciones). */
export function pointsToCsv(points: readonly { name: string; n: number; e: number; z: number | null; description?: string }[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = points.map((p) =>
    [esc(p.name), p.n.toFixed(3), p.e.toFixed(3), p.z === null ? '' : p.z.toFixed(3), esc(p.description ?? '')].join(','),
  );
  return ['P,N,E,Z,D', ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// KML (Google Earth): puntos y polígonos en lat/long
// ---------------------------------------------------------------------------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const coord = (p: LatLon, h = 0) => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},${h.toFixed(3)}`;

export function toKml(
  name: string,
  points: readonly { name: string; latLon: LatLon; description?: string }[],
  polygons: readonly { name: string; ring: readonly LatLon[]; description?: string }[] = [],
): string {
  const pm = points.map(
    (p) =>
      `    <Placemark><name>${xml(p.name)}</name>${p.description ? `<description>${xml(p.description)}</description>` : ''}` +
      `<styleUrl>#punto</styleUrl><Point><coordinates>${coord(p.latLon)}</coordinates></Point></Placemark>`,
  );
  const pg = polygons
    .filter((g) => g.ring.length >= 3)
    .map(
      (g) =>
        `    <Placemark><name>${xml(g.name)}</name>${g.description ? `<description>${xml(g.description)}</description>` : ''}` +
        `<styleUrl>#recinto</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>` +
        [...g.ring, g.ring[0]].map((p) => coord(p)).join(' ') +
        `</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`,
    );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${xml(name)}</name>`,
    '    <Style id="punto"><IconStyle><color>ff2e7d32</color></IconStyle></Style>',
    '    <Style id="recinto"><LineStyle><color>ff008fff</color><width>2</width></LineStyle><PolyStyle><color>40008fff</color></PolyStyle></Style>',
    ...pm,
    ...pg,
    '  </Document>',
    '</kml>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// IFC georreferenciado (IfcMapConversion)
// ---------------------------------------------------------------------------

export interface MapConversion {
  /** Nombre EPSG del sistema proyectado (p. ej. "EPSG:9377"). */
  readonly crsName: string;
  readonly crsDescription: string;
  readonly eastings: number;
  readonly northings: number;
  readonly orthogonalHeight: number;
  /** Dirección del eje X local del IFC en el plano (vector unitario). */
  readonly xAxisAbscissa: number;
  readonly xAxisOrdinate: number;
  readonly scale: number;
}

/**
 * Parámetros de IfcMapConversion para el IFC de UN espacio. El IFC escribe
 * el modelo en coordenadas locales del espacio con Y arriba (`toLocal`); el
 * amarre lleva eso al proyecto (ubicación del espacio) y al plano (origen,
 * giro y escala del proyecto). Las dos transformaciones son una similitud,
 * y su composición es exactamente lo que describe IfcMapConversion:
 *   E = E0 + s·(a·x − b·y),  N = N0 + s·(b·x + a·y).
 */
export function mapConversionFor(geo: Georeference, spaceId: string, crsName: string, crsDescription: string): MapConversion {
  const origin = modelToGrid(geo, spaceId, { x: 0, y: 0 });
  const angle = placementOf(geo, spaceId).rotation - geo.rotation;
  return {
    crsName,
    crsDescription,
    eastings: origin.e,
    northings: origin.n,
    orthogonalHeight: geo.z0,
    xAxisAbscissa: Math.cos(angle),
    xAxisOrdinate: Math.sin(angle),
    scale: geo.scale,
  };
}

/**
 * Recorta el segmento a→b al polígono convexo `poly` (la ventana visible, que
 * con la vista girada no es un rectángulo alineado). Cyrus–Beck. `null` si no
 * lo cruza.
 */
export function clipToConvex(a: Point2D, b: Point2D, poly: readonly Point2D[]): [Point2D, Point2D] | null {
  let t0 = 0;
  let t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  // Orientación del polígono, para saber de qué lado queda el interior.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  const s = area >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    // Normal hacia adentro del lado p→q.
    const nx = -(q.y - p.y) * s;
    const ny = (q.x - p.x) * s;
    const num = nx * (a.x - p.x) + ny * (a.y - p.y);
    const den = nx * d.x + ny * d.y;
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    { x: a.x + d.x * t0, y: a.y + d.y * t0 },
    { x: a.x + d.x * t1, y: a.y + d.y * t1 },
  ];
}
