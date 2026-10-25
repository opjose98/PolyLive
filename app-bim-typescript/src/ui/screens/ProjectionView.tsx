// =============================================================================
// ProjectionView — Corte (sección) y alzado desdoblado de una columna
// =============================================================================
//
// Misma pieza que el alzado de un muro (ElevationCanvas: rejilla, niveles,
// rayado de lo cortado). Vive encima de la planta como el alzado; volver la
// deja como estaba.
//   · CORTE: lo cortado (rayado) y, hasta su profundidad de vista, lo que se
//     ve detrás (contorno fino).
//   · COLUMNA: sus caras desdobladas; en Avance se pinta sobre ellas (H-87),
//     con foto de avance y reporte de la columna.
//   · Tocar un elemento lo selecciona: sus propiedades, su alzado (H-91).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { ElevationCanvas } from '../canvas/ElevationCanvas';
import type { ElevationViewport } from '../../application/elevation/WallElevationService';
import { Projection, projectionElementAt } from '../../application/section/projection';
import type { ProjectMarker } from '../../domain/objects/marker';
import { workspaceStore } from '../../state/workspaceStore';
import { categoriesFor, findTool, workModeDef, type PropKey, type ZoomAction } from '../../application/workspace/catalog';
import { resolveBpcContext, type SelectionSummary } from '../../application/workspace/bpcContext';
import { targetKey } from '../../domain/progress/progress';
import { CornerTools } from '../workspace/CornerTools';
import { FabCreate } from '../workspace/FabCreate';
import { FabView } from '../workspace/FabView';
import { Bpc, BpcAction, BpcPill } from '../workspace/Bpc';
import type { Progress } from '../workspace/progress/useProgress';
import { Icon, Tappable } from '../primitives';
import { elevation as shadow, sizes, spacing } from '../design/tokens';
import { haptic } from '../design/haptics';
import { themedStyles, useCanvasPalette, useTheme } from '../design/theme';
import type { SketchShape, SketchSource } from '../canvas/sketch';

interface ProjectionViewProps {
  readonly projection: Projection;
  readonly levels: readonly ProjectMarker[];
  readonly width: number;
  readonly height: number;
  readonly chromeTop: number;
  /** Avance: en una columna se pinta sobre sus caras desdobladas. */
  readonly progress?: Progress;
  /** Propiedades de un elemento tocado (muro, columna, losa) o su dibujo (viga). */
  onOpenObject?(id: string, kind: string): void;
  onOpenWall?(wallId: string): void;
  onOpenColumn?(columnId: string): void;
  /** Foto de avance de la columna (u, v en sus caras desdobladas). */
  onProgressPhoto?(targetKey: string): void;
  onClose(): void;
}

const MIN_SCALE = 10;
const MAX_SCALE = 1200;
const TOUCH_TOL = sizes.canvasTouchTolerance;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const noop = () => undefined;
const KIND_LABEL: Readonly<Record<string, string>> = { wall: 'Muro', column: 'Columna', beam: 'Viga', slab: 'Losa' };
const EMPTY: SketchShape[] = [];

