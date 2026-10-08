// =============================================================================
// TopographyService.ts — Amarres, mojones y coordenadas reales (M2)
// =============================================================================
//
// Une el dominio (crs, georeference, benchmark) con la persistencia
// (GeoStore). La UI solo habla con este servicio.
//
// AMARRE DEL PROYECTO — tres métodos (acordados con el usuario):
//   origin   un punto del dibujo con coordenadas conocidas + azimut
//   gps      parado en un punto del dibujo, GPS promediado + azimut
//   control  ≥2 mojones con coordenadas reales colocados en el dibujo
//            (mínimos cuadrados, con residuales)
// El primer espacio amarrado define el proyecto. Si el proyecto ya está
// amarrado, los métodos gps/control pueden UBICAR solo el espacio actual
// dentro del proyecto (para espacios dibujados cada uno desde su 0,0).
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { toLocal } from '../../domain/geometry/handedness';
import { CrsId, GridPoint, LatLon, gridToLatLon, latLonToGrid } from '../../domain/geo/crs';
import { AmarreMethod, DEFAULT_GPS_SECONDS, Georeference, SpacePlacement, amarreByPointAndAzimuth, fitControlPoints, gridToLocal, gridToModel, modelToGrid, placementOf, spaceToProject } from '../../domain/geo/georeference';
import { ProjectBenchmark, isControlPoint } from '../../domain/geo/benchmark';
import type { GpsAverage } from '../../domain/geo/gpsAverage';
import { GeoStore } from '../../infrastructure/sqlite/GeoStore';

export interface RealCoordinates {
  readonly grid: GridPoint;
  readonly latLon: LatLon;
  /** Cota real (msnm) si se conoce la local. */
  readonly h: number | null;
}

interface AmarreBase {
  readonly crs: CrsId;
  /** Cota real (msnm) del Z = 0 local. */
  readonly z0: number;
  readonly definedBy?: string;
  readonly gpsSeconds?: number;
}

export class TopographyService {
  constructor(private readonly store: GeoStore) {}

  getGeoreference(projectId: string): Promise<Georeference | null> {
    return this.store.getGeoreference(projectId);
  }

  listBenchmarks(projectId: string): Promise<ProjectBenchmark[]> {
    return this.store.listProjectBenchmarks(projectId);
  }

  listLibrary(projectId: string) {
    return this.store.listLibrary(projectId);
  }

  // --- Coordenadas --------------------------------------------------------------

  /** Coordenadas reales de un punto del modelo de un espacio (null sin amarre). */
  coordinatesOf(geo: Georeference | null, spaceId: string, modelPoint: Point2D, localZ: number | null = null): RealCoordinates | null {
    if (!geo || geo.method === 'none') return null;
    const grid = modelToGrid(geo, spaceId, modelPoint);
    return { grid, latLon: gridToLatLon(geo.crs, grid), h: localZ !== null ? geo.z0 + localZ : null };
  }

  /** Coordenadas reales de un mojón: las suyas si las tiene, o las de su posición. */
  benchmarkCoordinates(geo: Georeference | null, b: ProjectBenchmark): RealCoordinates | null {
    if (b.latLon) {
      const crs = geo?.crs ?? 'EPSG:9377';
      return { grid: latLonToGrid(crs, b.latLon), latLon: b.latLon, h: b.h };
    }
    if (b.local && b.spaceId) return this.coordinatesOf(geo, b.spaceId, b.local, b.localZ);
    return null;
  }

  // --- Amarres ----------------------------------------------------------------

  private async save(projectId: string, prev: Georeference | null, base: AmarreBase, method: AmarreMethod, t: {
    origin: GridPoint;
    rotation: number;
    scale: number;
    residuals?: Georeference['residuals'];
    rmse?: number;
  }): Promise<Georeference> {
    const geo: Georeference = {
      crs: base.crs,
      method,
      origin: t.origin,
      rotation: t.rotation,
      scale: t.scale,
      z0: base.z0,
      residuals: t.residuals,
      rmse: t.rmse,
      gpsSeconds: base.gpsSeconds ?? prev?.gpsSeconds ?? DEFAULT_GPS_SECONDS,
      // Redefinir el proyecto conserva cómo están ubicados los espacios entre sí.
      placements: prev?.placements ?? {},
      definedAt: new Date().toISOString(),
      definedBy: base.definedBy,
    };
    await this.store.saveGeoreference(projectId, geo);
    return geo;
  }

