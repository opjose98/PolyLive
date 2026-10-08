// =============================================================================
// useDrafting — Dibujo técnico (F6b) en la planta y en el alzado
// =============================================================================
//
// Une el DraftingController (lógica pura, con tests) con la pantalla: traduce
// toques y trazos (pantalla → vista, con enganche a nodos en planta), entrega
// las formas a dibujar y la capa viva del trazo en curso.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Point2D } from '../../../domain/geometry/types';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { DraftingController, DraftingState } from '../../../application/drafting/DraftingController';
import { DraftItem, DraftKind, DraftView, ONE_POINT_KINDS, TWO_POINT_KINDS } from '../../../domain/drafting/drafting';
import { categoriesFor, findTool } from '../../../application/workspace/catalog';
import { workspaceStore } from '../../../state/workspaceStore';
import { toast } from '../../primitives';
import { haptic } from '../../design/haptics';
import { annotativeTextScale, DraftRenderContext, draftPreviewShapes, draftShapes } from '../../canvas/draftShapes';
import type { SketchShape, SketchSource } from '../../canvas/sketch';

interface DraftingInput {
  services: AppServices;
  spaceId: string;
  editor: EditorController;
  levelId: string;
  touchTolerancePx: number;
  /** Texto de una coordenada (N/E reales o X/Y locales). */
  coordText: (p: Point2D) => readonly string[];
  /** Objeto bajo el dedo para Etiqueta: id, texto sugerido y su centro. */
  tagAt: (x: number, y: number) => { targetId: string; text: string } | null;
  targetCenter: (id: string) => Point2D | null;
  colors: { ink: string; accent: string };
}

