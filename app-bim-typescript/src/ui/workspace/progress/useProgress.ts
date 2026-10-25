// =============================================================================
// useProgress — El modo Avance (M3) en la planta, el alzado y la columna
// =============================================================================
//
// Une el ProgressController (lógica pura, con tests) con la pantalla:
//   · calcula los SOPORTES: suelos (contorno neto del recinto o el propio del
//     suelo libre), las dos caras de cada muro (perfil real menos vanos) y
//     cada columna desdoblada (perímetro × alto);
//   · traduce los gestos (pantalla → coordenadas del soporte);
//   · entrega lo que se dibuja (capas por actividad y el trazo en curso). El
//     pincel y el borrador se dibujan en vivo en el hilo UI (liveStroke).
// Con un suelo AISLADO (doble toque) solo se pinta sobre ese suelo.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { ProgressController, ProgressState, ProgressTool } from '../../../application/progress/ProgressController';
import { columnSupport, faceSupport, ProgressTarget, Support, targetKey } from '../../../domain/progress/progress';
import { elevationOutline, levelsFromProfile } from '../../../domain/objects/wall-elevation';
import type { WallElevation } from '../../../domain/objects/wall-elevation';
import { Column } from '../../../domain/objects/column';
import type { ProjectMarker } from '../../../domain/objects/marker';
import { columnUnfolded } from '../../../application/section/projection';
import { categoriesFor, findTool } from '../../../application/workspace/catalog';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast } from '../../primitives';
import { haptic } from '../../design/haptics';
import type { SketchShape, SketchSource } from '../../canvas/sketch';
import type { LiveStroke } from '../../canvas/liveStroke';

interface ProgressInput {
  services: AppServices;
  projectId?: string;
  spaceId: string;
  editor: EditorController;
  operatorName?: string;
  /** Muros u objetos cambiaron: se recalculan los soportes. */
  objectsVersion: unknown;
  /** Niveles del proyecto (alto de las columnas). */
  levels: readonly ProjectMarker[];
  /** Suelo aislado en la planta: solo se pinta sobre él (clave `floor:…`). */
  isolatedFloorKey?: string | null;
}

const ERASER_COLOR = '#9E9E9E';