  /** Sin coordenadas reales todavía: se trabaja en locales (0,0,0). */
  async defineLocalOnly(projectId: string, base: AmarreBase): Promise<Georeference> {
    const prev = await this.store.getGeoreference(projectId);
    return this.save(projectId, prev, base, 'none', { origin: { e: 0, n: 0 }, rotation: 0, scale: 1 });
  }

  /**
   * (a) Un punto del dibujo (por defecto el 0,0) con coordenadas conocidas y el
   * azimut (rad) hacia el que apunta la +Y local.
   */
  async defineByPoint(
    projectId: string,
    spaceId: string,
    base: AmarreBase,
    p: { modelPoint: Point2D; known: GridPoint | LatLon; azimuth: number; method?: 'origin' | 'gps' },
  ): Promise<Georeference> {
    const prev = await this.store.getGeoreference(projectId);
    const grid = 'lat' in p.known ? latLonToGrid(base.crs, p.known) : p.known;
    const local = spaceToProject(placementOf(prev, spaceId), p.modelPoint);
    const t = amarreByPointAndAzimuth(local, grid, p.azimuth);
    return this.save(projectId, prev, base, p.method ?? 'origin', t);
  }

  /** (b) GPS: el operador está parado en `modelPoint`; su posición promediada lo ubica. */
  defineByGps(projectId: string, spaceId: string, base: AmarreBase, p: { modelPoint: Point2D; gps: GpsAverage; azimuth: number }) {
    return this.defineByPoint(projectId, spaceId, base, {
      modelPoint: p.modelPoint,
      known: { lat: p.gps.lat, lon: p.gps.lon },
      azimuth: p.azimuth,
      method: 'gps',
    });
  }

  /** (c) Ajuste por los mojones del proyecto que tienen coordenadas reales y posición. */
  async defineByControl(projectId: string, base: AmarreBase, freeScale = false): Promise<Georeference> {
    const prev = await this.store.getGeoreference(projectId);
    const pairs = (await this.store.listProjectBenchmarks(projectId)).filter(isControlPoint).map((b) => ({
      id: b.name,
      local: spaceToProject(placementOf(prev, b.spaceId as string), b.local as Point2D),
      grid: latLonToGrid(base.crs, b.latLon as LatLon),
    }));
    const fit = fitControlPoints(pairs, freeScale);
    return this.save(projectId, prev, base, 'control', fit);
  }

  /**
   * Ubica SOLO un espacio dentro de un proyecto ya amarrado, con los mojones
   * colocados en ESE espacio (≥2). Útil cuando cada espacio se dibujó desde su
   * propio 0,0.
   */
  async placeSpaceByControl(projectId: string, spaceId: string): Promise<Georeference> {
    const geo = await this.store.getGeoreference(projectId);
    if (!geo || geo.method === 'none') throw new Error('Primero amarra el proyecto.');
    const own = (await this.store.listProjectBenchmarks(projectId)).filter((b) => isControlPoint(b) && b.spaceId === spaceId);
    // Pares: espacio (local, Y arriba) ↔ proyecto (local, Y arriba).
    const pairs = own.map((b) => {
      const pj = gridToLocal(geo, latLonToGrid(geo.crs, b.latLon as LatLon));
      return { id: b.name, local: toLocal(b.local as Point2D), grid: { e: pj.x, n: pj.y } };
    });
    const fit = fitControlPoints(pairs, false);
    // Azimut θ del ajuste ↔ giro antihorario φ = −θ de la ubicación.
    const placement: SpacePlacement = { x: fit.origin.e, y: fit.origin.n, rotation: -fit.rotation };
    const next: Georeference = { ...geo, placements: { ...geo.placements, [spaceId]: placement } };
    await this.store.saveGeoreference(projectId, next);
    return next;
  }

