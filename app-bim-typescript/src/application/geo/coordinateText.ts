// =============================================================================
// coordinateText.ts — Cómo se muestran las coordenadas en Topografía
// =============================================================================
//
// Una sola fuente para rótulos del lienzo, BPC, tabla y formularios:
//   - con amarre: Norte/Este en el plano del proyecto (o lat/long si se pide);
//   - sin amarre: x/y locales (Y arriba, como en Revit), desde el 0,0 del dibujo.
// Convención topográfica colombiana: primero el Norte, luego el Este.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { toLocal } from '../../domain/geometry/handedness';
import { crsDef, formatDms, formatMeters, workingCrs } from '../../domain/geo/crs';
import { Georeference, azimuthDegrees } from '../../domain/geo/georeference';
import type { RealCoordinates } from './TopographyService';

export type CoordDisplay = 'grid' | 'latlon';

/** ¿El proyecto tiene coordenadas reales? */
export function isGeoreferenced(geo: Georeference | null): geo is Georeference {
  return !!geo && geo.method !== 'none';
}

/** Pares [etiqueta, valor] para tablas y hojas. */
export function coordinateRows(
  real: RealCoordinates | null,
  modelPoint: Point2D | null,
  display: CoordDisplay = 'grid',
): [string, string][] {
  if (real) {
    const rows: [string, string][] =
      display === 'latlon'
        ? [
            ['Latitud', formatDms(real.latLon.lat, 'N', 'S')],
            ['Longitud', formatDms(real.latLon.lon, 'E', 'W')],
          ]
        : [
            ['Norte', `${formatMeters(real.grid.n)} m`],
            ['Este', `${formatMeters(real.grid.e)} m`],
          ];
    if (real.h !== null) rows.push(['Cota', `${formatMeters(real.h)} msnm`]);
    return rows;
  }
  if (modelPoint) {
    const l = toLocal(modelPoint);
    return [
      ['x local', `${formatMeters(l.x)} m`],
      ['y local', `${formatMeters(l.y)} m`],
    ];
  }
  return [];
}

/** Dos líneas cortas para el rótulo junto al punto en el lienzo (cm). */
export function coordinateLabel(real: RealCoordinates | null, modelPoint: Point2D, display: CoordDisplay = 'grid'): string[] {
  if (real) {
    if (display === 'latlon') return [`${real.latLon.lat.toFixed(7)}`, `${real.latLon.lon.toFixed(7)}`];
    return [`N ${formatMeters(real.grid.n, 2)}`, `E ${formatMeters(real.grid.e, 2)}`];
  }
  const l = toLocal(modelPoint);
  return [`x ${l.x.toFixed(2)}`, `y ${l.y.toFixed(2)}`];
}

/** Una línea para la BPC. */
export function coordinateInline(real: RealCoordinates | null, modelPoint: Point2D, display: CoordDisplay = 'grid'): string {
  return coordinateLabel(real, modelPoint, display).join(' · ');
}

/** Resumen del amarre: "Origen Nacional · mojones · RMSE 0,012 m". */
export function amarreSummary(geo: Georeference | null): string[] {
  if (!geo) return ['Sin configurar'];
  const crs = crsDef(geo.crs).short;
  if (geo.method === 'none') return [crs, 'Coordenadas locales'];
  const how = { origin: 'origen conocido', gps: 'GPS', control: 'mojones' }[geo.method];
  const items = [crs, `Amarre: ${how}`];
  if (geo.rmse !== undefined) items.push(`RMSE ${formatMeters(geo.rmse)} m`);
  else items.push(`Az. ${azimuthDegrees(geo.rotation).toFixed(2)}°`);
  return items;
}

/** Plano en que se muestran las coordenadas (para encabezados de tabla). */
export function gridName(geo: Georeference | null): string {
  return crsDef(workingCrs(geo?.crs ?? 'EPSG:9377')).short;
}