/** Píldoras de la BPC (cm o pt) → propiedades del elemento (m o pt). */
function draftPropsFromPills(kind: DraftKind, pills: Readonly<Record<string, number | undefined>>): Record<string, number> {
  const m = (v: number | undefined) => (v === undefined ? undefined : v / 100);
  const out: Record<string, number | undefined> = {
    offset: kind === 'dimension' ? m(pills.offset) : undefined,
    size: kind === 'text' ? pills.fontSize : undefined,
    width: kind === 'beam' || kind === 'purlin' ? m(pills.base) : undefined,
    depth: kind === 'beam' || kind === 'purlin' || kind === 'truss' ? m(pills.depth) : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Record<string, number>;
}

export function useDrafting(input: DraftingInput) {
  const { services, spaceId, editor, levelId, touchTolerancePx } = input;
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const view = useStore(workspaceStore, (s) => s.mode);
  // Escala: "Acotado" muestra las cotas; "Anotativa" escala los textos con el zoom a la escala de impresión.
  const showDims = useStore(workspaceStore, (s) => s.scale.dimensioned);
  const annotative = useStore(workspaceStore, (s) => s.scale.annotative);
  const denominator = useStore(workspaceStore, (s) => Number(s.scale.denominator) || 0);
  const editable = workMode === 'levantamiento';

  // Una sola historia con el levantamiento: deshacer sigue el orden real de las acciones.
  const ctl = useMemo(() => new DraftingController(services.drafts, spaceId, levelId, services.commandStack), [services, spaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ctl.onHistory((kind) => (kind === 'push' ? editor.refreshHistory() : void editor.reload()));
    return () => ctl.onHistory(null);
  }, [ctl, editor]);
  // En el render, no en un efecto: las formas de la planta se calculan en este mismo render con el nivel
  // nuevo (con un efecto se calculaban con el anterior y el dibujo no salía al abrir el espacio).
  ctl.setLevel(levelId);
  const [st, setSt] = useState<DraftingState>(() => ctl.getState());
  // El arrastre en curso va directo al lienzo; la pantalla solo se entera de lo estructural.
  useEffect(
    () =>
      ctl.subscribe((next) =>
        setSt((prev) => {
          for (const k of Object.keys(next) as (keyof DraftingState)[]) {
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
    ctl.load().catch(() => toast('No se pudo leer el dibujo', { kind: 'error' }));
  }, [ctl]);

  const tool: DraftKind | null = useMemo(() => {
    if (!editable || !activeTool) return null;
    const b = findTool(categoriesFor('levantamiento', view), activeTool.categoryId, activeTool.toolId)?.tool.binding;
    return b?.kind === 'draft' ? b.tool : null;
  }, [editable, activeTool, view]);
  const pillProps = useMemo(() => (tool && activeTool ? draftPropsFromPills(tool, activeTool.props) : {}), [tool, activeTool]);
  useEffect(() => ctl.setTool(tool, pillProps), [ctl, tool, pillProps]);

  const renderCtx = useCallback(
    (mPerPx: number, up: 1 | -1): DraftRenderContext => ({
      color: input.colors.ink,
      accent: input.colors.accent,
      selectedId: ctl.getState().selectedId,
      mPerPx,
      up,
      coordText: input.coordText,
      targetCenter: input.targetCenter,
      textScale: annotative ? annotativeTextScale(denominator, mPerPx) : 1,
    }),
    [ctl, input.colors, input.coordText, input.targetCenter, annotative, denominator],
  );

  const visible = useCallback(
    (items: readonly DraftItem[]) => (showDims ? items : items.filter((i) => i.kind !== 'dimension')),
    [showDims],
  );
  const transform = editor.getState().transform;
  /** Formas de la planta (en metros del modelo). */
  const planShapes = useMemo(
    () => draftShapes(visible(ctl.itemsIn({ kind: 'plan' })), renderCtx(1 / transform.scale, -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, st.items, st.selectedId, levelId, renderCtx, transform.scale, visible],
  );

  /** Formas de una cara de muro, con `mPerPx` de su vista. */
  const faceShapes = useCallback(
    (v: DraftView, mPerPx: number) => draftShapes(visible(ctl.itemsIn(v)), renderCtx(mPerPx, 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, st.items, st.selectedId, renderCtx, visible],
  );

  /** Capa viva del trazo en curso y del polígono a medio hacer. */
  const previewFor = useCallback(
    (v: DraftView, mPerPx: number, up: 1 | -1): SketchShape[] => {
      const s = ctl.getState();
      const key = v.kind === 'plan' ? 'plan' : `${v.wallId}:${v.side}`;
      const same = (dv: DraftView) => (dv.kind === 'plan' ? 'plan' : `${dv.wallId}:${dv.side}`) === key;
      return draftPreviewShapes(
        s.draft && same(s.draft.view) ? s.draft : null,
        s.polygon && same(s.polygon.view) ? s.polygon : null,
        s.props,
        renderCtx(mPerPx, up),
      );
    },
    [ctl, renderCtx],
  );
  const planSketch: SketchSource = useMemo(() => {
    let key: unknown[] = [];
    let cached: SketchShape[] = [];
    return {
      subscribe: (cb) => ctl.subscribe(() => cb()),
      get: () => {
        const s = ctl.getState();
        const k = [s.draft, s.polygon, s.props];
        if (k.every((x, i) => x === key[i])) return cached;
        key = k;
        cached = previewFor({ kind: 'plan' }, 1 / editor.getState().transform.scale, -1);
        return cached;
      },
    };
  }, [ctl, previewFor, editor]);

  // --- Gestos en la planta: los puntos se pegan a nodos de muro ---
  const snapped = useCallback(
    (x: number, y: number) => editor.snapToNode(x, y, touchTolerancePx).point,
    [editor, touchTolerancePx],
  );
  const mPerPxPlan = () => 1 / editor.getState().transform.scale;

  /** `true` si el toque fue del dibujo técnico (con herramienta, o tocó un elemento sin herramienta). */
  const planTap = useCallback(
    (x: number, y: number): boolean => {
      const s = ctl.getState();
      if (!s.tool) {
        // Sin herramienta: tocar un elemento lo selecciona (en cualquier modo; editar, solo en Levantamiento).
        // Con otra herramienta activa (pincel, relleno, mojón…) el toque es de ella.
        if (workspaceStore.getState().activeTool) return false;
        const hit = ctl.hitTest({ kind: 'plan' }, editor.screenToWorld(x, y), touchTolerancePx * mPerPxPlan());
        if (hit) {
          haptic.select();
          editor.select(null);
          ctl.select(hit.id);
          return true;
        }
        if (s.selectedId) ctl.select(null);
        return false;
      }
      const tag = s.tool === 'tag' ? input.tagAt(x, y) : undefined;
      if (s.tool === 'tag' && !tag) {
        toast('Toca un muro, columna, vano o recinto para etiquetarlo', { kind: 'info' });
        return true;
      }
      // La etiqueta va al lado del objeto (no encima), unida a él por la línea de referencia.
      const p =
        s.tool === 'tag'
          ? editor.screenToWorld(x + 36, y - 56)
          : ONE_POINT_KINDS.includes(s.tool) || s.tool === 'polygon'
            ? snapped(x, y)
            : editor.screenToWorld(x, y);
      haptic.select();
      void ctl.tap({ kind: 'plan' }, p, touchTolerancePx * mPerPxPlan(), tag ?? undefined);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctl, editor, touchTolerancePx, input.tagAt, snapped],
  );

  const drawEnabled = !!tool && TWO_POINT_KINDS.includes(tool);
  const planDraw = useMemo(
    () => ({
      begin: (x: number, y: number) => ctl.begin({ kind: 'plan' }, snapped(x, y)),
      move: (x: number, y: number) => ctl.move(snapped(x, y)),
      end: (x: number, y: number) => void ctl.end(snapped(x, y)),
      cancel: () => ctl.cancel(),
    }),
    [ctl, snapped],
  );

  /** Gestos sobre una cara de muro (alzado): sin enganche a nodos. */
  const faceGestures = useCallback(
    (v: DraftView, toFace: (x: number, y: number) => Point2D, mPerPx: () => number) => ({
      tap: (x: number, y: number): boolean => {
        const s = ctl.getState();
        if (!s.tool) {
          if (workspaceStore.getState().activeTool) return false;
          const hit = ctl.hitTest(v, toFace(x, y), touchTolerancePx * mPerPx());
          if (hit) ctl.select(hit.id);
          else if (s.selectedId) ctl.select(null);
          return !!hit;
        }
        if (s.tool === 'tag') {
          toast('La etiqueta se usa en planta', { kind: 'info' });
          return true;
        }
        void ctl.tap(v, toFace(x, y), touchTolerancePx * mPerPx());
        return true;
      },
      begin: (x: number, y: number) => ctl.begin(v, toFace(x, y)),
      move: (x: number, y: number) => ctl.move(toFace(x, y)),
      end: (x: number, y: number) => void ctl.end(toFace(x, y)),
      cancel: () => ctl.cancel(),
    }),
    [ctl, touchTolerancePx],
  );

  return {
    ctl,
    state: st,
    tool,
    editable,
    drawEnabled,
    planShapes,
    faceShapes,
    planSketch,
    previewFor,
    planTap,
    planDraw,
    faceGestures,
  };
}

export type Drafting = ReturnType<typeof useDrafting>;
