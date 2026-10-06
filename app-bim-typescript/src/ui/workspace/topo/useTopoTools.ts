// =============================================================================
// useTopoTools — Herramientas de Topografía de apoyo (M2b) en la planta
// =============================================================================
//
//   · Inverso: dos toques (vértices o mojones) → distancia, azimut, ΔN, ΔE.
//   · Área: toques que forman un polígono, o un toque dentro de un recinto →
//     área y perímetro en el plano de la proyección.
//   · Replanteo: un toque fija el punto; la hoja de replanteo guía con GPS.
//   · Cuadrícula de coordenadas: líneas de E y N redondos en la vista.
//   · Importar CSV (estación total) y exportar CSV / KML.
//
// Los cálculos están en application/geo/surveyTools.ts (con tests); aquí
// solo el estado de los toques y lo que se dibuja.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import { toLocal } from '../../../domain/geometry/handedness';
import type { GridPoint } from '../../../domain/geo/crs';
import { gridToLatLon, workingCrs, crsDef } from '../../../domain/geo/crs';
import { modelToGrid } from '../../../domain/geo/georeference';
import { isGeoreferenced } from '../../../application/geo/coordinateText';
import {
  InverseResult,
  bearingOf,
  coordinateGrid,
  formatAzimuth,
  gridPolygonMetrics,
  inverse,
  parsePointsCsv,
  pointsToCsv,
  toKml,
  PointOrder,
  clipToConvex,
} from '../../../application/geo/surveyTools';
import { categoriesFor, findTool } from '../../../application/workspace/catalog';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast, confirm } from '../../primitives';
import { haptic } from '../../design/haptics';
import { pickTextFile } from '../../../native/files/pickTextFile';
import { saveTextToUserFolder } from '../../../native/export/saveToUserFolder';
import { folderHint } from '../folderHint';
import { uniqueVertices, type Topography } from './useTopography';

export type TopoToolId = 'inverso' | 'area' | 'replanteo';

export interface TopoToolsInput {
  services: AppServices;
  projectId?: string;
  spaceId: string;
  projectName: string;
  editor: EditorController;
  topo: Topography;
  touchTolerancePx: number;
  operatorName?: string;
}

/** Un punto de la herramienta: dónde está en el dibujo y cómo se llama (vértice o mojón). */
interface ToolPoint {
  readonly p: Point2D;
  readonly label?: string;
}

const fmt = (v: number, d = 3) => v.toFixed(d);