export function useProgress({ services, projectId, spaceId, editor, operatorName, objectsVersion, levels, isolatedFloorKey }: ProgressInput) {
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const filters = useStore(workspaceStore, (s) => s.filters);
  const view = useStore(workspaceStore, (s) => s.mode);
  const active = workMode === 'avance';

  const ctl = useMemo(
    () => new ProgressController(services.progress, projectId ?? spaceId, spaceId, operatorName ?? ''),
    [services, projectId, spaceId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => ctl.setOperator(operatorName ?? ''), [ctl, operatorName]);
  const [st, setSt] = useState<ProgressState>(() => ctl.getState());
  // La pantalla no se entera de cada movimiento del pincel: el trazo en curso
  // va directo al lienzo, como el muro que se está trazando.
  useEffect(
    () =>
      ctl.subscribe((next) =>
        setSt((prev) => {
          for (const k of Object.keys(next) as (keyof ProgressState)[]) {
            if (k === 'draft') {
              if (!!prev.draft !== !!next.draft) return next;
            } else if (prev[k] !== next[k]) return next;
          }
          return prev;
        }),
      ),
    [ctl],
  );
  useEffect(() => {
    ctl.load().catch(() => toast('No se pudo leer el avance', { kind: 'error' }));
  }, [ctl]);

  // Avisos del controlador.
  useEffect(() => {
    if (!st.notice) return;
    ctl.clearNotice();
    toast(st.notice.message, { kind: st.notice.kind === 'error' ? 'error' : st.notice.kind === 'success' ? 'success' : 'info' });
  }, [st.notice, ctl]);

  // --- Herramienta del FAB → controlador ---
  const binding = useMemo(() => {
    if (!active || !activeTool) return null;
    const b = findTool(categoriesFor('avance', view), activeTool.categoryId, activeTool.toolId)?.tool.binding;
    return b?.kind === 'progress' ? b : null;
  }, [active, activeTool, view]);
  const tool: ProgressTool | null = binding?.tool ?? null;
  useEffect(() => ctl.setTool(tool), [ctl, tool]);
  useEffect(() => {
    const w = activeTool?.props?.brush;
    if (w !== undefined) ctl.setBrushWidth(w / 100);
  }, [ctl, activeTool?.props?.brush]);

  // --- Soportes ---
  const [elevations, setElevations] = useState<readonly WallElevation[]>([]);
  useEffect(() => {
    let cancelled = false;
    services.elevations
      .listElevations(spaceId as never)
      .then((e) => !cancelled && setElevations(e))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [services, spaceId, objectsVersion]);

  // Un suelo libre no tiene recinto: su soporte de avance se identifica por el id del suelo.
  const floors = useMemo(
    () => editor.floorViews.map((f) => ({ ...f, zoneId: f.zoneId ?? `floor:${f.id}` })),
    [editor, objectsVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const paintableFloors = useMemo(
    () => (isolatedFloorKey ? floors.filter((f) => targetKey({ kind: 'floor', zoneId: f.zoneId }) === isolatedFloorKey) : floors),
    [floors, isolatedFloorKey],
  );
  const columns = useMemo(
    () => editor.scopedObjects.filter((o): o is Column => o instanceof Column),
    [editor, objectsVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const supports = useMemo(() => {
    const map = new Map<string, Support>();
    for (const f of floors) map.set(targetKey({ kind: 'floor', zoneId: f.zoneId }), { outline: f.polygon, holes: f.holes });
    const openingsOf = new Map(elevations.map((e) => [e.wallId, e.openings]));
    for (const w of editor.walls) {
      const p = editor.wallProfile(w);
      const y0 = Math.min(p.start.base, p.end.base);
      const s = faceSupport(
        w.length as number,
        { leftBase: p.start.base - y0, rightBase: p.end.base - y0, leftTop: p.start.top - y0, rightTop: p.end.top - y0 },
        openingsOf.get(w.id as string) ?? [],
        p.stations?.length ? elevationOutline(levelsFromProfile(p), w.length as number) : undefined,
      );
      map.set(targetKey({ kind: 'wallFace', wallId: w.id as string, side: 'A' }), s);
      map.set(targetKey({ kind: 'wallFace', wallId: w.id as string, side: 'B' }), s);
    }
    for (const c of columns) {
      const u = columnUnfolded(c, levels);
      if (u.perimeter > 0 && u.height > 0) map.set(targetKey({ kind: 'column', columnId: c.id as string }), columnSupport(u.perimeter, u.height));
    }
    return map;
  }, [floors, elevations, editor, columns, levels, objectsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => ctl.setSupports(supports), [ctl, supports]);

  // --- Dibujo ---
  const layers = useMemo(
    () => (filters.actividades ? ctl.layers(filters.cortesAnteriores) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, st.marks, st.cutId, st.allActivities, supports, filters.actividades, filters.cortesAnteriores],
  );
  /** Capas de la planta (suelos) en coordenadas del modelo; aislado, solo las de ese suelo. */
  const planLayers = useMemo(
    () => layers.filter((l) => l.targetKey.startsWith('floor:') && (!isolatedFloorKey || l.targetKey === isolatedFloorKey)),
    [layers, isolatedFloorKey],
  );
  /** Capas de un soporte cualquiera (cara de muro o columna), en sus coordenadas. */
  const supportLayers = useCallback((key: string) => layers.filter((l) => l.targetKey === key), [layers]);
  /** Capas de una cara de muro, en (u, v). */
  const faceLayers = useCallback(
    (wallId: string, side: 'A' | 'B') => supportLayers(targetKey({ kind: 'wallFace', wallId, side })),
    [supportLayers],
  );

  /**
   * Trazo en curso que NO dibuja el hilo UI: el rectángulo. El pincel y el
   * borrador van por `liveStroke` (sin retraso respecto al dedo).
   */
  const draftShapes = useCallback((): SketchShape[] => {
    const d = ctl.getState().draft;
    if (!d || d.tool !== 'rect') return [];
    const color = d.color;
    return d.points.length >= 2 ? [{ kind: 'rect', a: d.points[0], b: d.points[1], color, fill: true, opacity: 0.45 }] : [];
  }, [ctl]);

  /** Pincel vivo para los lienzos (hilo UI): ancho en metros del soporte, color y cuándo borrarlo. */
  const activeColor = st.activities.find((a) => a.id === st.activityId)?.color ?? '#1E88E5';
  const liveStroke: LiveStroke | null = useMemo(
    () =>
      active && (tool === 'brush' || tool === 'eraser')
        ? { widthM: st.brushWidth, color: tool === 'eraser' ? ERASER_COLOR : activeColor, clearKey: st.strokeSeq }
        : null,
    [active, tool, st.brushWidth, activeColor, st.strokeSeq],
  );

  /** Capa viva para la planta: solo trazos sobre suelos. */
  const planSketch: SketchSource = useMemo(() => {
    let key: unknown = null;
    let cached: SketchShape[] = [];
    return {
      subscribe: (cb) => ctl.subscribe(() => cb()),
      get: () => {
        const d = ctl.getState().draft;
        if (d === key) return cached;
        key = d;
        cached = d?.target.kind === 'floor' ? draftShapes() : [];
        return cached;
      },
    };
  }, [ctl, draftShapes]);

  // --- Gestos en la planta ---
  const floorUnder = useCallback(
    (x: number, y: number): { target: ProgressTarget; world: Point2D } | null => {
      const world = editor.screenToWorld(x, y);
      const target = ctl.floorAt(world, paintableFloors);
      return target ? { target, world } : null;
    },
    [editor, ctl, paintableFloors],
  );

  const noFloor = useCallback(() => {
    toast(
      isolatedFloorKey
        ? 'Pinta dentro del suelo aislado.'
        : floors.length
          ? 'Pinta sobre un suelo (los recintos con trama) · doble toque lo aísla.'
          : 'No hay suelos: en Levantamiento, herramienta Suelo sobre cada recinto.',
      { kind: 'info', durationMs: 2600 },
    );
  }, [floors.length, isolatedFloorKey]);

  /** `true` si el toque fue del Avance. */
  const handleTap = useCallback(
    (x: number, y: number): boolean => {
      if (!active || !tool) return false;
      if (tool !== 'fill') return true;
      const hit = floorUnder(x, y);
      if (!hit) {
        noFloor();
        return true;
      }
      haptic.commit();
      void ctl.fill(hit.target);
      return true;
    },
    [active, tool, floorUnder, ctl, noFloor],
  );

  const drawEnabled = active && (tool === 'brush' || tool === 'eraser' || tool === 'rect');
  const planDraw = useMemo(
    () => ({
      begin: (x: number, y: number) => {
        const hit = floorUnder(x, y);
        if (!hit) {
          ctl.rejectStroke();
          noFloor();
          return;
        }
        ctl.begin(hit.target, hit.world);
      },
      move: (x: number, y: number) => ctl.move(editor.screenToWorld(x, y)),
      end: (x: number, y: number) => void ctl.end(editor.screenToWorld(x, y)),
      cancel: () => ctl.cancel(),
    }),
    [floorUnder, noFloor, ctl, editor],
  );

  /** Gestos sobre un soporte de alzado (cara de muro o columna desdoblada); `toSupport` traduce pantalla → (u, v). */
  const supportDraw = useCallback(
    (target: ProgressTarget, toSupport: (x: number, y: number) => Point2D) => ({
      tap: (): boolean => {
        if (!active || !tool) return false;
        if (tool === 'fill') {
          haptic.commit();
          void ctl.fill(target);
        }
        return true;
      },
      begin: (x: number, y: number) => ctl.begin(target, toSupport(x, y)),
      move: (x: number, y: number) => ctl.move(toSupport(x, y)),
      end: (x: number, y: number) => void ctl.end(toSupport(x, y)),
      cancel: () => ctl.cancel(),
    }),
    [active, tool, ctl],
  );
  /** Gestos en el alzado de un muro: el soporte es su cara visible. */
  const faceDraw = useCallback(
    (wallId: string, side: 'A' | 'B', toFace: (x: number, y: number) => Point2D) => supportDraw({ kind: 'wallFace', wallId, side }, toFace),
    [supportDraw],
  );

  const [sheet, setSheet] = useState<null | 'catalog' | 'report'>(null);
  /** Alcance del reporte: un elemento (desde su vista) o `null` = todo el espacio. */
  const [reportScope, setReportScope] = useState<ReportScope | null>(null);

  return {
    active,
    ctl,
    state: st,
    tool,
    drawEnabled,
    planLayers,
    faceLayers,
    supportLayers,
    planSketch,
    draftShapes,
    liveStroke,
    handleTap,
    planDraw,
    faceDraw,
    supportDraw,
    floors,
    columns,
    supports,
    /** Claves de los soportes de suelo, o de los verticales (caras de muro y columnas). */
    supportKeysOfKind: (kind: 'floor' | 'vertical') => [...supports.keys()].filter((k) => k.startsWith('floor:') === (kind === 'floor')),
    sheet,
    reportScope,
    setReportScope,
    openSheet: (s: 'catalog' | 'report') => {
      workspaceStore.getState().closePanels();
      setSheet(s);
    },
    /** Reporte desde la vista actual: un elemento (muro, suelo, columna) o, sin alcance, todo el espacio. */
    openReport: (scope: ReportScope | null) => {
      workspaceStore.getState().closePanels();
      setReportScope(scope);
      setSheet('report');
    },
    closeSheet: () => setSheet(null),
  };
}

/** Elemento(s) que abarca un reporte: claves de soporte y su nombre. */
export interface ReportScope {
  readonly keys: readonly string[];
  readonly title: string;
}

export type Progress = ReturnType<typeof useProgress>;
