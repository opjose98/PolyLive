// =============================================================================
// useReview — El modo Revisión (M4) en la planta y en el alzado
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { ReviewController, ReviewState } from '../../../application/review/ReviewController';
import { Markup, MarkupKind, ReviewItem, ReviewView, anchorOf } from '../../../domain/review/review';
import { categoriesFor, findTool } from '../../../application/workspace/catalog';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast } from '../../primitives';
import type { SketchShape, SketchSource } from '../../canvas/sketch';

export interface ReviewInput {
  services: AppServices;
  spaceId: string;
  editor: EditorController;
  operatorName?: string;
  touchTolerancePx: number;
}

/** Tamaño mínimo (px de pantalla) para que una marca sea intencional. */
const MIN_MARK_PX = 12;
const STROKE_PX = 3;

/** Una marca como formas del lienzo (más su número). */
export function markupShapes(m: Markup, color: string, number?: number, selected = false): SketchShape[] {
  const out: SketchShape[] = [];
  if (m.kind === 'freehand') out.push({ kind: 'stroke', points: m.points, width: STROKE_PX, widthIn: 'px', color });
  else if (m.kind === 'arrow') out.push({ kind: 'arrow', a: m.a, b: m.b, color });
  else if (m.kind === 'rect') out.push({ kind: 'rect', a: m.a, b: m.b, color });
  else if (m.kind === 'cloud') out.push({ kind: 'cloud', a: m.a, b: m.b, color });
  else out.push({ kind: 'text', at: m.at, text: m.text, color });
  if (number !== undefined) out.push({ kind: 'pin', at: anchorOf(m), label: String(number), color, selected });
  return out;
}

export function useReview({ services, spaceId, editor, operatorName, touchTolerancePx }: ReviewInput) {
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const filters = useStore(workspaceStore, (s) => s.filters);
  const view = useStore(workspaceStore, (s) => s.mode);
  const active = workMode === 'revision';

  const ctl = useMemo(() => new ReviewController(services.review, spaceId, operatorName ?? ''), [services, spaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => ctl.setAuthor(operatorName ?? ''), [ctl, operatorName]);
  const [st, setSt] = useState<ReviewState>(() => ctl.getState());
  // El trazo en curso no re-renderiza la pantalla (va directo al lienzo).
  useEffect(
    () =>
      ctl.subscribe((next) =>
        setSt((prev) => {
          for (const k of Object.keys(next) as (keyof ReviewState)[]) {
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
    ctl.load().catch(() => toast('No se pudieron leer las observaciones', { kind: 'error' }));
  }, [ctl]);

  const tool: MarkupKind | null = useMemo(() => {
    if (!active || !activeTool) return null;
    const b = findTool(categoriesFor('revision', view), activeTool.categoryId, activeTool.toolId)?.tool.binding;
    return b?.kind === 'review' ? b.tool : null;
  }, [active, activeTool, view]);
  useEffect(() => ctl.setTool(tool), [ctl, tool]);

  const show = useMemo(() => ({ open: filters.comentarios, resolved: filters.resueltos }), [filters.comentarios, filters.resueltos]);

  const [sheet, setSheet] = useState<null | 'item' | 'list'>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);

  const shapesFor = useCallback(
    (v: ReviewView): SketchShape[] =>
      active ? ctl.itemsIn(v, show).flatMap((i) => markupShapes(i.markup, i.color, i.number, i.id === st.selectedId)) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, active, show, st.items, st.selectedId],
  );
  const planMarkups = useMemo(() => shapesFor({ kind: 'plan' }), [shapesFor]);

  const draftShapes = useCallback((): SketchShape[] => {
    const d = ctl.getState().draft;
    if (!d) return [];
    const m: Markup =
      d.kind === 'freehand' ? { kind: 'freehand', points: d.points } : ({ kind: d.kind, a: d.points[0], b: d.points[1] ?? d.points[0] } as Markup);
    return markupShapes(m, d.color);
  }, [ctl]);

  const planSketch: SketchSource = useMemo(() => {
    let key: unknown = null;
    let cached: SketchShape[] = [];
    return {
      subscribe: (cb) => ctl.subscribe(() => cb()),
      get: () => {
        const d = ctl.getState().draft;
        if (d === key) return cached;
        key = d;
        cached = d?.view.kind === 'plan' ? draftShapes() : [];
        return cached;
      },
    };
  }, [ctl, draftShapes]);

  const afterCreate = useCallback((item: ReviewItem | null) => {
    if (item) setSheet('item');
  }, []);

  // --- Gestos genéricos sobre una vista ---
  const gesturesFor = useCallback(
    (v: ReviewView, toView: (x: number, y: number) => Point2D, pxToUnits: () => number) => ({
      tap: (x: number, y: number): boolean => {
        if (!active) return false;
        const hit = ctl.tap(v, toView(x, y), touchTolerancePx * pxToUnits(), show);
        if (tool) return true;
        if (hit) setSheet('item');
        return hit;
      },
      begin: (x: number, y: number) => ctl.begin(v, toView(x, y)),
      move: (x: number, y: number) => ctl.move(toView(x, y), 2 * pxToUnits()),
      end: (x: number, y: number) => void ctl.end(toView(x, y), MIN_MARK_PX * pxToUnits()).then(afterCreate),
      cancel: () => ctl.cancel(),
    }),
    [active, ctl, touchTolerancePx, show, tool, afterCreate],
  );

  const plan = useMemo(
    () =>
      gesturesFor(
        { kind: 'plan' },
        (x, y) => editor.screenToWorld(x, y),
        () => 1 / editor.getState().transform.scale,
      ),
    [gesturesFor, editor],
  );

  const drawEnabled = active && !!tool && tool !== 'text';

  return {
    active,
    ctl,
    state: st,
    tool,
    show,
    drawEnabled,
    planMarkups,
    shapesFor,
    planSketch,
    draftShapes,
    plan,
    gesturesFor,
    sheet,
    openList: () => {
      workspaceStore.getState().closePanels();
      setSheet('list');
    },
    openItem: (id: string) => {
      ctl.select(id);
      setSheet('item');
    },
    closeSheet: () => setSheet(null),
    photoFor,
    requestPhoto: (id: string) => setPhotoFor(id),
    clearPhotoRequest: () => setPhotoFor(null),
  };
}

export type Review = ReturnType<typeof useReview>;