export function useTopoTools({ services, projectId, spaceId, projectName, editor, topo, touchTolerancePx, operatorName }: TopoToolsInput) {
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const filters = useStore(workspaceStore, (s) => s.filters);

  const tool: TopoToolId | null = useMemo(() => {
    if (!activeTool || !topo.active) return null;
    const b = findTool(categoriesFor('topografia', 'plan'), activeTool.categoryId, activeTool.toolId)?.tool.binding;
    return b?.kind === 'topo' && (b.action === 'inverso' || b.action === 'area' || b.action === 'replanteo') ? b.action : null;
  }, [activeTool, topo.active]);

  const [points, setPoints] = useState<ToolPoint[]>([]);
  const [closedZone, setClosedZone] = useState<string | null>(null);
  const [stakeTarget, setStakeTarget] = useState<ToolPoint | null>(null);

  // Cambiar de herramienta empieza de cero.
  useEffect(() => {
    setPoints([]);
    setClosedZone(null);
    if (tool === 'inverso') toast('Toca el punto A y luego el B (se pegan a vértices y mojones)', { kind: 'info', durationMs: 2400 });
    if (tool === 'area') toast('Toca los vértices del polígono, o dentro de un recinto', { kind: 'info', durationMs: 2400 });
    if (tool === 'replanteo') toast('Toca el punto a replantear', { kind: 'info', durationMs: 2000 });
  }, [tool]);

  /** Coordenadas planas de un punto del dibujo (locales si no hay amarre). */
  const gridOf = useCallback(
    (p: Point2D): GridPoint => {
      if (isGeoreferenced(topo.geo)) return modelToGrid(topo.geo, spaceId, p);
      const l = toLocal(p);
      return { e: l.x, n: l.y };
    },
    [topo.geo, spaceId],
  );

  /** Punto bajo el dedo: un mojón, un vértice, o el punto tal cual. */
  const pickPoint = useCallback(
    (x: number, y: number): { point: ToolPoint; snapped: boolean } => {
      const w = editor.screenToWorld(x, y);
      const tol = touchTolerancePx / editor.getState().transform.scale;
      for (const b of topo.planBenchmarks) {
        if (Math.hypot(b.position.x - w.x, b.position.y - w.y) <= tol) return { point: { p: b.position, label: b.name }, snapped: true };
      }
      const snap = editor.snapToNode(x, y, touchTolerancePx);
      return { point: { p: snap.point }, snapped: snap.snapped };
    },
    [editor, touchTolerancePx, topo.planBenchmarks],
  );

  /** `true` si el toque fue de una herramienta de M2b. */
  const handleTap = useCallback(
    (x: number, y: number): boolean => {
      if (!tool) return false;
      const { point, snapped } = pickPoint(x, y);
      haptic.select();
      if (tool === 'inverso') {
        setPoints((ps) => (ps.length >= 2 ? [point] : [...ps, point]));
        return true;
      }
      if (tool === 'replanteo') {
        if (!isGeoreferenced(topo.geo)) {
          toast('Amarra el proyecto antes de replantear con GPS', { kind: 'error' });
          return true;
        }
        setStakeTarget(point);
        return true;
      }
      // Área: el primer toque dentro de un recinto (lejos de vértices) toma su contorno neto.
      if (!snapped && (points.length === 0 || closedZone)) {
        const zone = editor.zoneAt(x, y);
        const outline = zone?.netPolygon?.length ? zone.netPolygon : zone?.polygon;
        if (zone?.id && outline && outline.length >= 3) {
          setPoints(outline.map((p) => ({ p })));
          setClosedZone(zone.name ?? 'Recinto');
          return true;
        }
      }
      setClosedZone(null);
      setPoints((ps) => (closedZone ? [point] : [...ps, point]));
      return true;
    },
    [tool, pickPoint, topo.geo, points.length, closedZone, editor],
  );

  // --- Resultados ---
  const inverseResult: InverseResult | null = useMemo(() => {
    if (tool !== 'inverso' || points.length < 2) return null;
    return inverse(gridOf(points[0].p), gridOf(points[1].p));
  }, [tool, points, gridOf]);

  const areaResult = useMemo(() => {
    if (tool !== 'area' || points.length < 3) return null;
    return gridPolygonMetrics(points.map((pt) => gridOf(pt.p)));
  }, [tool, points, gridOf]);

  const georef = isGeoreferenced(topo.geo);
  const units = georef ? '' : ' (locales)';

  /** Resumen para la BPC. */
  const summary: { title: string; detail: string } | null = useMemo(() => {
    if (tool === 'inverso') {
      if (!inverseResult) return { title: 'Inverso', detail: points.length ? 'Toca el punto B' : 'Toca el punto A' };
      const r = inverseResult;
      return {
        title: `Inverso ${points[0].label ?? 'A'}→${points[1].label ?? 'B'}`,
        detail: `D ${fmt(r.distance)} m · Az ${formatAzimuth(r.azimuth)} · ΔN ${fmt(r.dN)} · ΔE ${fmt(r.dE)}${units}`,
      };
    }
    if (tool === 'area') {
      if (!areaResult) return { title: 'Área', detail: `${points.length} punto(s): toca al menos 3` };
      return {
        title: closedZone ? `Área · ${closedZone}` : `Área · ${points.length} puntos`,
        detail: `A ${fmt(areaResult.area, 2)} m² · P ${fmt(areaResult.perimeter, 2)} m${georef ? ' (planas)' : units}`,
      };
    }
    if (tool === 'replanteo') return { title: 'Replanteo', detail: stakeTarget ? 'Sigue la guía GPS' : 'Toca el punto a replantear' };
    return null;
  }, [tool, inverseResult, areaResult, points, closedZone, georef, units, stakeTarget]);

  /** Lo que se dibuja: el polígono o la línea de la herramienta, y el objetivo del replanteo. */
  const overlay = useMemo(() => {
    if (!tool) return null;
    return {
      points: points.map((pt) => pt.p),
      closed: tool === 'area' && points.length >= 3,
      target: tool === 'replanteo' ? stakeTarget?.p ?? null : null,
      label: tool === 'inverso' && inverseResult ? `${fmt(inverseResult.distance)} m · ${bearingOf(inverseResult.azimuth)}` : undefined,
    };
  }, [tool, points, stakeTarget, inverseResult]);

  // --- Cuadrícula de coordenadas (filtro) ---
  const transform = editor.getState().transform;
  const gridFor = useCallback(
    (viewW: number, viewH: number) => {
      if (!topo.active || !filters.cuadricula || !isGeoreferenced(topo.geo)) return null;
      const corners = [
        editor.screenToWorld(0, 0),
        editor.screenToWorld(viewW, 0),
        editor.screenToWorld(viewW, viewH),
        editor.screenToWorld(0, viewH),
      ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const { lines } = coordinateGrid(topo.geo, spaceId, {
        min: { x: Math.min(...xs), y: Math.min(...ys) },
        max: { x: Math.max(...xs), y: Math.max(...ys) },
      });
      const out: { from: Point2D; to: Point2D; label: string }[] = [];
      for (const l of lines) {
        const c = clipToConvex(l.from, l.to, corners);
        if (c) out.push({ from: c[0], to: c[1], label: `${l.kind} ${Math.round(l.value).toLocaleString('es-CO')}` });
      }
      return out;
    },
    // La cámara cambia la ventana visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topo.active, topo.geo, filters.cuadricula, editor, spaceId, transform],
  );

  // --- Importar / exportar ---
  const importCsv = useCallback(
    async (order: PointOrder = 'PNEZD') => {
      if (!projectId) return;
      try {
        const file = await pickTextFile();
        if (!file) return;
        const parsed = parsePointsCsv(file.text, order);
        if (parsed.points.length === 0) {
          toast(`${file.name}: no se encontraron puntos (${order})`, { kind: 'error' });
          return;
        }
        const crs = workingCrs(topo.geo?.crs ?? 'EPSG:9377');
        const errs = parsed.errors.length ? ` · ${parsed.errors.length} línea(s) con error (p. ej. ${parsed.errors[0].line})` : '';
        const ok = await confirm({
          title: `Importar ${parsed.points.length} punto(s)`,
          message:
            `${file.name}\nOrden ${order}, coordenadas planas en ${crsDef(crs).short}.${errs}\n` +
            `Se crean como mojones del proyecto${georef ? ' y se colocan en el dibujo' : ''}.`,
          confirmLabel: 'Importar',
        });
        if (!ok) return;
        const n = await services.topography.importPoints(projectId, spaceId, topo.geo, crs, parsed.points, operatorName);
        await topo.reloadAll();
        haptic.commit();
        toast(`${n} punto(s) importado(s)`, { kind: 'success' });
      } catch {
        toast('No se pudo leer o importar el archivo', { kind: 'error' });
      }
    },
    [projectId, services, spaceId, topo, georef, operatorName],
  );

  /** Puntos a exportar: mojones con coordenadas y vértices del espacio. */
  const exportRows = useCallback(() => {
    const rows: { name: string; n: number; e: number; z: number | null; description?: string; latLon?: { lat: number; lon: number } }[] = [];
    for (const b of topo.benchmarks) {
      const real = topo.benchmarkReal(b);
      if (!real) continue;
      rows.push({ name: b.name, n: real.grid.n, e: real.grid.e, z: real.h, description: b.description ?? 'mojón', latLon: real.latLon });
    }
    uniqueVertices(editor.walls).forEach((p, i) => {
      const g = gridOf(p);
      const latLon = isGeoreferenced(topo.geo) ? gridToLatLon(topo.geo.crs, g) : undefined;
      rows.push({ name: `V${i + 1}`, n: g.n, e: g.e, z: null, description: 'vértice', latLon });
    });
    return rows;
  }, [topo, editor, gridOf]);

  const save = useCallback(async (filename: string, content: string, label: string) => {
    folderHint();
    const r = await saveTextToUserFolder(filename, content);
    if (r.ok) toast(`${label} guardado en ${r.folderLabel}`, { kind: 'success' });
    else if (r.reason !== 'cancelled') toast(`No se pudo guardar el ${label}`, { kind: 'error' });
  }, []);

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const base = `${projectName.replace(/[^A-Za-z0-9]+/g, '-')}-${stamp()}`;

  const exportCsv = useCallback(() => void save(`${base}-puntos.csv`, pointsToCsv(exportRows()), 'CSV'), [save, base, exportRows]);

  const exportKml = useCallback(() => {
    if (!isGeoreferenced(topo.geo)) {
      toast('El KML necesita el proyecto amarrado (lat/long)', { kind: 'error' });
      return;
    }
    const geo = topo.geo;
    const pts = exportRows().filter((r) => r.latLon).map((r) => ({ name: r.name, latLon: r.latLon!, description: r.description }));
    const polys = editor.getState().rooms
      .filter((r) => (r.netPolygon?.length ?? 0) >= 3)
      .map((r) => ({
        name: r.name ?? 'Recinto',
        description: `${(r.netArea ?? r.area).toFixed(2)} m²`,
        ring: r.netPolygon!.map((p) => gridToLatLon(geo.crs, modelToGrid(geo, spaceId, p))),
      }));
    void save(`${base}.kml`, toKml(projectName, pts, polys), 'KML');
  }, [topo.geo, exportRows, editor, spaceId, save, base, projectName]);

  return {
    tool,
    summary,
    overlay,
    gridFor,
    handleTap,
    reset: () => {
      setPoints([]);
      setClosedZone(null);
    },
    undoPoint: () => setPoints((ps) => ps.slice(0, -1)),
    canUndoPoint: tool === 'area' && points.length > 0 && !closedZone,
    stakeTarget,
    stakeTargetGrid: stakeTarget && isGeoreferenced(topo.geo) ? gridOf(stakeTarget.p) : null,
    closeStakeout: () => setStakeTarget(null),
    importCsv,
    exportCsv,
    exportKml,
  };
}

export type TopoTools = ReturnType<typeof useTopoTools>;

