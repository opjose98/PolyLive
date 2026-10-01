// =============================================================================
// TopographySheets — Todas las hojas del modo Topografía, en un solo lugar
// =============================================================================

import React from 'react';
import type { Point2D } from '../../../domain/geometry/types';
import { coordinateRows } from '../../../application/geo/coordinateText';
import { DEFAULT_GPS_SECONDS } from '../../../domain/geo/georeference';
import type { Topography } from './useTopography';
import { TopographySetup } from './TopographySetup';
import { BenchmarkForm } from './BenchmarkForm';
import { GpsCaptureSheet } from './GpsCaptureSheet';
import { CoordinatesSheet } from './CoordinatesSheet';

export function TopographySheets({ topo, vertices }: { topo: Topography; vertices: readonly Point2D[] }) {
  const f = topo.form;
  const preview =
    f?.mode === 'name'
      ? f.point
        ? coordinateRows(topo.realOf(f.point), f.point, topo.display)
        : f.gps
          ? ([
              ['Latitud', f.gps.lat.toFixed(7)],
              ['Longitud', f.gps.lon.toFixed(7)],
              ['Precisión', `±${f.gps.meanAccuracy.toFixed(1)} m · ${f.gps.samples} lecturas`],
            ] as [string, string][])
          : undefined
      : undefined;

  return (
    <>
      <TopographySetup
        open={topo.setupOpen}
        geo={topo.geo}
        controlCount={topo.controlCount}
        controlInSpace={topo.controlInSpace}
        onClose={topo.closeSetup}
        onLocalOnly={topo.amarres.localOnly}
        onOrigin={topo.amarres.origin}
        onGpsStand={topo.amarres.gpsStand}
        onControl={topo.amarres.control}
        onPlaceSpace={topo.amarres.placeSpace}
      />
      <BenchmarkForm
        open={!!f}
        mode={f?.mode ?? 'name'}
        crs={topo.geo?.crs ?? 'EPSG:9377'}
        defaultName={topo.nextName}
        preview={preview}
        onSubmit={(r) => void topo.submitForm(r)}
        onClose={topo.closeForm}
      />
      <GpsCaptureSheet
        open={!!topo.gpsFor}
        seconds={topo.geo?.gpsSeconds ?? DEFAULT_GPS_SECONDS}
        purpose={topo.gpsFor?.kind === 'stand' ? 'amarrar el proyecto' : 'crear un mojón'}
        onResult={topo.onGpsResult}
        onClose={topo.closeGps}
      />
      <CoordinatesSheet topo={topo} vertices={vertices} />
    </>
  );
}
