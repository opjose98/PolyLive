// =============================================================================
// SurveyScreen.tsx — Espacio de trabajo de un espacio (planta + alzado)
// =============================================================================
//
// Es una VISTA: suscribe a EditorController (modelo y cámara de la planta),
// a workspaceStore (cromo: modo, herramienta, filtros, niveles/fases) y le
// manda intenciones. Lo que se puede razonar sin pintar vive en el
// controlador, en application/workspace y en los hooks de cada modo
// (useTopography), y tiene tests.
//
// Cromo: barra de estado, BPC, FAB + (catálogo del modo), FAB de modo,
// selectores de nivel/fase, ejes, herramientas de esquina, drawer ⋮ y menú ☰.
// Solo Levantamiento edita el modelo; los demás modos lo consultan y agregan
// su propia capa (Topografía: mojones y coordenadas).
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Dimensions, Modal, BackHandler } from 'react-native';

import { PlanCanvas } from '../canvas/PlanCanvas';
import { BottomSheet, toast, alertDialog } from '../primitives';
import { sizes } from '../design/tokens';
import { themedStyles, useCanvasPalette } from '../design/theme';
import { haptic } from '../design/haptics';
import { workspaceStore } from '../../state/workspaceStore';
import { ZoomAction, categoriesFor, findTool, PropKey, workModeDef } from '../../application/workspace/catalog';
import { AxisGizmo } from '../workspace/AxisGizmo';
import { resolveBpcContext, SelectionSummary } from '../../application/workspace/bpcContext';
import { DEFAULT_SCALE } from '../../application/canvas/types';
import { useShallow } from 'zustand/react/shallow';
import { Column } from '../../domain/objects/column';
import { Room } from '../../domain/objects/room';
import { WorkspaceStatusBar } from '../workspace/WorkspaceStatusBar';
import { Bpc, BpcAction, BpcPill } from '../workspace/Bpc';
import { FabCreate } from '../workspace/FabCreate';
import { ThumbUndo } from '../workspace/ThumbUndo';
import { FabView } from '../workspace/FabView';
import { CornerTools } from '../workspace/CornerTools';
import { LevelChip } from '../workspace/LevelChip';
import { ConfigDrawer } from '../workspace/ConfigDrawer';
import { MainMenu, MainMenuItem } from '../workspace/MainMenu';
import { RangeSelectors } from '../workspace/RangeSelector';
import { DEFAULT_EDITOR_DEFAULTS } from '../../application/editor/EditorController';
import { ConstraintSelector } from '../workspace/ConstraintSelector';
import {
  ConstraintEdit,
  ConstraintLevel,
  defaultExtent,
  describeExtent,
  sortLevels,
} from '../../application/workspace/constraintModel';
import { isUniformWall, sameExtent } from '../../domain/objects/vertical';
import { exportRevitIfc } from '../workspace/exportActions';
import { useProjectLevels } from '../workspace/useProjectLevels';
import { createLiveSource, draggedIds, isDragging, sameStructure } from '../canvas/liveOverlay';
import { uniqueVertices, useTopography } from '../workspace/topo/useTopography';
import { TopographySheets } from '../workspace/topo/TopographySheets';
import { TopographyPanel } from '../workspace/topo/TopographyPanel';
import { useTopoTools } from '../workspace/topo/useTopoTools';
import { StakeoutSheet } from '../workspace/topo/StakeoutSheet';
import { useProgress } from '../workspace/progress/useProgress';
import { ProgressSheets } from '../workspace/progress/ProgressSheets';
import { planSvg, faceSvg } from '../../application/report/planSvg';
import { useReview } from '../workspace/review/useReview';
import { ReviewSheets } from '../workspace/review/ReviewSheets';
import { reviewSvgMarks } from '../../application/review/reviewReport';
import { countByStatus, ReviewItem, ReviewView } from '../../domain/review/review';
import { zoneCode as zoneCodeOf } from '../../domain/objects/zone';
import { amarreSummary, coordinateInline } from '../../application/geo/coordinateText';
import { ElevationEditor } from '../../application/elevation/ElevationEditor';
import { ElevationView } from './ElevationView';
import type { CanvasTransform } from '../../domain/geometry/types';
import { sizes as chromeSizes, spacing as chromeSpacing } from '../design/tokens';
import { useStore } from 'zustand';
import { CameraCaptureView } from '../components/CameraCaptureView';
import { ExpoPhotoCapture } from '../../native/camera/ExpoPhotoCapture';
import { ExpoFileSystem } from '../../native/filesystem/ExpoFileSystem';
import { ExpoGpsProvider } from '../../native/location/ExpoGpsProvider';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../shared/encoding/base64';
import { PHOTO_BIM_CODE_PREFIX } from '../../domain/objects/audit-photo';
import { generateBimCode } from '../../domain/objects/project';
import { ActionButton } from '../primitives';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { ZoneSheet } from '../workspace/ZoneSheet';
import { zoneCode } from '../../domain/objects/zone';
import { NumberField } from '../components/fields';
import { AppServices } from '../../application/AppServices';
import { EditorController, EditorState } from '../../application/editor/EditorController';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Measurement } from '../../domain/objects/measurement';
import { RoomId, revitObjectId, wallId } from '../../domain/objects/base';
import { AppError } from '../../shared/errors/AppError';
import { meters } from '../../domain/geometry/types';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';

const CANVAS_TOUCH_TOLERANCE_PX = sizes.canvasTouchTolerance;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyScreenProps {
  services: AppServices;
  roomId: RoomId;
  /** Abre la galería filtrada por el objeto indicado. */
  onOpenPhotos?: (objectId: string) => void;
  /** Abre una foto concreta (al tocar su marcador en la planta). */
  onOpenPhoto?: (photoId: string) => void;
  /** Proyecto al que pertenece el espacio: define sus niveles y fases. */
  projectId?: string;
  projectName?: string;
  projectCode?: string;
  operatorName?: string;
  /** Salir del espacio (volver a la lista de espacios del proyecto). */
  onExit?: () => void;
  /** Salir del proyecto (volver a la lista de proyectos). */
  onExitProject?: () => void;
  /** Abre una pantalla del menú ☰ (galería, exportar, ajustes...). */
  onNavigate?: (screen: MenuScreen) => void;
}

