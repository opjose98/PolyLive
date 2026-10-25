// =============================================================================
// ElevationView — Vista de alzado de un muro (F4)
// Portado de: polylive-mockup/alzado.html (+ main-alzado.js, canvas-alzado.js,
//             minimap.js, alzado-actions.js, bpc-alzado.js)
// =============================================================================
//
// Misma estructura que la planta, con los catálogos del alzado:
//   - BPC: "Alzado · Muro · material · Lado" sin herramienta; píldoras de
//     ancho/alto/antepecho con un hueco seleccionado o una herramienta activa
//   - chip "Muro: … · Fase: …", mini-mapa con el lado que se mira
//   - solo selector de Fase (los niveles son líneas de referencia)
//   - FAB de creación del alzado, FAB de vista, herramientas de esquina
//   - junto al FAB +: cambiar de lado (arriba) y volver a la planta (izquierda)
// Vive DENTRO de SurveyScreen, encima del lienzo de la planta: volver deja la
// planta exactamente como estaba (cámara, selección, herramienta).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ElevationCanvas } from '../canvas/ElevationCanvas';
import type { SketchShape, SketchSource } from '../canvas/sketch';
import { ElevationEditor, ElevationEditorState } from '../../application/elevation/ElevationEditor';
import { workspaceStore } from '../../state/workspaceStore';
import { PropKey, ZoomAction, categoriesFor, findTool, workModeDef } from '../../application/workspace/catalog';
import { AxisGizmo } from '../workspace/AxisGizmo';
import { SelectionSummary, resolveBpcContext } from '../../application/workspace/bpcContext';
import { ProjectMarker } from '../../domain/objects/marker';
import { openingTypeLabel } from '../../domain/objects/wall-elevation';
import { Bpc, BpcAction, BpcPill } from '../workspace/Bpc';
import { LevelChip } from '../workspace/LevelChip';
import { Minimap, MinimapWall, sideColors } from '../workspace/Minimap';
import { RangeEditHandlers, RangeSelectors } from '../workspace/RangeSelector';
import { FabView } from '../workspace/FabView';
import { FabCreate } from '../workspace/FabCreate';
import { CornerTools } from '../workspace/CornerTools';
import { ElevationDetails } from '../workspace/ElevationDetails';
import { ConstraintSelector } from '../workspace/ConstraintSelector';
import { describeExtent, sortLevels } from '../../application/workspace/constraintModel';
import { BottomSheet, Icon, Tappable, toast } from '../primitives';
import { elevation as shadow, sizes, spacing } from '../design/tokens';
import { haptic } from '../design/haptics';
import { themedStyles, useCanvasPalette, useTheme } from '../design/theme';
import type { Progress } from '../workspace/progress/useProgress';
import type { Review } from '../workspace/review/useReview';
import type { Drafting } from '../workspace/drafting/useDrafting';
import type { PhotoMarkerView } from '../../application/editor/EditorController';
import type { PhotoFaceAnchor } from '../../domain/objects/audit-photo';
import type { ReviewView } from '../../domain/review/review';

const TOUCH_TOL = sizes.canvasTouchTolerance;
const cm = (m: number) => Math.round(m * 100);

interface ElevationViewProps {
  readonly editor: ElevationEditor;
  readonly width: number;
  readonly height: number;
  readonly levels: readonly ProjectMarker[];
  readonly planWalls: readonly MinimapWall[];
  readonly levelHandlers: RangeEditHandlers;
  readonly phaseHandlers: RangeEditHandlers;
  readonly chromeTop: number;
  /** Avance (M3): pintar sobre la cara visible del muro. */
  readonly progress?: Progress;
  /** Revisión (M4): marcas sobre la cara visible del muro. */
  readonly review?: Review;
  /** Dibujo técnico (F6b): cotas, textos, vigas… sobre la cara visible. */
  readonly drafting?: Drafting;
  onOpenDraftSheet?(): void;
  /** Fotos del Recinto (las del alzado traen su cara). */
  readonly photoMarkers?: readonly PhotoMarkerView[];
  /** Tocar con la herramienta Foto: abrir la cámara para esta cara y punto. */
  onFacePhoto?(face: PhotoFaceAnchor): void;
  onOpenPhoto?(photoId: string): void;
  onClose(): void;
}