export function ProjectionView({ projection: p, levels, width, height, chromeTop, progress, onClose, ...props }: ProjectionViewProps) {
  const styles = useStyles();
  const colors = useTheme();
  const palette = useCanvasPalette();
  const grid = useStore(workspaceStore, (s) => s.grid.lines || s.grid.dots);
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  const activeTool = useStore(workspaceStore, (s) => s.activeTool);
  const fabOpen = useStore(workspaceStore, (s) => s.currentPanel === 'fabCreate');
  const denominator = useStore(workspaceStore, (s) => s.scale.denominator);

  const fit = useCallback((): ElevationViewport => {
    const L = Math.max(p.length, 0.1);
    const H = Math.max(p.height, 0.1);
    const padX = 84;
    const padTop = 150;
    const padBottom = 140;
    const scale = clamp(Math.min((width - padX * 2) / L, (height - padTop - padBottom) / H), MIN_SCALE, MAX_SCALE);
    return { scale, offsetX: (width - L * scale) / 2, offsetY: padTop + (height - padTop - padBottom + H * scale) / 2 };
  }, [p, width, height]);
  const [viewport, setViewport] = useState<ElevationViewport>(fit);
  // Otra proyección o la vista cambió de tamaño: se vuelve a encuadrar.
  const [fitKey, setFitKey] = useState(() => fit);
  if (fitKey !== fit) {
    setFitKey(() => fit);
    setViewport(fit());
  }

  // La selección es de ESTA proyección: al abrir otra deja de valer sola.
  const [pick, setPick] = useState<{ id: string; kind: string; of: Projection } | null>(null);
  const selected = pick?.of === p ? pick : null;
  const setSelected = useCallback((s: { id: string; kind: string } | null) => setPick(s ? { ...s, of: p } : null), [p]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (progress?.sheet) progress.closeSheet();
      else if (selected) setSelected(null);
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose, progress, selected]);

  // --- Avance sobre la columna ---
  const columnId = p.subject?.kind === 'column' ? p.subject.id : null;
  const columnKey = columnId ? targetKey({ kind: 'column', columnId }) : null;
  const painting = !!progress?.active && !!columnKey;
  const toView = useCallback((x: number, y: number) => ({ x: (x - viewport.offsetX) / viewport.scale, y: (viewport.offsetY - y) / viewport.scale }), [viewport]);
  const draw = useMemo(
    () => (painting && progress && columnKey ? progress.supportDraw({ kind: 'column', columnId: columnId! }, toView) : null),
    [painting, progress, columnKey, columnId, toView],
  );
  const progressCtl = progress?.ctl;
  const progressDraftShapes = progress?.draftShapes;
  const liveSketch = useMemo((): SketchSource => {
    const memo: { key: unknown; shapes: SketchShape[] } = { key: null, shapes: EMPTY };
    return {
      subscribe: (cb) => progressCtl?.subscribe(() => cb()) ?? noop,
      get: () => {
        const d = progressCtl?.getState().draft ?? null;
        if (d === memo.key) return memo.shapes;
        memo.key = d;
        memo.shapes = d && d.target.kind === 'column' && progressDraftShapes ? progressDraftShapes() : EMPTY;
        return memo.shapes;
      },
    };
  }, [progressCtl, progressDraftShapes]);

  const toolBinding = useMemo(() => {
    if (!activeTool) return null;
    return findTool(categoriesFor(workMode, 'plan'), activeTool.categoryId, activeTool.toolId)?.tool.binding ?? null;
  }, [activeTool, workMode]);

  const scene = useMemo(
    () => ({
      elevation: {
        wallId: '',
        roomId: '',
        levels: { base: 0, coronacion: p.silhouette ?? 0 },
        openings: [],
        chainModeEnabled: false,
      },
      wallLength: p.length,
      viewport,
      width,
      height,
      selectedOpeningId: null,
      severityByOpening: new Map(),
      showGrid: grid,
      // La columna desdoblada lleva sus medidas en la cabecera: la cota de altura taparía el nombre de las caras.
      showLabels: !p.dividers,
      hideWall: p.silhouette === null,
      cuts: p.cuts,
      beyond: p.beyond,
      dividers: p.dividers,
      levelLines: levels.map((m) => ({ name: m.name, y: m.value - p.yBase, cota: m.value })),
      palette,
      progressLayers: painting && columnKey && progress ? progress.supportLayers(columnKey) : undefined,
      selectedElementId: selected?.id ?? null,
    }),
    [p, viewport, width, height, grid, levels, palette, painting, columnKey, progress, selected],
  );

  const onZoom = useCallback(
    (a: ZoomAction) => {
      if (a === 'zoomIn' || a === 'zoomOut') {
        const k = a === 'zoomIn' ? 1.25 : 0.8;
        setViewport((v) => {
          const scale = clamp(v.scale * k, MIN_SCALE, MAX_SCALE);
          const f = scale / v.scale;
          return { scale, offsetX: width / 2 - (width / 2 - v.offsetX) * f, offsetY: height / 2 - (height / 2 - v.offsetY) * f };
        });
      } else setViewport(fit());
    },
    [fit, width, height],
  );

  const onTap = useCallback(
    (x: number, y: number) => {
      const w = workspaceStore.getState();
      if (w.currentPanel || w.currentWindow) {
        w.closePanels();
        w.closeWindow();
        return;
      }
      if (toolBinding?.kind === 'progressPhoto' && columnKey) {
        haptic.select();
        props.onProgressPhoto?.(columnKey);
        return;
      }
      if (draw?.tap()) return;
      const q = toView(x, y);
      const hit = projectionElementAt(p, q.x, q.y, TOUCH_TOL / viewport.scale);
      if (hit && hit.id !== columnId) {
        haptic.select();
        setSelected(hit);
      } else setSelected(null);
    },
    [toolBinding, columnKey, draw, toView, p, viewport.scale, columnId, props, setSelected],
  );

  // --- BPC ---
  const selection: SelectionSummary | null = selected ? { typeLabel: KIND_LABEL[selected.kind] ?? 'Elemento', detail: p.subject?.kind === 'section' ? 'en el corte' : 'junto a la columna', props: {} } : null;
  const context = resolveBpcContext({
    tool: activeTool,
    selection,
    viewLabel: workModeDef(workMode).label,
    scaleDenominator: denominator,
    zoomPercent: viewport.scale,
    canvasTitle: p.title,
    canvasItems: [`${p.length.toFixed(2)} m · ${p.detail}`],
  });
  const pills: BpcPill[] =
    context.kind === 'tool'
      ? (Object.entries(context.tool.props) as [PropKey, number][]).map(([key, value]) => ({ key, value, onCommit: (v) => workspaceStore.getState().setToolProp(key, v) }))
      : [];
  const actions: BpcAction[] = selected
    ? [
        ...(props.onOpenObject ? [{ icon: selected.kind === 'beam' ? 'draw' : 'tune-variant', label: selected.kind === 'beam' ? 'Dibujo' : 'Propiedades', onPress: () => props.onOpenObject?.(selected.id, selected.kind) }] : []),
        ...(selected.kind === 'wall' && props.onOpenWall ? [{ icon: 'wall', label: 'Su alzado', onPress: () => props.onOpenWall?.(selected.id) }] : []),
        ...(selected.kind === 'column' && props.onOpenColumn ? [{ icon: 'square', label: 'Su alzado', onPress: () => props.onOpenColumn?.(selected.id) }] : []),
        { icon: 'check', label: 'Listo', onPress: () => setSelected(null) },
      ]
    : painting && progress && columnKey
      ? [
          ...(progress.state.canUndo ? [{ icon: 'undo-variant', label: 'Deshacer trazo', onPress: () => void progress.ctl.undo() }] : []),
          { icon: 'palette-outline', label: 'Actividad y corte', onPress: () => progress.openSheet('catalog') },
          { icon: 'file-chart-outline', label: 'Reporte de la columna', onPress: () => progress.openReport({ keys: [columnKey], title: p.title.replace(/^Alzado · /, '') }) },
        ]
      : [];

  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(110)} style={StyleSheet.absoluteFill}>
      <ElevationCanvas
        scene={scene}
        liveSketch={liveSketch}
        liveStroke={painting ? progress?.liveStroke : null}
        onTap={onTap}
        onDoubleTap={() => setViewport(fit())}
        onLongPress={noop}
        onDragStart={() => false}
        onDragMove={noop}
        onDragEnd={noop}
        onDragCancel={noop}
        drawEnabled={painting && !!progress?.drawEnabled}
        onDrawBegin={(x, y) => draw?.begin(x, y)}
        onDrawMove={(x, y) => draw?.move(x, y)}
        onDrawEnd={(x, y) => draw?.end(x, y)}
        onDrawCancel={() => draw?.cancel()}
        onViewDelta={(s, dx, dy) =>
          setViewport((v) => {
            const scale = clamp(v.scale * s, MIN_SCALE, MAX_SCALE);
            const k = scale / v.scale;
            return { scale, offsetX: dx + v.offsetX * k, offsetY: dy + v.offsetY * k };
          })
        }
      />
      <Bpc context={context} pills={pills} actions={actions} onExitTool={() => workspaceStore.getState().clearTool()} top={chromeTop} right={spacing.lg + sizes.fabView + spacing.sm} />
      <FabView top={chromeTop} />
      <CornerTools onZoom={onZoom} />
      {columnKey && progress?.active ? <FabCreate onToolActivated={() => setSelected(null)} /> : null}
      {fabOpen ? null : (
        <Tappable style={[styles.backBtn, columnKey && progress?.active ? styles.backBtnBeside : null]} onPress={onClose} haptic="select" accessibilityLabel="Volver a la planta">
          <Icon name="arrow-u-left-top" size={20} color={colors.text} />
        </Tappable>
      )}
    </Animated.View>
  );
}

const FAB = sizes.fabCreate;
const useStyles = themedStyles((colors) => ({
  backBtn: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl + (FAB - 44) / 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow[1],
  },
  // Con el FAB + en su sitio, volver va a su izquierda (como en el alzado del muro).
  backBtnBeside: { right: spacing.lg + FAB + spacing.md },
}));