/** Pantallas que se abren desde el menú ☰, por encima del levantamiento. */
export type MenuScreen = 'gallery' | 'export' | 'settings' | 'profile';

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SurveyScreen({
  services,
  roomId,
  onOpenPhotos,
  onOpenPhoto,
  projectId,
  projectName = 'Proyecto',
  projectCode = '',
  operatorName = '',
  onExit,
  onExitProject,
  onNavigate,
}: SurveyScreenProps) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const canvasHeight = Math.max(240, Math.round(screenHeight * 0.45));

  // --- Controlador del editor: uno por Recinto activo ---
  const editor = useMemo(
    () =>
      new EditorController({
        services,
        roomId,
        roomObjectId: revitObjectId(roomId as unknown as string),
        initialTransform: { scale: 100, offsetX: screenWidth / 2, offsetY: canvasHeight / 2 },
      }),
    [services, roomId, screenWidth, canvasHeight],
  );

  const [state, setState] = useState<EditorState>(() => editor.getState());
  const [panelOpen, setPanelOpen] = useState(false);
  const [zoneSheetOpen, setZoneSheetOpen] = useState(false);
  const [manualMeasureOpen, setManualMeasureOpen] = useState(false);
  const [manualValue, setManualValue] = useState(3);
  const [measurements, setMeasurements] = useState<readonly Measurement[]>([]);

  // --- Cromo del espacio de trabajo (FABs, BPC, herramientas de esquina) ---
  const wsState = useStore(
    workspaceStore,
    useShallow((s) => ({
      gridLines: s.grid.lines,
      gridDots: s.grid.dots,
      snapNode: s.snap.node,
      snapAngle: s.snap.angle,
      activeTool: s.activeTool,
      workMode: s.workMode,
      filters: s.filters,
      layers: s.layers,
      denominator: s.scale.denominator,
    })),
  );
  const { gridLines, gridDots } = wsState;
  // Las herramientas de esquina se despliegan sobre los ejes: mientras estén abiertas, los ejes se ocultan.
  const cornerOpen = useStore(workspaceStore, (s) => s.currentPanel === 'cornerTools');
  const fabOpen = useStore(workspaceStore, (s) => s.fab.level !== 'closed');
  const styles = useStyles();
  const canvasPalette = useCanvasPalette();

  // El lienzo ocupa todo el alto disponible; se mide al montar.
  const [canvasSize, setCanvasSize] = useState({ w: screenWidth, h: canvasHeight });

  // --- Captura de foto anclada a la planta (SPDS) ---
  const [photoCapture] = useState(() => new ExpoPhotoCapture());
  const [photoFs] = useState(() => new ExpoFileSystem());
  const [gps] = useState(() => new ExpoGpsProvider());

  // -----------------------------------------------------------------------
  // Suscripción al controlador
  // -----------------------------------------------------------------------

  // La pantalla solo se entera de cambios ESTRUCTURALES; el trazo y el
  // arrastre en vivo van directo al lienzo (ver canvas/liveOverlay.ts).
  useEffect(() => editor.subscribe((next) => setState((prev) => (sameStructure(prev, next) ? prev : next))), [editor]);
  const live = useMemo(() => createLiveSource(editor), [editor]);

  useEffect(() => {
    editor.init().catch(() => toast('No se pudo abrir el levantamiento.', { kind: 'error' }));
  }, [editor]);

  // Los avisos del controlador se muestran una vez y se limpian, para que un
  // mismo mensaje no reaparezca en cada re-render.
  useEffect(() => {
    if (!state.notice) return;
    const { kind, message } = state.notice;
    editor.clearNotice();
    toast(message, { kind: kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info' });
  }, [state.notice, editor]);

  // --- El cromo manda sobre el motor: snap, rejilla y herramienta activa ---
  useEffect(() => editor.setNodeSnapEnabled(wsState.snapNode), [editor, wsState.snapNode]);
  useEffect(() => editor.setSnapEnabled(wsState.snapAngle), [editor, wsState.snapAngle]);

  const activeTool = wsState.activeTool;
  useEffect(() => {
    if (!activeTool) {
      if (editor.getState().tool !== 'select') editor.setTool('select');
      return;
    }
    const binding = findTool(categoriesFor(workspaceStore.getState().workMode, 'plan'), activeTool.categoryId, activeTool.toolId)?.tool
      .binding;
    if (binding?.kind !== 'plan') return;
    editor.setTool(binding.tool);
    if (binding.tool === 'wall' && activeTool.methodId) editor.setCreationMethod('wall', activeTool.methodId as 'drag' | 'points');
    if (binding.tool === 'column' && activeTool.methodId) {
      editor.setCreationMethod('column', activeTool.methodId as 'rectangular' | 'circular');
    }
  }, [editor, activeTool?.categoryId, activeTool?.toolId, activeTool?.methodId]);

  // Las propiedades de la herramienta (píldoras de la BPC) son los valores con
  // que se crean los objetos nuevos.
  useEffect(() => {
    const p = activeTool?.props;
    if (!p) return;
    const cm = (v: number | undefined) => (v === undefined ? undefined : meters(v / 100));
    editor.setDefaults({
      ...(p.thickness !== undefined && activeTool?.toolId === 'muro' && { wallThickness: cm(p.thickness)! }),
      ...(p.thickness !== undefined && activeTool?.toolId === 'suelo' && { floorThickness: cm(p.thickness)! }),
      ...(p.side !== undefined && { columnDiameter: cm(p.side)! }),
      ...(p.width !== undefined && activeTool?.toolId === 'puerta' && { doorWidth: cm(p.width)! }),
      ...(p.width !== undefined && activeTool?.toolId === 'ventana' && { windowWidth: cm(p.width)! }),
    });
  }, [editor, activeTool]);

  // --- Niveles y fases del proyecto (selectores de rango) ---
  // Solo Levantamiento edita el modelo; los demás modos lo consultan (y en
  // M2–M4 agregan su propia capa: mojones, avance, marcas).
  const editable = wsState.workMode === 'levantamiento';
  useEffect(() => {
    if (!editable) setPanelOpen(false);
  }, [editable]);
  // Avance solo se abre si hay algo que reportar.
  const hasObjects = state.objects.some((o) => !(o instanceof Room));

  const { loaded: markersLoaded, view: levelInfo, levelHandlers, phaseHandlers, projectLevels } = useProjectLevels({
    services,
    projectId,
    editor,
  });

  // --- Selector de base y tope (muros y columnas) ---
  const constraintLevels = useMemo<ConstraintLevel[]>(
    () => sortLevels(levelInfo.levels.map((i) => ({ id: i.id, name: i.name, value: i.value }))),
    [levelInfo.levels],
  );
  const levelsKey = constraintLevels.map((l) => `${l.id}:${l.value}`).join('|');
  const unconnectedDefault = DEFAULT_EDITOR_DEFAULTS.wallHeight as number;
  const [creationEdit, setCreationEdit] = useState<ConstraintEdit | null>(null);

  // Por defecto siempre desde el nivel en que se está trabajando hasta el de
  // arriba; cambiar de planta (o la lista de niveles) lo reinicia.
  useEffect(() => {
    if (!markersLoaded || constraintLevels.length === 0) return;
    const e = defaultExtent(constraintLevels, levelInfo.active.id, unconnectedDefault);
    setCreationEdit({ a: e, b: e, linked: true, editing: 'a' });
  }, [markersLoaded, levelInfo.active.id, levelsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const wallMethod = activeTool?.toolId === 'muro' ? ((activeTool.methodId as 'drag' | 'points' | undefined) ?? 'drag') : null;
  const isColumnTool = !!activeTool?.toolId.startsWith('columna');

  // Punto a punto: cada punto tiene su selector. Al fijar el primero, el
  // segundo arranca con sus mismos niveles y el selector pasa a editarlo.
  const draftStarted = !!state.wallDraft?.start;
  const prevDraftStarted = useRef(false);
  useEffect(() => {
    if (wallMethod !== 'points') {
      prevDraftStarted.current = draftStarted;
      return;
    }
    if (draftStarted !== prevDraftStarted.current) {
      setCreationEdit((ed) =>
        ed ? (draftStarted ? { ...ed, linked: false, b: ed.a, editing: 'b' } : { ...ed, linked: false, editing: 'a' }) : ed,
      );
      haptic.select();
    }
    prevDraftStarted.current = draftStarted;
  }, [draftStarted, wallMethod]);

  // Arrastre libre: un solo par base/tope para todo el muro.
  useEffect(() => {
    if (wallMethod === 'drag') setCreationEdit((ed) => (ed && !ed.linked ? { ...ed, linked: true, b: ed.a, editing: 'a' } : ed));
    if (wallMethod === 'points') setCreationEdit((ed) => (ed && ed.linked ? { ...ed, linked: false } : ed));
  }, [wallMethod]);

  useEffect(() => {
    if (!creationEdit) {
      editor.setCreationVertical({ wall: null, column: null });
      return;
    }
    editor.setCreationVertical({
      wall: { start: creationEdit.a, end: creationEdit.linked ? creationEdit.a : creationEdit.b },
      column: creationEdit.a,
    });
  }, [editor, creationEdit]);

  // --- Topografía (M2): mojones, amarre y coordenadas reales ---
  const topo = useTopography({
    services,
    projectId,
    spaceId: roomId as unknown as string,
    editor,
    levelZ: Number.isFinite(levelInfo.active.value) ? levelInfo.active.value : 0,
    operatorName,
    touchTolerancePx: CANVAS_TOUCH_TOLERANCE_PX,
  });

  // --- Topografía de apoyo (M2b): inverso, área, replanteo, cuadrícula, CSV/KML ---
  const topoTools = useTopoTools({
    services,
    projectId,
    spaceId: roomId as unknown as string,
    projectName,
    editor,
    topo,
    touchTolerancePx: CANVAS_TOUCH_TOLERANCE_PX,
    operatorName,
  });

  // --- Avance de obra (M3): pintar sobre suelos y caras de muro ---
  const progress = useProgress({
    services,
    projectId,
    spaceId: roomId as unknown as string,
    editor,
    operatorName,
    objectsVersion: state.objects,
  });

  // --- Revisión (M4): marcas y observaciones ---
  const review = useReview({
    services,
    spaceId: roomId as unknown as string,
    editor,
    operatorName,
    touchTolerancePx: CANVAS_TOUCH_TOLERANCE_PX,
  });

  const topoBack = topo.back;

  // --- Alzado (F4): vive encima de la planta, que queda intacta debajo ---
  const [elevWallId, setElevWallId] = useState<string | null>(null);
  const planCamera = useRef<CanvasTransform | null>(null);
  const elevEditor = useMemo(
    () => (elevWallId ? new ElevationEditor({ services, wallId: elevWallId, levels: projectLevels }) : null),
    [services, elevWallId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    elevEditor?.setLevels(projectLevels);
  }, [elevEditor, projectLevels]);
  useEffect(() => {
    if (!elevEditor) return;
    void elevEditor.load();
    // Lo editado en el alzado entra en la historia compartida: los botones de
    // deshacer/rehacer de la barra tienen que enterarse.
    return elevEditor.subscribe((s) => {
      if (!s.busy) editor.refreshHistory();
    });
  }, [elevEditor, editor]);

  /**
   * Transición planta → alzado: la cámara vuela hasta el muro y, cuando
   * llega, el alzado entra con un zoom y un fundido. Volver deshace el vuelo.
   */
  const openElevation = useCallback(
    (wallDbId: string) => {
      if (elevWallId) return;
      planCamera.current = editor.getState().transform;
      editor.select(revitObjectId(wallDbId));
      editor.zoomToSelection(canvasSize.w, canvasSize.h);
      const ws = workspaceStore.getState();
      ws.closePanels();
      ws.closeWindow();
      ws.setMode('elevation');
      haptic.select();
      setTimeout(() => setElevWallId(wallDbId), 170);
    },
    [editor, canvasSize, elevWallId],
  );
  // Atrás de Android en la planta: cierra lo que esté abierto (panel,
  // ventana, herramienta) y, si no hay nada, vuelve a los espacios. Sin esto,
  // al quitar las pestañas el atrás cerraba la app entera. El alzado y las
  // pantallas del menú registran su propio atrás encima de este.
  useEffect(() => {
    if (elevWallId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Lo abierto se cierra antes de salir del espacio: hojas, textos y flujos de cada modo.
      if (review.state.pendingText) {
        review.ctl.cancelText();
        return true;
      }
      if (review.sheet) {
        review.closeSheet();
        return true;
      }
      if (progress.sheet) {
        progress.closeSheet();
        return true;
      }
      if (topoTools.stakeTarget) {
        topoTools.closeStakeout();
        return true;
      }
      if (zoneSheetOpen) {
        setZoneSheetOpen(false);
        return true;
      }
      if (topoBack()) return true;
      if (panelOpen) {
        setPanelOpen(false);
        return true;
      }
      const ws = workspaceStore.getState();
      if (ws.currentPanel || ws.currentWindow) {
        ws.closePanels();
        ws.closeWindow();
        return true;
      }
      if (ws.activeTool) {
        ws.clearTool();
        return true;
      }
      if (onExit) {
        onExit();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [elevWallId, onExit, panelOpen, topoBack, zoneSheetOpen, review, progress, topoTools]);

  const closeElevation = useCallback(() => {
    setElevWallId(null);
    workspaceStore.getState().setMode('plan');
    if (planCamera.current) editor.setTransform(planCamera.current);
    planCamera.current = null;
    // Lo hecho en el alzado (puertas, ventanas, alturas) se ve al volver.
    editor.refresh();
  }, [editor]);

  // Historial de mediciones del muro seleccionado — GAP CERRADO: las
  // mediciones se escribían en SQLite y no había ninguna vista que las leyera.
  useEffect(() => {
    let cancelled = false;
    const selected = editor.selected;

    if (!(selected instanceof Wall)) {
      setMeasurements([]);
      return;
    }

    services.store
      .listMeasurementsForWall(wallId(selected.id as string))
      .then((rows) => {
        if (!cancelled) setMeasurements(rows);
      })
      .catch(() => {
        if (!cancelled) setMeasurements([]);
      });

    return () => {
      cancelled = true;
    };
  }, [services, editor, state.selectedId, state.objects]);

  // -----------------------------------------------------------------------
  // Gestos del canvas
  // -----------------------------------------------------------------------

  /**
   * Guarda la foto recién capturada y la ancla al punto elegido.
   *
   * El GPS se intenta pero NO bloquea: en un sótano no hay fix, y perder la
   * foto por eso sería absurdo. La foto sin coordenadas sigue teniendo su
   * marcador en la planta, que es la ubicación que de verdad hace falta.
   */
  const handlePhotoCaptured = useCallback(
    async (photo: { base64: string }) => {
      try {
        const saved = await photoFs.savePhoto(photo.base64);

        let geo: { latitude: number; longitude: number; accuracyMeters: number } | undefined;
        try {
          const fix = await gps.getCurrentPosition();
          geo = {
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracyMeters: Number(fix.accuracy),
          };
        } catch {
          geo = undefined;
        }

        const existing = await services.store.listAuditPhotos(roomId);
        const bimCode = generateBimCode(
          PHOTO_BIM_CODE_PREFIX,
          existing.map((p) => p.metadata.bimCode).filter((c): c is string => !!c),
        );

        const result = await services.useCases.capturePhoto.execute({
          roomId,
          photoData: base64ToUint8Array(photo.base64),
          filename: saved.filename,
          metadata: { bimCode, geo },
        });

        await editor.attachPhotoMarker(result.photoId);
      } catch (err: unknown) {
        alertDialog(
          'Error',
          err instanceof AppError ? err.userMessage : 'No se pudo guardar la foto.',
        );
        editor.clearPendingPhotoPoint();
      }
    },
    [photoFs, gps, services, roomId, editor],
  );

  // Tocar solo selecciona (o dibuja); las propiedades se abren con long-press,
  // así seleccionar para arrastrar no tapa el plano con un panel.
  const handleTap = useCallback(
    (x: number, y: number) => {
      // Tocar el lienzo con un panel abierto solo lo cierra (regla del mockup).
      const wsNow = workspaceStore.getState();
      if (wsNow.currentPanel || wsNow.currentWindow) {
        wsNow.closePanels();
        wsNow.closeWindow();
        return;
      }
      if (review.plan.tap(x, y)) return;
      if (progress.handleTap(x, y)) return;
      if (topoTools.handleTap(x, y)) return;
      if (topo.handleTap(x, y)) return;
      // Un marcador de foto (visible) abre su foto, con la herramienta de selección.
      if (onOpenPhoto && wsNow.filters.fotos && editor.getState().tool === 'select') {
        const marker = editor.photoMarkerAt(x, y, CANVAS_TOUCH_TOLERANCE_PX);
        if (marker) {
          haptic.select();
          onOpenPhoto(marker.id);
          return;
        }
      }
      const before = editor.getState().selectedId;
      void editor.handleTap(x, y, CANVAS_TOUCH_TOLERANCE_PX).then(() => {
        const after = editor.getState().selectedId;
        if (editor.getState().tool === 'select' && after && after !== before) haptic.select();
      });
    },
    [editor, topo.handleTap, topoTools.handleTap, progress.handleTap, review.plan, onOpenPhoto],
  );

  // Propiedades (con edición y borrado) solo donde se edita el modelo: en los
  // demás modos el toque largo solo selecciona y la BPC informa.
  const handleLongPress = useCallback(
    (x: number, y: number) => {
      if (editor.selectAt(x, y, CANVAS_TOUCH_TOLERANCE_PX)) {
        if (editable) setPanelOpen(true);
        return;
      }
      // Sin objeto bajo el dedo: el recinto que lo contiene (nombre, uso, áreas).
      const zone = editor.zoneAt(x, y);
      if (zone?.id) {
        editor.selectZone(zone.id);
        setZoneSheetOpen(true);
      }
    },
    [editor, editable],
  );

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      const hit = editor.selectAt(x, y, CANVAS_TOUCH_TOLERANCE_PX);
      if (hit instanceof Wall) openElevation(hit.id as string);
    },
    [editor, openElevation],
  );

  const handleDragStart = useCallback(
    (x: number, y: number) => editor.beginDrag(x, y, CANVAS_TOUCH_TOLERANCE_PX),
    [editor],
  );
  const handleDragMove = useCallback((x: number, y: number) => editor.updateDrag(x, y), [editor]);
  const handleDragEnd = useCallback((x: number, y: number) => void editor.endDrag(x, y), [editor]);
  const handleDragCancel = useCallback(() => editor.cancelDrag(), [editor]);

  const handleDelete = useCallback(() => {
    const label = editor.selected?.type ?? 'Objeto';
    setPanelOpen(false);
    haptic.destroy();
    void editor.deleteSelected().then(() =>
      toast(`${label} eliminado`, { action: { label: 'Deshacer', onPress: () => void editor.undo() } }),
    );
  }, [editor]);

  // -----------------------------------------------------------------------
  // Panel de propiedades
  // -----------------------------------------------------------------------

  const selected = editor.selected;
  // Mientras se arrastra, el objeto (y sus vanos) se dibujan en la capa viva:
  // la planta no cambia con cada movimiento del dedo.
  const dragging = isDragging(state);
  const displayObjects = useMemo(() => {
    const hidden = draggedIds(state);
    return hidden.size ? editor.scopedObjects.filter((o) => !hidden.has(o.id as string)) : editor.scopedObjects;
  }, [editor, state.objects, dragging, levelInfo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Los handles invitan a arrastrar: solo donde se puede (Levantamiento).
  const handles = useMemo(
    () => (editable && !dragging ? editor.selectedHandles : []),
    [editor, editable, dragging, state.objects, state.selectedId],
  );
  const roomName = useMemo(() => {
    const room = state.objects.find((o) => o.type === 'Room');
    return (room?.properties.name as string | undefined) || undefined;
  }, [state.objects]);
  const canvasScene = useMemo(
    () => ({
      objects: displayObjects,
      selectedId: dragging ? null : state.selectedId,
      handles,
      rooms: state.rooms,
      roomName,
      selectedZoneId: state.selectedZoneId,
      floors: editor.floorViews,
      showNodes: state.tool === 'wall',
      measureTargetId: state.measureTargetId as unknown as string | null,
      photoMarkers: state.photoMarkers,
    }),
    [displayObjects, dragging, state.selectedId, handles, state.rooms, roomName, state.selectedZoneId, state.tool, state.measureTargetId, state.photoMarkers],
  );
  const parentWallLength = useMemo(() => {
    if (!(selected instanceof Door) && !(selected instanceof Window)) return undefined;
    const wall = editor.parentWallOf(selected);
    return wall ? (wall.length as number) : undefined;
  }, [editor, selected, state.objects]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // --- Visibilidad: filtros y capas del FAB de vista ---
  const { filters, layers } = wsState;
  const visibleObjects = useMemo(
    () =>
      displayObjects.filter((o) => {
        if (o instanceof Wall) return filters.muros && (o.isStructural ? layers.estructural : layers.arquitectonico);
        if (o instanceof Column) return filters.columnas && layers.estructural;
        if (o instanceof Door || o instanceof Window) return layers.arquitectonico;
        return true;
      }),
    [displayObjects, filters, layers],
  );
  const underlay = useMemo(
    () => (markersLoaded ? editor.underlayObjects : []),
    [editor, markersLoaded, state.objects, levelInfo],
  );
  const existingIds = useMemo(
    () => (markersLoaded ? editor.existingIds : new Set<string>()),
    [editor, markersLoaded, state.objects, levelInfo],
  );
  const topoGrid = useMemo(
    () => topoTools.gridFor(canvasSize.w, canvasSize.h),
    [topoTools.gridFor, canvasSize, state.transform], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sceneForCanvas = useMemo(
    () => ({
      ...canvasScene,
      underlay,
      existingIds,
      objects: visibleObjects,
      showLabels: filters.cotas,
      photoMarkers: filters.fotos ? canvasScene.photoMarkers : [],
      benchmarks: topo.planBenchmarks,
      selectedBenchmarkId: topo.selectedBenchmark?.id ?? null,
      coordLabels: topo.coordLabels,
      // Topografía no dibuja: los nodos se ven para tocarlos y leer coordenadas.
      showNodes: canvasScene.showNodes || (topo.active && filters.vertices),
      measure: topoTools.overlay,
      coordGrid: topoGrid,
      progressLayers: progress.active ? progress.planLayers : undefined,
      markups: review.active ? review.planMarkups : undefined,
    }),
    [canvasScene, underlay, existingIds, visibleObjects, filters.cotas, filters.fotos, topo.planBenchmarks, topo.selectedBenchmark, topo.coordLabels, topo.active, filters.vertices, topoTools.overlay, topoGrid, progress.active, progress.planLayers, review.active, review.planMarkups],
  );

  // --- Selector de base y tope: qué edita ---
  // Con Muro o Columna activos, los que se van a crear; sin herramienta, el
  // muro o columna seleccionado (confirmar = un paso de deshacer).
  const [selEdit, setSelEdit] = useState<ConstraintEdit | null>(null);
  const selectedVerticalEdit = useMemo((): ConstraintEdit | null => {
    if (!markersLoaded) return null;
    if (selected instanceof Wall) {
      const v = editor.wallVertical(selected);
      return { a: v.start, b: v.end, linked: isUniformWall(v), editing: 'a' };
    }
    if (selected instanceof Column) {
      const e = editor.columnVertical(selected);
      return { a: e, b: e, linked: true, editing: 'a' };
    }
    return null;
  }, [editor, selected, markersLoaded, state.objects]);
  useEffect(() => setSelEdit(null), [state.selectedId, state.objects]);

  const constraintTarget: 'creation' | 'selection' | null =
    !editable
      ? null
      : creationEdit && (wallMethod || isColumnTool)
      ? 'creation'
      : !activeTool && selectedVerticalEdit && (selected instanceof Wall || selected instanceof Column)
        ? 'selection'
        : null;
  const constraintEdit = constraintTarget === 'creation' ? creationEdit : constraintTarget === 'selection' ? (selEdit ?? selectedVerticalEdit) : null;

  const handleConstraintChange = useCallback(
    (next: ConstraintEdit, commit: boolean) => {
      if (constraintTarget === 'creation') {
        setCreationEdit(next);
        return;
      }
      setSelEdit(next);
      if (!commit) return;
      const sel = editor.selected;
      const same = selectedVerticalEdit && sameExtent(next.a, selectedVerticalEdit.a) && sameExtent(next.b, selectedVerticalEdit.b);
      if (same && next.linked === selectedVerticalEdit?.linked) return;
      const done =
        sel instanceof Column
          ? editor.updateSelectedVertical(next.a)
          : editor.updateSelectedVertical({ start: next.a, end: next.linked ? next.a : next.b });
      void done.then((ok) => {
        if (ok) toast('Niveles del elemento actualizados', { kind: 'success', durationMs: 1400 });
        else setSelEdit(null);
      });
    },
    [constraintTarget, editor, selectedVerticalEdit],
  );

  const constraintElement =
    constraintEdit && constraintLevels.length > 0 ? (
      <ConstraintSelector
        levels={constraintLevels}
        edit={constraintEdit}
        kind={isColumnTool || (constraintTarget === 'selection' && selected instanceof Column) ? 'column' : 'wall'}
        canUnlink={constraintTarget === 'selection' ? selected instanceof Wall : wallMethod === 'points'}
        caption={
          constraintTarget === 'selection'
            ? 'Sel.'
            : wallMethod === 'points'
              ? constraintEdit.editing === 'a'
                ? 'Punto 1'
                : 'Punto 2'
              : isColumnTool
                ? 'Col.'
                : 'Muro'
        }
        endNames={
          constraintTarget === 'selection' ? { a: 'Extremo A (inicio)', b: 'Extremo B (fin)' } : { a: 'Punto 1', b: 'Punto 2' }
        }
        onChange={handleConstraintChange}
      />
    ) : null;

  const constraintSummary = (ed: ConstraintEdit | null) =>
    ed
      ? ed.linked || sameExtent(ed.a, ed.b)
        ? describeExtent(constraintLevels, ed.a)
        : `A ${describeExtent(constraintLevels, ed.a)} · B ${describeExtent(constraintLevels, ed.b)}`
      : undefined;

  // --- BPC: contexto, píldoras y acciones ---
  const selectionSummary = useMemo((): SelectionSummary | null => {
    const sel = selected;
    if (topo.active) {
      const b = topo.selectedBenchmark;
      if (b) {
        const pos = topo.positionOf(b);
        return { typeLabel: `Mojón ${b.name}`, detail: pos ? coordinateInline(topo.benchmarkReal(b), pos.p, topo.display) : 'Sin coordenadas', props: {} };
      }
      if (topo.probe) return { typeLabel: 'Vértice', detail: coordinateInline(topo.realOf(topo.probe), topo.probe, topo.display), props: {} };
      if (sel instanceof Wall) {
        return { typeLabel: 'Muro', detail: `Inicio ${coordinateInline(topo.realOf(sel.startPoint), sel.startPoint, topo.display)}`, props: {} };
      }
      if (sel) return { typeLabel: sel.type, props: {} };
    }
    const zone = editor.selectedZone;
    if (!sel && zone) {
      return {
        typeLabel: zone.number !== undefined ? `${zoneCode({ number: zone.number })} ${zone.name ?? ''}` : 'Recinto',
        detail: `neta ${(zone.netArea ?? zone.area).toFixed(2)} m² · P ${(zone.perimeter ?? 0).toFixed(2)} m${zone.use ? ` · ${zone.use}` : ''}`,
        props: {},
      };
    }
    if (!sel) return null;
    const cm = (m: unknown) => Math.round(Number(m) * 100);
    if (sel instanceof Wall) {
      const p = editor.wallProfile(sel);
      const h = Math.max(p.start.top, p.end.top) - Math.min(p.start.base, p.end.base);
      return {
        typeLabel: 'Muro',
        detail: `${Number(sel.length).toFixed(2)} m · h ${h.toFixed(2)} m · ${sel.isStructural ? 'portante' : 'tabique'}`,
        props: { thickness: cm(sel.thickness) },
      };
    }
    if (sel instanceof Column) {
      return { typeLabel: 'Columna', detail: sel.isCircular ? 'circular' : 'rectangular', props: { side: cm(sel.dimensionX) } };
    }
    if (sel instanceof Door) return { typeLabel: 'Puerta', detail: `${Number(sel.width).toFixed(2)} m`, props: { width: cm(sel.width) } };
    if (sel instanceof Window) return { typeLabel: 'Ventana', detail: `${Number(sel.width).toFixed(2)} m`, props: { width: cm(sel.width) } };
    if (sel instanceof Room) {
      return { typeLabel: 'Recinto', detail: state.rooms[0] ? `${state.rooms[0].area.toFixed(2)} m²` : 'abierto', props: {} };
    }
    return { typeLabel: sel.type, props: {} };
  }, [editor, selected, state.rooms, state.selectedZoneId, levelInfo, topo.active, topo.selectedBenchmark, topo.probe, topo.geo, topo.display]);

  const zoomPercent = (state.transform.scale / DEFAULT_SCALE) * 100;
  const activeActivity = progress.state.activities.find((a) => a.id === progress.state.activityId);
  const activeCut = progress.state.cuts.find((c) => c.id === progress.state.cutId);
  const reviewCounts = countByStatus(review.state.items);
  const reviewItems = [`${reviewCounts.open} abierta(s) · ${reviewCounts.resolved} resuelta(s)`];
  const progressItems = [
    activeCut ? `Corte ${activeCut.label || activeCut.date}` : 'Sin corte: créalo en "Actividad y corte"',
    activeActivity ? activeActivity.name : 'Sin actividad',
  ];
  const bpcContext = resolveBpcContext({
    tool: activeTool,
    selection: selectionSummary,
    viewLabel: workModeDef(wsState.workMode).label,
    scaleDenominator: wsState.denominator,
    zoomPercent,
    ...(topo.active && { canvasTitle: 'Topografía', canvasItems: amarreSummary(topo.geo) }),
    ...(progress.active && { canvasTitle: 'Avance', canvasItems: progressItems }),
    ...(review.active && { canvasTitle: 'Revisión', canvasItems: reviewItems }),
  });

  const commitSelectionProp = useCallback(
    async (key: PropKey, valueCm: number) => {
      const sel = editor.selected;
      const m = meters(valueCm / 100);
      if (sel instanceof Wall && key === 'thickness') await editor.updateSelectedProperty('thickness', m);
      else if (sel instanceof Column && key === 'side') {
        await editor.updateSelectedProperty('dimensionX', m);
        if (!sel.isCircular) await editor.updateSelectedProperty('dimensionY', m);
      } else if ((sel instanceof Door || sel instanceof Window) && key === 'width') {
        await editor.updateSelectedProperty('width', m);
      }
    },
    [editor],
  );

  const bpcPills: BpcPill[] =
    bpcContext.kind === 'tool'
      ? (Object.entries(bpcContext.tool.props) as [PropKey, number][]).map(([key, value]) => ({
          key,
          value,
          onCommit: (v) => workspaceStore.getState().setToolProp(key, v),
        }))
      : bpcContext.kind === 'selection' && editable
        ? (Object.entries(bpcContext.selection.props) as [PropKey, number][]).map(([key, value]) => ({
            key,
            value,
            onCommit: (v) => void commitSelectionProp(key, v),
          }))
        : [];

  const bpcActions: BpcAction[] = [];
  if (review.active) {
    if (review.state.canUndo) bpcActions.push({ icon: 'undo-variant', label: 'Deshacer', onPress: () => void review.ctl.undo() });
    if (review.state.canRedo) bpcActions.push({ icon: 'redo-variant', label: 'Rehacer', onPress: () => void review.ctl.redo() });
    if (review.tool) bpcActions.push({ icon: 'palette', label: 'Color', onPress: () => review.ctl.cycleColor() });
    bpcActions.push({ icon: 'format-list-numbered', label: 'Observaciones', onPress: review.openList });
  } else if (progress.active) {
    if (progress.state.canUndo) bpcActions.push({ icon: 'undo-variant', label: 'Deshacer trazo', onPress: () => void progress.ctl.undo() });
    if (progress.state.canRedo) bpcActions.push({ icon: 'redo-variant', label: 'Rehacer trazo', onPress: () => void progress.ctl.redo() });
    bpcActions.push({ icon: 'palette-outline', label: 'Actividad y corte', onPress: () => progress.openSheet('catalog') });
    bpcActions.push({ icon: 'file-chart-outline', label: 'Reporte', onPress: () => progress.openSheet('report') });
  } else if (topoTools.tool) {
    if (topoTools.canUndoPoint) bpcActions.push({ icon: 'undo-variant', label: 'Quitar punto', onPress: topoTools.undoPoint });
    bpcActions.push({ icon: 'restart', label: 'Reiniciar', onPress: topoTools.reset });
  } else if (topo.active) {
    if (topo.picking?.kind === 'place' || topo.picking?.kind === 'stand') {
      bpcActions.push({ icon: 'close-circle-outline', label: 'Cancelar', onPress: topo.cancelPick });
    }
    bpcActions.push({ icon: 'table', label: 'Coordenadas', onPress: topo.openCoords });
    bpcActions.push({ icon: 'map-marker-radius', label: 'Amarre', onPress: topo.openSetup });
  } else if (bpcContext.kind === 'selection' && editor.selectedZone && !selected) {
    bpcActions.push({ icon: 'tune-variant', label: 'Recinto', onPress: () => setZoneSheetOpen(true) });
  } else if (bpcContext.kind === 'selection' && editable) {
    bpcActions.push({ icon: 'tune-variant', label: 'Propiedades', onPress: () => setPanelOpen(true) });
  }
  if (state.tool === 'wall' && state.wallDraft?.start) {
    bpcActions.push({ icon: 'close-circle-outline', label: 'Soltar inicio', onPress: () => editor.clearWallDraft() });
  }
  if (state.tool === 'measure' && state.measureTargetId) {
    bpcActions.push({ icon: 'pencil', label: 'Ingresar medida', onPress: () => setManualMeasureOpen(true) });
  }

  const handleZoom = useCallback(
    (action: ZoomAction) => {
      const { w, h } = canvasSize;
      if (action === 'zoomFit') editor.zoomToFit(w, h);
      else if (action === 'zoomIn') editor.zoomBy(1.25, w, h);
      else if (action === 'zoomOut') editor.zoomBy(0.8, w, h);
      else editor.zoomToSelection(w, h);
    },
    [editor, canvasSize],
  );

  // Una sola historia: deshacer en el alzado deshace también lo del alzado.
  const handleUndo = useCallback(() => void editor.undo().then(() => elevEditor?.load(false)), [editor, elevEditor]);
  const handleRedo = useCallback(() => void editor.redo().then(() => elevEditor?.load(false)), [editor, elevEditor]);
  const handleToolActivated = useCallback(() => editor.select(null), [editor]);
  const wallCount = editor.walls.length;
  // Suma de áreas NETAS de los recintos del nivel (lo que se pisa).
  const areaLabel = state.rooms.length
    ? `${state.rooms.reduce((s, r) => s + (r.netArea ?? r.area), 0).toFixed(2)} m² en ${state.rooms.length} recinto(s)`
    : 'Abierto';
  const fileInfo = useMemo(
    () => ({
      project: projectName,
      projectCode,
      space: roomName ?? 'Espacio',
      operator: operatorName,
      walls: wallCount,
      objects: state.objects.length,
      area: areaLabel,
    }),
    [projectName, projectCode, roomName, operatorName, wallCount, state.objects.length, areaLabel],
  );
  // --- Exportar a IFC (Revit): niveles, fases y antepechos del proyecto ---
  const handleExportIfc = useCallback(
    () =>
      exportRevitIfc(services, {
        roomId,
        projectId,
        projectName,
        spaceName: roomName ?? 'Espacio',
        author: operatorName,
      }),
    [services, projectId, roomId, projectName, operatorName, roomName],
  );

  const menuItems = useMemo((): MainMenuItem[] => {
    const go = (s: MenuScreen) => () => onNavigate?.(s);
    return [
      { section: 'Espacio', icon: 'fit-to-screen-outline', label: 'Encuadrar todo', onPress: () => handleZoom('zoomFit') },
      { icon: 'image-multiple-outline', label: 'Galería de fotos', onPress: go('gallery') },
      ...(onExit ? [{ icon: 'view-grid-outline', label: 'Otros espacios del proyecto', onPress: onExit }] : []),
      { section: 'Exportar', icon: 'file-export-outline', label: 'IFC para Revit', detail: 'Pisos por nivel y restricciones', onPress: () => void handleExportIfc() },
      { icon: 'file-cad', label: 'IFC y DXF del recinto', onPress: go('export') },
      ...(onExitProject ? [{ section: 'Proyecto', icon: 'folder-outline', label: 'Cambiar de proyecto', onPress: onExitProject }] : []),
      { section: 'App', icon: 'account-circle-outline', label: 'Operador', detail: operatorName || undefined, onPress: go('profile') },
      { icon: 'cog-outline', label: 'Ajustes y respaldos', onPress: go('settings') },
    ];
  }, [onExit, onExitProject, onNavigate, handleZoom, handleExportIfc, operatorName]);

  const topoVertices = useMemo(() => uniqueVertices(editor.walls), [editor, state.objects, levelInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Avance: nombres de soportes y planta del reporte ---
  const supportLabel = useCallback(
    (key: string): string => {
      if (key.startsWith('floor:')) {
        const r = state.rooms.find((z) => z.id === key.slice(6));
        return r ? `${r.number !== undefined ? zoneCodeOf({ number: r.number }) + ' ' : ''}${r.name ?? 'Recinto'} · suelo` : 'Suelo';
      }
      const [, wallDbId, side] = key.split(':');
      const i = editor.walls.findIndex((w) => (w.id as string) === wallDbId);
      const w = editor.walls[i];
      const name = (w?.properties.name as string | undefined) ?? `Muro ${i + 1}`;
      return `${name} · cara ${side}`;
    },
    [state.rooms, editor, state.objects], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const progressPlanSvg = useCallback(
    () =>
      planSvg({
        walls: editor.walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
        zones: state.rooms
          .filter((r) => (r.netPolygon?.length ?? 0) >= 3)
          .map((r) => ({ polygon: r.netPolygon!, label: r.name ?? 'Recinto', sublabel: `${(r.netArea ?? r.area).toFixed(2)} m²`, at: r.centroid })),
        layers: progress.planLayers,
      }),
    [editor, state.rooms, progress.planLayers],
  );

  /** Caras de muro con avance pintado, como SVG (para el PDF del reporte). */
  const progressFaceViews = useCallback(() => {
    const keys = new Set(progress.state.marks.filter((m) => m.target.kind === 'wallFace').map((m) => `wall:${(m.target as { wallId: string }).wallId}:${(m.target as { side: string }).side}`));
    const out: { title: string; svg: string }[] = [];
    for (const key of keys) {
      const [, wallDbId, side] = key.split(':');
      const face = progress.supports.get(key);
      const layers = progress.faceLayers(wallDbId, side as 'A' | 'B');
      if (face && layers.length) out.push({ title: `Alzado · ${supportLabel(key)}`, svg: faceSvg(face, side === 'B', [], layers) });
    }
    return out;
  }, [progress, supportLabel]);

  // --- Revisión: nombre y dibujo de cada vista (acta) ---
  const reviewViewName = useCallback(
    (v: ReviewView) => (v.kind === 'plan' ? 'Planta' : supportLabel(`wall:${v.wallId}:${v.side}`)),
    [supportLabel],
  );
  const reviewViewSvg = useCallback(
    (v: ReviewView, items: readonly ReviewItem[]) => {
      if (v.kind === 'plan') {
        return planSvg({
          walls: editor.walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
          zones: state.rooms
            .filter((r) => (r.netPolygon?.length ?? 0) >= 3)
            .map((r) => ({ polygon: r.netPolygon!, label: r.name ?? 'Recinto', at: r.centroid })),
          marks: reviewSvgMarks(items),
        });
      }
      const face = progress.supports.get(`wall:${v.wallId}:${v.side}`);
      return face ? faceSvg(face, v.side === 'B', reviewSvgMarks(items)) : '';
    },
    [editor, state.rooms, progress.supports],
  );

  /** Fotos de las observaciones como data URI JPEG, para incrustarlas en el acta. */
  const reviewPhotoData = useCallback(
    async (ids: readonly string[]) => {
      const out = new Map<string, string>();
      for (const id of ids) {
        try {
          const p = await services.store.readAuditPhoto(id as never);
          if (p?.foto) out.set(id, `data:image/jpeg;base64,${uint8ArrayToBase64(p.foto as Uint8Array)}`);
        } catch {
          // Sin la foto el acta igual sale (dice "Con foto").
        }
      }
      return out;
    },
    [services],
  );

  /** Foto tomada para una observación: se guarda como foto del espacio y se adjunta. */
  const handleReviewPhoto = useCallback(
    async (photo: { base64: string }) => {
      const itemId = review.photoFor;
      review.clearPhotoRequest();
      if (!itemId) return;
      try {
        const saved = await photoFs.savePhoto(photo.base64);
        const existing = await services.store.listAuditPhotos(roomId);
        const bimCode = generateBimCode(
          PHOTO_BIM_CODE_PREFIX,
          existing.map((p) => p.metadata.bimCode).filter((c): c is string => !!c),
        );
        const result = await services.useCases.capturePhoto.execute({
          roomId,
          photoData: base64ToUint8Array(photo.base64),
          filename: saved.filename,
          metadata: { bimCode, notes: 'Revisión' },
        });
        await review.ctl.attachPhoto(itemId, result.photoId as unknown as string);
        toast(`Foto ${bimCode} adjunta`, { kind: 'success' });
      } catch (err: unknown) {
        alertDialog('Error', err instanceof AppError ? err.userMessage : 'No se pudo guardar la foto.');
      }
    },
    [review, photoFs, services, roomId],
  );

  const chromeTop = chromeSpacing.sm;
  const belowBpc = chromeTop + chromeSizes.bpcHeight + chromeSpacing.sm;
  const spaceName = roomName ?? 'Espacio';

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <WorkspaceStatusBar
        project={projectName}
        space={spaceName}
        canUndo={state.canUndo && !state.busy}
        canRedo={state.canRedo && !state.busy}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <View
        style={styles.stage}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasSize((prev) =>
            Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height },
          );
        }}
      >
        <PlanCanvas
          width={canvasSize.w}
          height={canvasSize.h}
          scene={sceneForCanvas}
          transform={state.transform}
          palette={canvasPalette}
          grid={{ show: gridLines || gridDots, lines: gridLines, dots: gridDots }}
          dragEnabled={editable && state.tool === 'select' && !state.busy}
          drawEnabled={(editable && state.tool === 'wall') || progress.drawEnabled || review.drawEnabled}
          sketch={review.active ? review.planSketch : progress.planSketch}
          doubleTapEnabled={state.tool === 'select' && wsState.workMode !== 'topografia'}
          rotationSnaps={topo.rotationSnaps}
          longPressEnabled
          live={live}
          draftThickness={(activeTool?.props?.thickness ?? 15) / 100}
          onTap={handleTap}
          onDoubleTap={handleDoubleTap}
          onLongPress={handleLongPress}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          onDrawBegin={(x, y) =>
            review.drawEnabled ? review.plan.begin(x, y) : progress.drawEnabled ? progress.planDraw.begin(x, y) : editor.drawBegin(x, y)
          }
          onDrawMove={(x, y) =>
            review.drawEnabled ? review.plan.move(x, y) : progress.drawEnabled ? progress.planDraw.move(x, y) : editor.drawMove(x, y)
          }
          onDrawEnd={(x, y) => {
            haptic.commit();
            if (review.drawEnabled) review.plan.end(x, y);
            else if (progress.drawEnabled) progress.planDraw.end(x, y);
            else void editor.drawEnd(x, y);
          }}
          onDrawCancel={() =>
            review.drawEnabled ? review.plan.cancel() : progress.drawEnabled ? progress.planDraw.cancel() : editor.drawCancel()
          }
          onCameraChange={(t) => editor.setTransform(t)}
        />

        {elevWallId && elevEditor ? (
          <ElevationView
            editor={elevEditor}
            width={canvasSize.w}
            height={canvasSize.h}
            levels={projectLevels}
            planWalls={editor.walls.map((w) => ({ id: w.id as string, start: w.startPoint, end: w.endPoint }))}
            levelHandlers={levelHandlers}
            phaseHandlers={phaseHandlers}
            chromeTop={chromeTop}
            progress={progress}
            review={review}
            onClose={closeElevation}
          />
        ) : (
          <>
            <Bpc
              context={bpcContext}
              toolDetail={
                review.tool
                  ? 'Dibuja sobre el plano · el color se cambia en la BPC'
                  : progress.tool
                  ? progressItems.join(' · ')
                  : topoTools.summary
                  ? topoTools.summary.detail
                  : constraintTarget === 'creation'
                    ? constraintSummary(creationEdit)
                    : undefined
              }
              pills={bpcPills}
              actions={bpcActions}
              onExitTool={() => workspaceStore.getState().clearTool()}
              top={chromeTop}
              right={chromeSpacing.lg + chromeSizes.fabView + chromeSpacing.sm}
            />
            <LevelChip top={belowBpc} />
            {projectId ? <RangeSelectors levels={levelHandlers} phases={phaseHandlers} extra={constraintElement} /> : null}
            <FabView top={chromeTop} hasObjects={hasObjects} />
            {cornerOpen ? null : <AxisGizmo
              kind="plan"
              rotation={state.transform.rotation ?? 0}
              northAngle={topo.northAngle}
              bottom={chromeSpacing.xl + chromeSizes.fabCreate + chromeSpacing.md}
              onPress={() => editor.setRotation(0, canvasSize.w / 2, canvasSize.h / 2)}
            />}
            <CornerTools onZoom={handleZoom} />
            {editable && !fabOpen ? (
              <ThumbUndo
                canUndo={state.canUndo && !state.busy}
                canRedo={state.canRedo && !state.busy}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            ) : null}
            <FabCreate onToolActivated={handleToolActivated} />
          </>
        )}

        <ConfigDrawer
          top={0}
          zoomPercent={zoomPercent}
          onZoom={handleZoom}
          info={fileInfo}
          hasObjects={hasObjects}
          modeSection={topo.active && projectId ? <TopographyPanel topo={topo} tools={topoTools} /> : undefined}
        />
        <MainMenu
          top={0}
          title={projectName}
          subtitle={`${spaceName}${projectCode ? ` · ${projectCode}` : ''}`}
          items={menuItems}
        />
      </View>

      {/* --- Panel de propiedades --- */}
      <BottomSheet open={panelOpen} onClose={() => setPanelOpen(false)} heightRatio={0.68}>
          <PropertiesPanel
            object={selected}
            parentWallLength={parentWallLength}
            measurements={measurements}
            busy={state.busy}
            onCommitProperty={(property, value) => void editor.updateSelectedProperty(property, value)}
            onDelete={handleDelete}
            onClose={() => setPanelOpen(false)}
            onOpenElevation={
              selected instanceof Wall
                ? () => {
                    setPanelOpen(false);
                    openElevation(selected.id as string);
                  }
                : undefined
            }
            onMeasure={
              selected instanceof Wall
                ? () => {
                    editor.setTool('measure');
                    setPanelOpen(false);
                  }
                : undefined
            }
            onOpenPhotos={
              onOpenPhotos && selected
                ? () => {
                    setPanelOpen(false);
                    onOpenPhotos(selected.id as string);
                  }
                : undefined
            }
          />
      </BottomSheet>

      {/* --- Recinto: nombre, uso, notas y áreas --- */}
      <BottomSheet open={zoneSheetOpen && !!editor.selectedZone} onClose={() => setZoneSheetOpen(false)} heightRatio={0.6}>
        {editor.selectedZone ? (
          <ZoneSheet
            zone={editor.selectedZone}
            levelName={projectId ? levelInfo.active.name : undefined}
            editable={editable}
            onEdit={(edit) => {
              const id = editor.selectedZone?.id;
              if (id) void editor.editZone(id, edit);
            }}
            floorThickness={(() => {
              const f = editor.selectedZone?.id ? editor.floorOfZone(editor.selectedZone.id) : null;
              return f ? ((f.thickness as number | undefined) ?? 0) : null;
            })()}
            onAddFloor={() => editor.selectedZone?.id && void editor.addFloorToZone(editor.selectedZone.id)}
            onRemoveFloor={() => {
              const id = editor.selectedZone?.id;
              if (!id) return;
              haptic.destroy();
              void editor.removeZoneFloor(id).then(() =>
                toast('Suelo quitado', { action: { label: 'Deshacer', onPress: () => void editor.undo() } }),
              );
            }}
            onFloorThickness={(m) => editor.selectedZone?.id && void editor.setZoneFloorThickness(editor.selectedZone.id, meters(m))}
          />
        ) : null}
      </BottomSheet>

      {projectId ? <TopographySheets topo={topo} vertices={topoVertices} /> : null}
      <ReviewSheets
        review={review}
        projectName={projectName}
        spaceName={spaceName}
        operatorName={operatorName}
        viewName={reviewViewName}
        viewSvg={reviewViewSvg}
        onOpenPhoto={onOpenPhoto}
        photoData={reviewPhotoData}
      />
      {/* --- Foto de una observación --- */}
      <Modal visible={review.photoFor !== null} animationType="slide" onRequestClose={review.clearPhotoRequest}>
        <CameraCaptureView capture={photoCapture} onCapture={handleReviewPhoto} onClose={review.clearPhotoRequest} />
      </Modal>
      <ProgressSheets
        progress={progress}
        projectName={projectName}
        spaceName={spaceName}
        operatorName={operatorName}
        supportLabel={supportLabel}
        planSvg={progressPlanSvg}
        faceViews={progressFaceViews}
      />
      <StakeoutSheet
        open={!!topoTools.stakeTargetGrid}
        target={topoTools.stakeTargetGrid}
        targetName={topoTools.stakeTarget?.label ?? 'punto'}
        crs={topo.geo?.crs ?? 'EPSG:9377'}
        onClose={topoTools.closeStakeout}
      />

      {/* --- Cámara anclada a la planta --- */}
      <Modal
        visible={state.pendingPhotoPoint !== null}
        animationType="slide"
        onRequestClose={() => editor.clearPendingPhotoPoint()}
      >
        <CameraCaptureView
          capture={photoCapture}
          onCapture={handlePhotoCaptured}
          onClose={() => editor.clearPendingPhotoPoint()}
        />
      </Modal>

      {/* --- Medición manual --- */}
      <Modal
        visible={manualMeasureOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setManualMeasureOpen(false)}
      >
        <View style={styles.dialogScrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Medida manual</Text>
            <Text style={styles.dialogBody}>
              Se guardará como medición del muro seleccionado. Útil cuando el láser no alcanza o no hay
              batería.
            </Text>
            <NumberField
              label="Distancia"
              unit="m"
              decimals={3}
              min={0.01}
              max={200}
              value={manualValue}
              onCommit={setManualValue}
            />
            <View style={styles.dialogActions}>
              <ActionButton
                label="Cancelar"
                variant="secondary"
                onPress={() => setManualMeasureOpen(false)}
              />
              <ActionButton
                label="Guardar"
                onPress={async () => {
                  setManualMeasureOpen(false);
                  const average = await editor.captureMeasurement('manual', meters(manualValue));
                  if (average != null) await editor.applyMeasurementToWall(average);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  stage: { flex: 1, overflow: 'hidden' },
  dialogScrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  dialogTitle: { ...type.title, color: colors.text },
  dialogBody: { ...type.body, color: colors.textSecondary },
  dialogActions: { flexDirection: 'row', gap: spacing.sm },
}));

export default SurveyScreen;