export function ElevationView(props: ElevationViewProps) {
  const styles = useStyles();
  const colors = useTheme();
  const { editor, width, height, levels, chromeTop, onFacePhoto, onOpenPhoto } = props;
  const palette = useCanvasPalette();
  const [st, setSt] = useState<ElevationEditorState>(() => editor.getState());
  const [sheetOpen, setSheetOpen] = useState(false);

  const ws = useStore(
    workspaceStore,
    useShallow((s) => ({
      side: s.elevationSide,
      theme: s.canvasTheme,
      grid: s.grid.lines || s.grid.dots,
      filters: s.filters,
      coordination: s.layers.coordinacion,
      activeTool: s.activeTool,
      workMode: s.workMode,
      denominator: s.scale.denominator,
      fabOpen: s.currentPanel === 'fabCreate',
    })),
  );

  useEffect(() => editor.subscribe(setSt), [editor]);

  // --- Avance: la cara visible es el soporte ---
  const progress = props.progress;
  const painting = !!progress?.active;
  const wallDbId = st.wall ? (st.wall.id as string) : null;
  const face = useMemo(
    () => (progress && wallDbId ? progress.faceDraw(wallDbId, st.side, (x, y) => editor.toCsl(x, y)) : null),
    [progress, wallDbId, st.side, editor],
  );
  // --- Revisión: la cara visible es la vista ---
  const review = props.review;
  const reviewing = !!review?.active;
  const faceView = useMemo((): ReviewView | null => (wallDbId ? { kind: 'wallFace', wallId: wallDbId, side: st.side } : null), [wallDbId, st.side]);
  const reviewGestures = useMemo(
    () =>
      review && faceView
        ? review.gesturesFor(faceView, (x, y) => editor.toCsl(x, y), () => 1 / editor.getState().viewport.scale)
        : null,
    [review, faceView, editor],
  );

  // --- Dibujo técnico: la cara visible es la vista ---
  const drafting = props.drafting;
  const drafts = useMemo(
    () =>
      drafting && faceView
        ? drafting.faceGestures(faceView, (x, y) => editor.toCsl(x, y), () => 1 / editor.getState().viewport.scale)
        : null,
    [drafting, faceView, editor],
  );
  const faceShapesOf = drafting?.faceShapes;
  const draftAnnotations = useMemo(
    () => (faceShapesOf && faceView ? faceShapesOf(faceView, 1 / st.viewport.scale) : undefined),
    [faceShapesOf, faceView, st.viewport.scale],
  );
  const drafting2pt = !!drafting?.drawEnabled;

  // --- Fotos de esta cara ---
  const facePhotos = useMemo(
    () =>
      ws.filters.fotos && wallDbId
        ? (props.photoMarkers ?? []).filter((m) => m.face && m.face.wallId === wallDbId && m.face.side === st.side)
        : [],
    [props.photoMarkers, ws.filters.fotos, wallDbId, st.side],
  );
  const photoPins = useMemo(
    () =>
      facePhotos.map((m) => ({ kind: 'pin' as const, at: { x: m.face!.x, y: m.face!.y }, label: m.label ?? 'Foto', color: palette.selection })),
    [facePhotos, palette.selection],  
  );
  const facePhotoTool = useMemo(() => {
    if (!ws.activeTool) return false;
    const b = findTool(categoriesFor(ws.workMode, 'elevation'), ws.activeTool.categoryId, ws.activeTool.toolId)?.tool.binding;
    return b?.kind === 'facePhoto';
  }, [ws.activeTool, ws.workMode]);

  // El trazo en curso (cota, pincel, marca) va a la capa viva del lienzo: cambia
  // con cada movimiento del dedo sin re-renderizar esta pantalla ni regrabar el muro.
  const reviewCtl = review?.ctl;
  const reviewDraftShapes = review?.draftShapes;
  const progressCtl = progress?.ctl;
  const progressDraftShapes = progress?.draftShapes;
  const draftingCtl = drafting?.ctl;
  const draftPreviewFor = drafting?.previewFor;
  const liveSketch = useMemo((): SketchSource => {
    let key: unknown[] = [];
    let cached: SketchShape[] = [];
    const onFace = (v: { kind: string; wallId?: string; side?: string } | undefined) =>
      !!v && v.kind === 'wallFace' && v.wallId === wallDbId && v.side === st.side;
    return {
      subscribe: (cb) => {
        const subs = [reviewCtl?.subscribe(() => cb()), progressCtl?.subscribe(() => cb()), draftingCtl?.subscribe(() => cb())];
        return () => subs.forEach((u) => u?.());
      },
      get: () => {
        const r = reviewCtl?.getState().draft;
        const p = progressCtl?.getState().draft;
        const d = draftingCtl?.getState();
        const scale = editor.getState().viewport.scale;
        const k = [r, p, d?.draft, d?.polygon, d?.props, scale];
        if (k.length === key.length && k.every((x, i) => x === key[i])) return cached;
        key = k;
        const out: SketchShape[] = [];
        if (r && onFace(r.view) && reviewDraftShapes) out.push(...reviewDraftShapes());
        if (p && onFace(p.target) && progressDraftShapes) out.push(...progressDraftShapes());
        if (draftPreviewFor && faceView) out.push(...draftPreviewFor(faceView, 1 / scale, 1));
        cached = out;
        return cached;
      },
    };
  }, [reviewCtl, reviewDraftShapes, progressCtl, progressDraftShapes, draftingCtl, draftPreviewFor, faceView, wallDbId, st.side, editor]);
  useEffect(() => editor.setSize(width, height), [editor, width, height]);
  useEffect(() => editor.setSide(ws.side), [editor, ws.side]);

  useEffect(() => {
    if (!st.notice) return;
    const { kind, message } = st.notice;
    editor.clearNotice();
    toast(message, { kind: kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info' });
  }, [st.notice, editor]);

  // Botón atrás de Android: primero cierra la hoja, luego vuelve a la planta.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Las hojas de Avance y Revisión viven en la planta pero se abren desde aquí: se cierran primero.
      const rv = props.review;
      const pg = props.progress;
      if (rv?.state.pendingText) rv.ctl.cancelText();
      else if (rv?.sheet) rv.closeSheet();
      else if (pg?.sheet) pg.closeSheet();
      else if (sheetOpen) setSheetOpen(false);
      else props.onClose();
      return true;
    });
    return () => sub.remove();
  }, [sheetOpen, props.onClose, props.review, props.progress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Herramienta del FAB del alzado → herramienta del editor.
  const activeTool = ws.activeTool;
  useEffect(() => {
    if (!activeTool) {
      editor.setTool('select');
      return;
    }
    const binding = findTool(categoriesFor(workspaceStore.getState().workMode, 'elevation'), activeTool.categoryId, activeTool.toolId)?.tool
      .binding;
    editor.setTool(binding?.kind === 'elevation' ? binding.opening : binding?.kind === 'station' ? 'station' : 'select');
  }, [editor, activeTool?.categoryId, activeTool?.toolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Escena ---
  const visibleTypes = useMemo(() => {
    const s = new Set<string>();
    if (ws.filters.vanos) s.add('opening');
    if (ws.filters.puertas) s.add('door');
    if (ws.filters.ventanas) s.add('window');
    return s;
  }, [ws.filters]);
  const severity = useMemo(() => editor.severityByOpening, [editor, st.elevation]);
  const scene = useMemo(
    () =>
      st.elevation
        ? {
            elevation: st.elevation,
            wallLength: editor.wallLength,
            viewport: st.viewport,
            width,
            height,
            mirrored: st.side === 'B',
            selectedOpeningId: st.selectedId,
            dragPreview: st.dragPreview,
            severityByOpening: severity,
            showGrid: ws.grid,
            showLabels: ws.filters.cotas,
            levelLines: st.levelLines,
            palette,
            visibleTypes,
            progressLayers: painting && wallDbId && progress ? progress.faceLayers(wallDbId, st.side) : undefined,
            markups: (reviewing || ws.coordination) && review && faceView ? review.shapesFor(faceView) : undefined,
            annotations: photoPins.length ? [...(draftAnnotations ?? []), ...photoPins] : draftAnnotations,
            profileHandles: ws.workMode === 'levantamiento' ? editor.profileHandles : undefined,
            cuts: st.cuts,
          }
        : null,
    [st, editor, width, height, severity, ws.grid, ws.filters.cotas, palette, visibleTypes, painting, ws.coordination, wallDbId, progress, reviewing, review, faceView, draftAnnotations, photoPins, ws.workMode],
  );

  // Solo Levantamiento edita vanos; Avance y Revisión miran el alzado.
  const editable = ws.workMode === 'levantamiento';
  useEffect(() => {
    if (!editable) setSheetOpen(false);
  }, [editable]);

  // --- Gestos ---
  const onTap = useCallback(
    (x: number, y: number) => {
      const w = workspaceStore.getState();
      if (w.currentPanel || w.currentWindow) {
        w.closePanels();
        w.closeWindow();
        return;
      }
      if (reviewing && reviewGestures?.tap(x, y)) return;
      if (painting && face?.tap()) return;
      if (facePhotoTool && wallDbId) {
        const p = editor.toCsl(x, y);
        if (p.x < 0 || p.x > editor.wallLength || p.y < 0) return;
        haptic.select();
        onFacePhoto?.({ wallId: wallDbId, side: editor.getState().side, x: p.x, y: p.y });
        return;
      }
      if (drafts?.tap(x, y)) return;
      if (!w.activeTool && facePhotos.length && onOpenPhoto) {
        const p = editor.toCsl(x, y);
        const tol = TOUCH_TOL / editor.getState().viewport.scale;
        const hit = facePhotos.find((m) => Math.hypot(m.face!.x - p.x, m.face!.y - p.y) < tol);
        if (hit) {
          onOpenPhoto(hit.id);
          return;
        }
      }
      const props = w.activeTool?.props;
      const before = editor.getState().selectedId;
      void editor
        .tap(x, y, TOUCH_TOL, {
          width: props?.width !== undefined ? props.width / 100 : undefined,
        })
        .then(() => {
          const after = editor.getState().selectedId;
          if (after && after !== before) haptic.select();
        });
    },
    [editor, painting, face, reviewing, reviewGestures, drafts, facePhotoTool, wallDbId, facePhotos, onFacePhoto, onOpenPhoto],
  );
  const onLongPress = useCallback(
    (x: number, y: number) => {
      const hit = editor.openingAt(x, y, TOUCH_TOL);
      if (hit) editor.select(hit.id);
      if (editable) setSheetOpen(true);
    },
    [editor, editable],
  );

  // --- Punto del perfil seleccionado: selector de base y tope (el de la planta) ---
  const point = st.selectedPoint;
  const pointExt = point ? editor.selectedPointExtent : null;
  const constraintLevels = useMemo(
    () => sortLevels(levels.map((m) => ({ id: m.id, name: m.name, value: m.value }))),
    [levels],
  );
  const pointLabel = !point ? '' : point.kind === 'start' ? 'Extremo A' : point.kind === 'end' ? 'Extremo B' : `Punto a ${point.at.toFixed(2)} m`;
  const pointSelector =
    point && pointExt && editable && constraintLevels.length > 0 ? (
      <ConstraintSelector
        levels={constraintLevels}
        edit={{ a: pointExt, b: pointExt, linked: true, editing: 'a' }}
        kind="column"
        canUnlink={false}
        caption={point.kind === 'start' ? 'A' : point.kind === 'end' ? 'B' : 'Pto'}
        endNames={{ a: pointLabel, b: pointLabel }}
        onChange={(ed, commit) => void editor.setPointExtent(ed.a, commit)}
      />
    ) : null;

  // --- BPC ---
  const sel = st.elevation?.openings.find((o) => o.id === st.selectedId) ?? null;
  const selection: SelectionSummary | null = point && pointExt
    ? { typeLabel: pointLabel, detail: describeExtent(constraintLevels, pointExt), props: {} }
    : sel
    ? {
        typeLabel: openingTypeLabel(sel.type),
        detail: `x ${sel.xOffset.toFixed(2)} m`,
        props: { width: cm(sel.width), height: cm(sel.height), ...(sel.type !== 'door' && { sill: cm(sel.sillHeight) }) },
      }
    : null;
  const wallName = (st.wall?.properties.name as string | undefined) ?? 'Muro';
  const context = resolveBpcContext({
    tool: activeTool,
    selection,
    viewLabel: workModeDef(ws.workMode).label,
    scaleDenominator: ws.denominator,
    zoomPercent: (st.viewport.scale / 100) * 100,
    canvasTitle: 'Alzado',
    canvasItems: [
      `${wallName} · ${editor.wallLength.toFixed(2)} m`,
      `${st.wall?.material || (st.wall?.isStructural ? 'Portante' : 'Tabique')} · Lado ${st.side}`,
    ],
  });
  const commitSel = (key: PropKey, v: number) => {
    const m = v / 100;
    if (key === 'width') void editor.updateSelected({ width: m });
    else if (key === 'height') void editor.updateSelected({ height: m });
    else if (key === 'sill') void editor.updateSelected({ sillHeight: m });
  };
  const pills: BpcPill[] =
    context.kind === 'tool'
      ? (Object.entries(context.tool.props) as [PropKey, number][]).map(([key, value]) => ({
          key,
          value,
          onCommit: (v) => workspaceStore.getState().setToolProp(key, v),
        }))
      : context.kind === 'selection' && editable
        ? (Object.entries(context.selection.props) as [PropKey, number][]).map(([key, value]) => ({
            key,
            value,
            onCommit: (v) => commitSel(key, v),
          }))
        : [];
  const dPoly = drafting?.state.polygon;
  const draftActions: BpcAction[] = drafting
    ? [
        ...(drafting.tool === 'polygon' && dPoly && dPoly.points.length >= 3
          ? [{ icon: 'vector-polygon', label: 'Cerrar polígono', onPress: () => void drafting.ctl.closePolygon() }]
          : []),
        ...(drafting.tool === 'polygon' && dPoly ? [{ icon: 'undo-variant', label: 'Quitar punto', onPress: () => drafting.ctl.undoPolygonPoint() }] : []),
        ...(drafting.state.selectedId && !drafting.tool ? [{ icon: 'draw', label: 'Dibujo', onPress: () => props.onOpenDraftSheet?.() }] : []),
      ]
    : [];
  const pointActions: BpcAction[] =
    point && editable
      ? [
          ...(point.kind === 'station'
            ? [{ icon: 'delete-outline', label: 'Quitar punto', onPress: () => void editor.removeSelectedStation() }]
            : []),
          { icon: 'check', label: 'Listo', onPress: () => editor.selectPoint(null) },
        ]
      : [];
  const actions: BpcAction[] = draftActions.length
    ? draftActions
    : pointActions.length
    ? pointActions
    : editable
    ? [{ icon: 'tune-variant', label: sel ? 'Propiedades' : 'Detalles', onPress: () => setSheetOpen(true) }]
    : reviewing && review
      ? [
          ...(review.state.canUndo ? [{ icon: 'undo-variant', label: 'Deshacer', onPress: () => void review.ctl.undo() }] : []),
          ...(review.tool ? [{ icon: 'palette', label: 'Color', onPress: () => review.ctl.cycleColor() }] : []),
          { icon: 'format-list-numbered', label: 'Observaciones', onPress: review.openList },
        ]
      : painting && progress
      ? [
          ...(progress.state.canUndo ? [{ icon: 'undo-variant', label: 'Deshacer trazo', onPress: () => void progress.ctl.undo() }] : []),
          { icon: 'palette-outline', label: 'Actividad y corte', onPress: () => progress.openSheet('catalog') },
          { icon: 'file-chart-outline', label: 'Reporte', onPress: () => progress.openSheet('report') },
        ]
      : [];

  const onZoom = useCallback(
    (a: ZoomAction) => {
      if (a === 'zoomIn') editor.zoomBy(1.25);
      else if (a === 'zoomOut') editor.zoomBy(0.8);
      else editor.zoomToFit();
    },
    [editor],
  );

  const propagate = useCallback(() => {
    void editor.propagateToConnected().then((n) =>
      toast(n === 0 ? 'Ningún muro comparte extremo con este.' : `Niveles igualados en ${n} muro(s) conectado(s).`, {
        kind: n === 0 ? 'info' : 'success',
      }),
    );
  }, [editor]);

  const belowBpc = chromeTop + sizes.bpcHeight + spacing.sm;

  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(110)} style={StyleSheet.absoluteFill}>
      <Animated.View entering={ZoomIn.duration(180)} style={StyleSheet.absoluteFill}>
        {scene ? (
          <ElevationCanvas
            liveSketch={liveSketch}
            scene={scene}
            onTap={onTap}
            onDoubleTap={() => editor.zoomToFit()}
            onLongPress={onLongPress}
            onDragStart={(x, y) => editable && editor.beginDrag(x, y, TOUCH_TOL)}
            onDragMove={(x, y) => editor.updateDrag(x, y, TOUCH_TOL)}
            onDragEnd={() => void editor.endDrag()}
            onDragCancel={() => editor.cancelDrag()}
            onViewDelta={(k, dx, dy) => editor.applyViewDelta(k, dx, dy)}
            drawEnabled={(painting && !!progress?.drawEnabled) || (reviewing && !!review?.drawEnabled) || drafting2pt}
            onDrawBegin={(x, y) => (reviewing ? reviewGestures?.begin(x, y) : drafting2pt ? drafts?.begin(x, y) : face?.begin(x, y))}
            onDrawMove={(x, y) => (reviewing ? reviewGestures?.move(x, y) : drafting2pt ? drafts?.move(x, y) : face?.move(x, y))}
            onDrawEnd={(x, y) => (reviewing ? reviewGestures?.end(x, y) : drafting2pt ? drafts?.end(x, y) : face?.end(x, y))}
            onDrawCancel={() => (reviewing ? reviewGestures?.cancel() : drafting2pt ? drafts?.cancel() : face?.cancel())}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]} />
        )}
      </Animated.View>

      <Bpc
        context={context}
        pills={pills}
        actions={actions}
        onExitTool={() => workspaceStore.getState().clearTool()}
        top={chromeTop}
        right={spacing.lg + sizes.fabView + spacing.sm}
      />
      <LevelChip top={belowBpc} wallName={wallName} />
      <Minimap walls={props.planWalls} activeId={st.wall ? (st.wall.id as string) : ''} top={belowBpc + 28} />
      <RangeSelectors levels={props.levelHandlers} phases={props.phaseHandlers} only="phases" extra={pointSelector} />
      <FabView top={chromeTop} />
      <AxisGizmo kind="elevation" mirrored={st.side === 'B'} bottom={spacing.xl + sizes.fabCreate + spacing.md} />
      <CornerTools onZoom={onZoom} />
      <FabCreate onToolActivated={() => editor.select(null)} />

      {/* Junto al FAB +: cambiar de lado (arriba) y volver a la planta (izquierda).
          Se ocultan mientras el FAB despliega sus categorías en ese mismo sitio. */}
      {ws.fabOpen ? null : (
      <>
      <Tappable
        style={[styles.sideBtn, { borderColor: sideColors(colors)[st.side] }]}
        onPress={() => workspaceStore.getState().toggleElevationSide()}
        haptic="select"
        accessibilityLabel={`Cambiar al lado ${st.side === 'A' ? 'B' : 'A'}`}
      >
        <Animated.Text key={st.side} entering={ZoomIn.duration(160)} style={[styles.sideText, { color: sideColors(colors)[st.side] }]}>
          {st.side}
        </Animated.Text>
      </Tappable>
      <Tappable style={styles.backBtn} onPress={props.onClose} haptic="select" accessibilityLabel="Volver a la planta">
        <Icon name="arrow-u-left-top" size={20} color={colors.text} />
      </Tappable>
      </>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} heightRatio={0.62}>
        <ElevationDetails editor={editor} state={st} levels={levels} onPropagate={propagate} />
      </BottomSheet>
    </Animated.View>
  );
}

const FAB = sizes.fabCreate;
const useStyles = themedStyles((colors) => ({
  sideBtn: {
    position: 'absolute',
    right: spacing.lg + (FAB - 44) / 2,
    bottom: spacing.xl + FAB + spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow[1],
  },
  sideText: { fontSize: 17, fontWeight: '800' },
  backBtn: {
    position: 'absolute',
    right: spacing.lg + FAB + spacing.md,
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
}));