  async setGpsSeconds(projectId: string, seconds: number): Promise<void> {
    const geo = await this.store.getGeoreference(projectId);
    if (geo) await this.store.saveGeoreference(projectId, { ...geo, gpsSeconds: Math.max(5, Math.round(seconds)) });
  }

  // --- Mojones ------------------------------------------------------------------

  /** Tocando la planta: la posición es exacta; las coordenadas reales, las del amarre. */
  async benchmarkFromTap(
    projectId: string,
    spaceId: string,
    geo: Georeference | null,
    name: string,
    modelPoint: Point2D,
    localZ: number,
    createdBy?: string,
    description?: string,
  ) {
    const real = this.coordinatesOf(geo, spaceId, modelPoint, localZ);
    return this.store.createBenchmark(projectId, {
      name,
      description,
      latLon: real?.latLon ?? null,
      h: real?.h ?? null,
      source: 'tap',
      createdBy,
      spaceId,
      local: modelPoint,
      localZ,
    });
  }

  /**
   * Digitando coordenadas o con GPS: las reales son las conocidas; si el
   * proyecto está amarrado, el mojón se coloca en el dibujo del espacio.
   */
  async benchmarkFromReal(
    projectId: string,
    spaceId: string,
    geo: Georeference | null,
    p: {
      name: string;
      description?: string;
      known: GridPoint | LatLon;
      /** Sistema de `known` si son planas (por defecto el del proyecto). */
      crs?: CrsId;
      h: number | null;
      source: 'typed' | 'gps' | 'import';
      accuracy?: number;
      createdBy?: string;
    },
  ) {
    const crs = p.crs ?? geo?.crs ?? 'EPSG:9377';
    const latLon = 'lat' in p.known ? p.known : gridToLatLon(crs, p.known);
    const placed = geo && geo.method !== 'none';
    const local = placed ? gridToModel(geo, spaceId, latLonToGrid(geo.crs, latLon)) : null;
    return this.store.createBenchmark(projectId, {
      name: p.name,
      description: p.description,
      latLon,
      h: p.h,
      source: p.source,
      accuracy: p.accuracy ?? null,
      createdBy: p.createdBy,
      spaceId: placed ? spaceId : null,
      local,
      localZ: placed && p.h !== null ? p.h - geo.z0 : null,
    });
  }

  /**
   * Importa puntos de una estación total o GNSS (CSV en planas del sistema
   * `crs`) como mojones del proyecto. Devuelve cuántos se crearon.
   */
  async importPoints(
    projectId: string,
    spaceId: string,
    geo: Georeference | null,
    crs: CrsId,
    points: readonly { name: string; e: number; n: number; z: number | null; description: string }[],
    createdBy?: string,
  ): Promise<number> {
    let n = 0;
    for (const p of points) {
      await this.benchmarkFromReal(projectId, spaceId, geo, {
        name: p.name,
        description: p.description || undefined,
        known: { e: p.e, n: p.n },
        crs,
        h: p.z,
        source: 'import',
        createdBy,
      });
      n++;
    }
    return n;
  }

  /** Coloca (o re-coloca) un mojón en el dibujo de un espacio: así se vuelve punto de control. */
  placeBenchmark(projectId: string, benchmarkId: string, spaceId: string, modelPoint: Point2D, localZ: number | null = null) {
    return this.store.link(projectId, benchmarkId, spaceId, modelPoint, localZ);
  }

  linkFromLibrary(projectId: string, benchmarkId: string) {
    return this.store.link(projectId, benchmarkId, null, null, null);
  }

  unlinkBenchmark(projectId: string, benchmarkId: string) {
    return this.store.unlink(projectId, benchmarkId);
  }

  renameBenchmark(benchmarkId: string, name: string, description?: string) {
    return this.store.rename(benchmarkId, name, description);
  }
}
