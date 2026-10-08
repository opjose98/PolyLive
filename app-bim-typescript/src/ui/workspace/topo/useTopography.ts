// =============================================================================
// useTopography — Estado y flujos del modo Topografía en la planta
// =============================================================================
//
// La planta (SurveyScreen) solo le pasa los toques y pinta lo que esto
// devuelve: mojones, rótulos de coordenadas, el norte y el contexto de la BPC.
// Los flujos (mojón tocando / digitando / por GPS, amarres, colocar un mojón)
// viven aquí; las hojas que los muestran, en <TopographySheets>.
//
// Toques en Topografía (el modo no edita muros):
//   1. con un flujo pendiente (mojón, "dónde estoy", colocar) → lo resuelve;
//   2. sobre un mojón → lo selecciona;
//   3. sobre un vértice → muestra sus coordenadas (sonda);
//   4. si no, la planta selecciona el objeto como siempre.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import type { CrsId, GridPoint, LatLon } from '../../../domain/geo/crs';
import { Georeference, gridToModel, modelToGrid, northFromLocalY, northUpViewRotation } from '../../../domain/geo/georeference';
import type { Wall } from '../../../domain/objects/wall';
import { latLonToGrid } from '../../../domain/geo/crs';
import { ProjectBenchmark, Benchmark, isControlPoint } from '../../../domain/geo/benchmark';
import type { GpsAverage } from '../../../domain/geo/gpsAverage';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import type { PlanBenchmark } from '../../canvas/planRenderer';
import { categoriesFor, findTool, TopoAction } from '../../../application/workspace/catalog';
import { CoordDisplay, coordinateLabel, gridLabel, isGeoreferenced, localLabel } from '../../../application/geo/coordinateText';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast } from '../../primitives';
import { haptic } from '../../design/haptics';
import type { SetupCommon } from './TopographySetup';
import type { BenchmarkFormResult } from './BenchmarkForm';

type Pick = null | { kind: 'mojon' } | { kind: 'stand'; common: SetupCommon } | { kind: 'place'; id: string; name: string };
type Form = null | { mode: 'name'; point?: Point2D; gps?: GpsAverage } | { mode: 'typed' };
type GpsFor = null | { kind: 'benchmark' } | { kind: 'stand'; common: SetupCommon; point: Point2D };

interface TopographyInput {
  services: AppServices;
  projectId?: string;
  spaceId: string;
  editor: EditorController;
  /** Cota local (m) del nivel activo: Z de los mojones tocados. */
  levelZ: number;
  operatorName?: string;
  touchTolerancePx: number;
}

const msg = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Promesa disparada desde un botón: un error se avisa, nunca queda sin manejar. */
const guard = (p: Promise<unknown>, fallback: string) => {
  p.catch((e) => toast(msg(e, fallback), { kind: 'error' }));
};

