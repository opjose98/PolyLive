// =============================================================================
// useProgress — El modo Avance (M3) en la planta y en el alzado
// =============================================================================
//
// Une el ProgressController (lógica pura, con tests) con la pantalla:
//   · calcula los SOPORTES: suelos (contorno neto del recinto) y las dos caras
//     de cada muro (perfil real menos vanos);
//   · traduce los gestos (pantalla → coordenadas del soporte);
//   · entrega lo que se dibuja (capas por actividad y el trazo en curso).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { ProgressController, ProgressState, ProgressTool } from '../../../application/progress/ProgressController';
import { faceSupport, ProgressTarget, Support, targetKey } from '../../../domain/progress/progress';
import type { WallElevation } from '../../../domain/objects/wall-elevation';
import { categoriesFor, findTool } from '../../../application/workspace/catalog';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast } from '../../primitives';
import { haptic } from '../../design/haptics';
import type { SketchShape, SketchSource } from '../../canvas/sketch';

export interface ProgressInput {
  services: AppServices;
  projectId?: string;
  spaceId: string;
  editor: EditorController;
  operatorName?: string;
  /** Muros u objetos cambiaron: se recalculan los soportes. */
  objectsVersion: unknown;
}

const ERASER_COLOR = '#9E9E9E';

export function useProgress({ services, projectId, spaceId, editor, operatorName, objectsVersion }: ProgressInput) {
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
  // va directo al lienzo (planSketch), como el muro que se está trazando.
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

  const floors = useMemo(() => editor.floorViews, [editor, objectsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const supports = useMemo(() => {
    const map = new Map<string, Support>();
    for (const f of floors) map.set(targetKey({ kind: 'floor', zoneId: f.zoneId }), { outline: f.polygon, holes: [] });
    const openingsOf = new Map(elevations.map((e) => [e.wallId, e.openings]));
    for (const w of editor.walls) {
      const p = editor.wallProfile(w);
      const y0 = Math.min(p.start.base, p.end.base);
      const s = faceSupport(
        w.length as number,
        { leftBase: p.start.base - y0, rightBase: p.end.base - y0, leftTop: p.start.top - y0, rightTop: p.end.top - y0 },
        openingsOf.get(w.id as string) ?? [],
      );
      map.set(targetKey({ kind: 'wallFace', wallId: w.id as string, side: 'A' }), s);
      map.set(targetKey({ kind: 'wallFace', wallId: w.id as string, side: 'B' }), s);
    }
    return map;
  }, [floors, elevations, editor, objectsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => ctl.setSupports(supports), [ctl, supports]);

  // --- Dibujo ---
  const layers = useMemo(
    () => (filters.actividades ? ctl.layers(filters.cortesAnteriores) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, st.marks, st.cutId, st.allActivities, supports, filters.actividades, filters.cortesAnteriores],
  );
  /** Capas de la planta (suelos) en coordenadas del modelo. */
  const planLayers = useMemo(() => layers.filter((l) => l.targetKey.startsWith('floor:')), [layers]);
  /** Capas de una cara de muro, en (u, v). */
  const faceLayers = useCallback(
    (wallId: string, side: 'A' | 'B') => layers.filter((l) => l.targetKey === targetKey({ kind: 'wallFace', wallId, side })),
    [layers],
  );

  /** Trazo en curso como formas de boceto (en las coordenadas de su soporte). */
  const draftShapes = useCallback((): SketchShape[] => {
    const d = ctl.getState().draft;
    if (!d) return [];
    const color = d.tool === 'eraser' ? ERASER_COLOR : d.color;
    if (d.tool === 'rect') {
      return d.points.length >= 2 ? [{ kind: 'rect', a: d.points[0], b: d.points[1], color, fill: true, opacity: 0.45 }] : [];
    }
    const tip = d.points[d.points.length - 1];
    return [
      { kind: 'stroke', points: d.points, width: d.width, widthIn: 'm', color, opacity: 0.45 },
      // El tamaño real del pincel bajo el dedo: se ve qué va a cubrir.
      { kind: 'ring', at: tip, radius: d.width / 2, color: d.tool === 'eraser' ? '#616161' : color },
    ];
  }, [ctl]);

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
      const target = ctl.floorAt(world, floors);
      return target ? { target, world } : null;
    },
    [editor, ctl, floors],
  );

  const noFloor = useCallback(() => {
    toast(
      floors.length
        ? 'Pinta sobre un suelo (los recintos con trama).'
        : 'No hay suelos: en Levantamiento, herramienta Suelo sobre cada recinto.',
      { kind: 'info', durationMs: 2600 },
    );
  }, [floors.length]);

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

  /** Gestos en el alzado: el soporte es la cara visible del muro; `toFace` traduce pantalla → (u, v). */
  const faceDraw = useCallback(
    (wallId: string, side: 'A' | 'B', toFace: (x: number, y: number) => Point2D) => {
      const target: ProgressTarget = { kind: 'wallFace', wallId, side };
      return {
        tap: (): boolean => {
          if (!active || !tool) return false;
          if (tool === 'fill') {
            haptic.commit();
            void ctl.fill(target);
          }
          return true;
        },
        begin: (x: number, y: number) => ctl.begin(target, toFace(x, y)),
        move: (x: number, y: number) => ctl.move(toFace(x, y)),
        end: (x: number, y: number) => void ctl.end(toFace(x, y)),
        cancel: () => ctl.cancel(),
      };
    },
    [active, tool, ctl],
  );

  const [sheet, setSheet] = useState<null | 'catalog' | 'report'>(null);

  return {
    active,
    ctl,
    state: st,
    tool,
    drawEnabled,
    planLayers,
    faceLayers,
    planSketch,
    draftShapes,
    handleTap,
    planDraw,
    faceDraw,
    floors,
    supports,
    sheet,
    openSheet: (s: 'catalog' | 'report') => {
      workspaceStore.getState().closePanels();
      setSheet(s);
    },
    closeSheet: () => setSheet(null),
  };
}

export type Progress = ReturnType<typeof useProgress>;