export function useTopography({ services, projectId, spaceId, editor, levelZ, operatorName, touchTolerancePx }: TopographyInput) {
  const topo = services.topography;
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  const filters = useStore(workspaceStore, (s) => s.filters);
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const active = workMode === 'topografia';

  const [geo, setGeo] = useState<Georeference | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [benchmarks, setBenchmarks] = useState<ProjectBenchmark[]>([]);
  const [library, setLibrary] = useState<Benchmark[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [probe, setProbe] = useState<Point2D | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [form, setForm] = useState<Form>(null);
  const [gpsFor, setGpsFor] = useState<GpsFor>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [coordsOpen, setCoordsOpen] = useState(false);
  const [display, setDisplay] = useState<CoordDisplay>('grid');

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [g, b, lib] = await Promise.all([topo.getGeoreference(projectId), topo.listBenchmarks(projectId), topo.listLibrary(projectId)]);
    setGeo(g);
    setBenchmarks(b);
    setLibrary(lib);
    setLoaded(true);
  }, [topo, projectId]);

  useEffect(() => {
    reload().catch(() => toast('No se pudo leer la topografía del proyecto', { kind: 'error' }));
  }, [reload]);

  // Primera vez en Topografía: el asistente de amarre.
  useEffect(() => {
    if (active && loaded && !geo && projectId) setSetupOpen(true);
  }, [active, loaded, geo, projectId]);

  // Salir del modo cancela lo pendiente.
  useEffect(() => {
    if (active) return;
    setPick((p) => (p?.kind === 'place' ? p : null));
    setProbe(null);
    setSelectedId(null);
  }, [active]);

  // --- Herramientas del FAB + (binding 'topo') ---
  const topoAction: TopoAction | null = useMemo(() => {
    if (!activeTool || !active) return null;
    const b = findTool(categoriesFor('topografia', 'plan'), activeTool.categoryId, activeTool.toolId)?.tool.binding;
    return b?.kind === 'topo' ? b.action : null;
  }, [activeTool, active]);

  useEffect(() => {
    if (!topoAction) {
      setPick((p) => (p?.kind === 'mojon' ? null : p));
      return;
    }
    setProbe(null);
    setSelectedId(null);
    if (topoAction === 'mojon') {
      setPick({ kind: 'mojon' });
      toast('Toca el punto del mojón (se pega a los vértices)', { kind: 'info', durationMs: 2200 });
    } else if (topoAction === 'punto-gps') {
      setGpsFor({ kind: 'benchmark' });
    } else if (topoAction === 'coordenada') {
      setForm({ mode: 'typed' });
    }
  }, [topoAction]);

  const doneTool = useCallback(() => {
    if (topoAction === 'punto-gps' || topoAction === 'coordenada') workspaceStore.getState().clearTool();
  }, [topoAction]);

  // --- Coordenadas ---
  const realOf = useCallback(
    (p: Point2D, z: number | null = null) => topo.coordinatesOf(geo, spaceId, p, z),
    [topo, geo, spaceId],
  );

  /** Posición de un mojón en el dibujo de ESTE espacio (colocado o calculada). */
  const positionOf = useCallback(
    (b: ProjectBenchmark): { p: Point2D; placed: boolean } | null => {
      if (b.local && b.spaceId === spaceId) return { p: b.local, placed: true };
      if (b.latLon && isGeoreferenced(geo)) return { p: gridToModel(geo, spaceId, latLonToGrid(geo.crs, b.latLon)), placed: false };
      return null;
    },
    [geo, spaceId],
  );

  const planBenchmarks = useMemo<PlanBenchmark[]>(() => {
    const out: PlanBenchmark[] = [];
    for (const b of benchmarks) {
      const pos = positionOf(b);
      if (pos) out.push({ id: b.id, name: b.name, position: pos.p, control: pos.placed && isControlPoint(b) });
    }
    return out;
  }, [benchmarks, positionOf]);

  const showBenchmarks = (active || workMode === 'levantamiento') && filters.mojones;

  // Rótulo de un punto del dibujo. En planas (lo normal) basta la
  // transformación de Helmert; lat/long (proj4) solo si se pide.
  const labelAt = useCallback(
    (p: Point2D): string[] => {
      if (!isGeoreferenced(geo)) return localLabel(p);
      return display === 'latlon' ? coordinateLabel(realOf(p), p, 'latlon') : gridLabel(modelToGrid(geo, spaceId, p));
    },
    [geo, display, realOf, spaceId],
  );

  // Rótulos fijos (vértices y mojones): se recalculan si cambian los muros,
  // el amarre o los filtros; tocar un punto (la sonda) no los toca.
  const walls = editor.walls;
  const fixedLabels = useMemo(() => {
    const labels: { position: Point2D; lines: string[] }[] = [];
    if (!active || !filters.coordenadas) return labels;
    if (filters.vertices) {
      for (const p of uniqueVertices(walls)) labels.push({ position: p, lines: labelAt(p) });
    }
    if (filters.mojones) {
      const byId = new Map(benchmarks.map((b) => [b.id, b] as const));
      for (const b of planBenchmarks) {
        const pb = byId.get(b.id);
        const real = pb?.latLon ? topo.benchmarkCoordinates(geo, pb) : null;
        labels.push({ position: b.position, lines: real ? coordinateLabel(real, b.position, display) : labelAt(b.position) });
      }
    }
    return labels;
  }, [active, filters.coordenadas, filters.vertices, filters.mojones, walls, planBenchmarks, benchmarks, labelAt, topo, geo, display]);

  const coordLabels = useMemo(
    () => (active && probe ? [...fixedLabels, { position: probe, lines: labelAt(probe) }] : fixedLabels),
    [active, probe, fixedLabels, labelAt],
  );

  // --- Norte ---
  const georef = isGeoreferenced(geo);
  const northAngle = georef && filters.norte && (active || workMode === 'levantamiento') ? northFromLocalY(geo, spaceId) : null;
  const rotationSnaps = useMemo(() => (georef ? [northUpViewRotation(geo as Georeference, spaceId)] : []), [georef, geo, spaceId]);

  // --- Toques ---
  const hitBenchmark = useCallback(
    (x: number, y: number): PlanBenchmark | null => {
      const w = editor.screenToWorld(x, y);
      const tol = touchTolerancePx / editor.getState().transform.scale;
      let best: PlanBenchmark | null = null;
      let bestD = tol;
      for (const b of planBenchmarks) {
        const d = Math.hypot(b.position.x - w.x, b.position.y - w.y);
        if (d <= bestD) {
          best = b;
          bestD = d;
        }
      }
      return best;
    },
    [editor, planBenchmarks, touchTolerancePx],
  );

  /** Devuelve `true` si el toque fue de Topografía (la planta no lo procesa). */
  const handleTap = useCallback(
    (x: number, y: number): boolean => {
      if (!projectId) return false;
      if (pick) {
        const { point } = editor.snapToNode(x, y, touchTolerancePx);
        haptic.select();
        if (pick.kind === 'mojon') setForm({ mode: 'name', point });
        else if (pick.kind === 'stand') {
          setGpsFor({ kind: 'stand', common: pick.common, point });
          setPick(null);
        } else {
          const id = pick.id;
          setPick(null);
          void topo
            .placeBenchmark(projectId, id, spaceId, point, levelZ)
            .then(reload)
            .then(() => toast(`${pick.name} colocado: ya sirve para amarrar`, { kind: 'success' }))
            .catch((e) => toast(msg(e, 'No se pudo colocar el mojón'), { kind: 'error' }));
        }
        return true;
      }
      if (!active) return false;
      const hit = showBenchmarks ? hitBenchmark(x, y) : null;
      if (hit) {
        haptic.select();
        editor.select(null);
        setProbe(null);
        setSelectedId(hit.id);
        return true;
      }
      setSelectedId(null);
      const snap = editor.snapToNode(x, y, touchTolerancePx);
      if (snap.snapped) {
        haptic.select();
        editor.select(null);
        setProbe(snap.point);
        return true;
      }
      setProbe(null);
      return false;
    },
    [projectId, pick, editor, touchTolerancePx, topo, spaceId, levelZ, reload, active, showBenchmarks, hitBenchmark],
  );

  // --- Amarres ---
  const run = useCallback(
    async (fn: () => Promise<Georeference>, ok: (g: Georeference) => string) => {
      try {
        const g = await fn();
        Keyboard.dismiss();
        await reload();
        haptic.commit();
        toast(ok(g), { kind: 'success', durationMs: 2600 });
        setSetupOpen(false);
      } catch (e) {
        toast(msg(e, 'No se pudo amarrar el proyecto'), { kind: 'error' });
      }
    },
    [reload],
  );

  const base = (c: { crs: CrsId; z0: number }) => ({ crs: c.crs, z0: c.z0, definedBy: operatorName });

  const amarres = {
    localOnly: (crs: CrsId) =>
      projectId && void run(() => topo.defineLocalOnly(projectId, { crs, z0: geo?.z0 ?? 0, definedBy: operatorName }), () => 'Seguimos en coordenadas locales'),
    origin: (c: SetupCommon, known: GridPoint | LatLon) =>
      projectId &&
      void run(
        () => topo.defineByPoint(projectId, spaceId, base(c), { modelPoint: { x: 0, y: 0 }, known, azimuth: c.azimuth }),
        () => 'Proyecto amarrado por origen conocido',
      ),
    gpsStand: (c: SetupCommon) => {
      setSetupOpen(false);
      setPick({ kind: 'stand', common: c });
      toast('Toca en el dibujo dónde estás parado', { kind: 'info', durationMs: 2600 });
    },
    control: (c: SetupCommon, freeScale: boolean) =>
      projectId &&
      void run(
        () => topo.defineByControl(projectId, base(c), freeScale),
        (g) => `Amarre por mojones · RMSE ${((g.rmse ?? 0) * 100).toFixed(1)} cm`,
      ),
    placeSpace: () =>
      projectId &&
      void run(
        () => topo.placeSpaceByControl(projectId, spaceId),
        () => 'Espacio ubicado dentro del proyecto',
      ),
  };

  // --- GPS ---
  const onGpsResult = useCallback(
    (avg: GpsAverage) => {
      const g = gpsFor;
      setGpsFor(null);
      if (!g || !projectId) return;
      if (g.kind === 'benchmark') {
        setForm({ mode: 'name', gps: avg });
        return;
      }
      void run(
        () => topo.defineByGps(projectId, spaceId, base(g.common), { modelPoint: g.point, gps: avg, azimuth: g.common.azimuth }),
        () => `Proyecto amarrado por GPS (±${avg.meanAccuracy.toFixed(1)} m)`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gpsFor, projectId, topo, spaceId, run],
  );

  const closeGps = useCallback(() => {
    setGpsFor(null);
    doneTool();
  }, [doneTool]);

  // --- Mojones ---
  const nextName = `M-${benchmarks.length + 1}`;

  const submitForm = useCallback(
    async (r: BenchmarkFormResult) => {
      const f = form;
      setForm(null);
      if (!f || !projectId) return;
      try {
        if (f.mode === 'typed') {
          if (!r.known) return;
          await topo.benchmarkFromReal(projectId, spaceId, geo, {
            name: r.name,
            description: r.description,
            known: r.known,
            h: r.h ?? null,
            source: 'typed',
            createdBy: operatorName,
          });
        } else if (f.gps) {
          await topo.benchmarkFromReal(projectId, spaceId, geo, {
            name: r.name,
            description: r.description,
            known: { lat: f.gps.lat, lon: f.gps.lon },
            h: f.gps.alt,
            source: 'gps',
            accuracy: f.gps.meanAccuracy,
            createdBy: operatorName,
          });
        } else if (f.point) {
          await topo.benchmarkFromTap(projectId, spaceId, geo, r.name, f.point, levelZ, operatorName, r.description);
        }
        await reload();
        haptic.commit();
        const where = f.mode === 'name' && f.point ? '' : isGeoreferenced(geo) ? ' y colocado en el dibujo' : '; colócalo desde la tabla de coordenadas';
        toast(`Mojón ${r.name} creado${where}`, { kind: 'success', durationMs: 2600 });
      } catch (e) {
        toast(msg(e, 'No se pudo crear el mojón'), { kind: 'error' });
      } finally {
        doneTool();
      }
    },
    [form, projectId, topo, spaceId, geo, operatorName, levelZ, reload, doneTool],
  );

  const closeForm = useCallback(() => {
    setForm(null);
    doneTool();
  }, [doneTool]);

  const benchmarkActions = {
    place: (b: ProjectBenchmark) => {
      setCoordsOpen(false);
      setPick({ kind: 'place', id: b.id, name: b.name });
      toast(`Toca dónde está ${b.name} en el dibujo`, { kind: 'info', durationMs: 2600 });
    },
    unlink: (b: ProjectBenchmark) =>
      projectId &&
      guard(
        topo
          .unlinkBenchmark(projectId, b.id)
          .then(reload)
          .then(() => {
            if (selectedId === b.id) setSelectedId(null);
            toast(`${b.name} quitado del proyecto (sigue en la biblioteca)`, { kind: 'info' });
          }),
        'No se pudo quitar el mojón',
      ),
    link: (b: Benchmark) =>
      projectId &&
      guard(
        topo.linkFromLibrary(projectId, b.id).then(reload).then(() => toast(`${b.name} agregado al proyecto`, { kind: 'success' })),
        'No se pudo agregar el mojón',
      ),
  };

  const selectedBenchmark = benchmarks.find((b) => b.id === selectedId) ?? null;
  const controlCount = benchmarks.filter(isControlPoint).length;
  const controlInSpace = benchmarks.filter((b) => isControlPoint(b) && b.spaceId === spaceId).length;

  return {
    active,
    geo,
    georef,
    loaded,
    benchmarks,
    library,
    display,
    setDisplay,
    realOf,
    positionOf,
    benchmarkReal: (b: ProjectBenchmark) => topo.benchmarkCoordinates(geo, b),
    // lienzo
    planBenchmarks: showBenchmarks ? planBenchmarks : [],
    coordLabels,
    selectedBenchmark,
    selectBenchmark: setSelectedId,
    probe,
    clearProbe: () => setProbe(null),
    northAngle,
    rotationSnaps,
    picking: pick,
    cancelPick: () => setPick(null),
    handleTap,
    // hojas
    setupOpen,
    openSetup: () => {
      workspaceStore.getState().closePanels();
      setSetupOpen(true);
    },
    closeSetup: () => setSetupOpen(false),
    coordsOpen,
    openCoords: () => {
      workspaceStore.getState().closePanels();
      setCoordsOpen(true);
    },
    closeCoords: () => setCoordsOpen(false),
    form,
    nextName,
    submitForm,
    closeForm,
    gpsFor,
    onGpsResult,
    closeGps,
    controlCount,
    controlInSpace,
    amarres,
    benchmarkActions,
    /** Atrás de Android: cierra la hoja o el flujo abierto. `true` si había algo. */
    back: (): boolean => {
      if (gpsFor) setGpsFor(null);
      else if (form) setForm(null);
      else if (setupOpen) setSetupOpen(false);
      else if (coordsOpen) setCoordsOpen(false);
      else if (pick) setPick(null);
      else if (probe || selectedId) {
        setProbe(null);
        setSelectedId(null);
      } else return false;
      return true;
    },
    /** Relee georreferencia y mojones (tras importar puntos). */
    reloadAll: reload,
    setGpsSeconds: (s: number) => projectId && guard(topo.setGpsSeconds(projectId, s).then(reload), 'No se pudo guardar el tiempo del GPS'),
  };
}

export type Topography = ReturnType<typeof useTopography>;

/** Extremos de muro sin repetir (las esquinas compartidas cuentan una vez). */
export function uniqueVertices(walls: readonly Wall[]): Point2D[] {
  const seen = new Map<string, Point2D>();
  for (const w of walls) {
    for (const p of [w.startPoint, w.endPoint]) seen.set(`${p.x.toFixed(3)},${p.y.toFixed(3)}`, p);
  }
  return [...seen.values()];
}
