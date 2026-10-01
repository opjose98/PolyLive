// =============================================================================
// SurveyScreen.tsx — Editor de planta
// Basado en: Canvas2D-interacción.md, SurveyInteractionMode.md,
//            arquitectura-expo-skia.md
// =============================================================================
//
// QUÉ CAMBIÓ Y POR QUÉ: esta pantalla concentraba estado de React, llamadas a
// UseCases, transformaciones de coordenadas y dibujo, y solo sabía encadenar
// muros con taps. Ahora es una VISTA: suscribe a EditorController, le manda
// intenciones y renderiza su estado. Todo lo que se puede razonar sin pintar
// (qué hace un tap, cómo se compensa el zoom, cómo se sincroniza el trazo con
// lo persistido) vive en el controlador y tiene tests.
//
// SUPERFICIE QUE ESTA PANTALLA EXPONE (antes: solo "muro", "cerrar recinto",
// "deshacer/rehacer" y un botón "Foto" que solo abría un Alert):
//   · 7 herramientas: Seleccionar, Muro, Puerta, Ventana, Columna, Medir, Foto
//   · paneo, pinch-zoom y encuadre automático
//   · panel de propiedades del objeto seleccionado, con edición y borrado
//   · arrastre de handles para mover muros y columnas
//   · detección automática de recintos, con adopción del polígono sugerido
//   · medición BLE y manual PERSISTIDAS, y aplicables como longitud del muro
//   · toggles de snap angular, snap a nodos, rejilla y cotas
//   · fotos de campo ancladas a un punto de la planta (SPDS), con código BIM
//     y geolocalización cuando hay señal
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';

import { PlanCanvas } from '../canvas/PlanCanvas';
import { BottomSheet, toast } from '../primitives';
import { sizes } from '../design/tokens';
import { CANVAS_PALETTES } from '../design/canvasThemes';
import { haptic } from '../design/haptics';
import { workspaceStore } from '../../state/workspaceStore';
import { CATEGORIES_PLAN, VIEWS_PLAN, ZoomAction, findTool, PropKey } from '../../application/workspace/catalog';
import { resolveBpcContext, SelectionSummary } from '../../application/workspace/bpcContext';
import { DEFAULT_SCALE } from '../../application/canvas/types';
import { useShallow } from 'zustand/react/shallow';
import { Column } from '../../domain/objects/column';
import { Room } from '../../domain/objects/room';
import { WorkspaceStatusBar } from '../workspace/WorkspaceStatusBar';
import { Bpc, BpcAction, BpcPill } from '../workspace/Bpc';
import { FabCreate } from '../workspace/FabCreate';
import { FabView } from '../workspace/FabView';
import { CornerTools } from '../workspace/CornerTools';
import { LevelChip } from '../workspace/LevelChip';
import { ConfigDrawer } from '../workspace/ConfigDrawer';
import { MainMenu } from '../workspace/MainMenu';
import { RangeEditHandlers, RangeSelectors } from '../workspace/RangeSelector';
import { itemAt, RangeState } from '../../application/workspace/rangeModel';
import { MarkerKind, ProjectMarker } from '../../domain/objects/marker';
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
import { saveTextToUserFolder } from '../../native/export/saveToUserFolder';
import { ElevationEditor } from '../../application/elevation/ElevationEditor';
import { ElevationView } from './ElevationView';
import type { CanvasTransform } from '../../domain/geometry/types';
import { ValidationError } from '../../application/use-cases/types';
import { sizes as chromeSizes, spacing as chromeSpacing } from '../design/tokens';
import { useStore } from 'zustand';
import { CameraCaptureView } from '../components/CameraCaptureView';
import { ExpoPhotoCapture } from '../../native/camera/ExpoPhotoCapture';
import { ExpoFileSystem } from '../../native/filesystem/ExpoFileSystem';
import { ExpoGpsProvider } from '../../native/location/ExpoGpsProvider';
import { base64ToUint8Array } from '../../shared/encoding/base64';
import { PHOTO_BIM_CODE_PREFIX } from '../../domain/objects/audit-photo';
import { generateBimCode } from '../../domain/objects/project';
import { ToolPalette, QuickBar, ActionButton, Chip } from '../components/ToolPalette';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { BLEStatus } from '../components/BLEStatus';
import { NumberField } from '../components/fields';
import {
  HuepaDeviceManager,
  type ConnectionState,
  type BLEDevice,
} from '../../native/ble/HuepaDeviceManager';
import { AppServices } from '../../application/AppServices';
import { EditorController, EditorState } from '../../application/editor/EditorController';
import type { RoomSuggestion } from '../../application/use-cases/DetectRoomsUseCase';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Measurement } from '../../domain/objects/measurement';
import { RoomId, revitObjectId, wallId } from '../../domain/objects/base';
import { AppError } from '../../shared/errors/AppError';
import { meters } from '../../domain/geometry/types';
import type { AppStore } from '../../state/appStore';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

const CANVAS_TOUCH_TOLERANCE_PX = sizes.canvasTouchTolerance;

/** El medidor láser queda para una versión posterior; la lógica BLE se conserva. */
const BLE_ENABLED = false;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyScreenProps {
  services: AppServices;
  roomId: RoomId;
  appStore: AppStore;
  /** Abre la galería filtrada por el objeto indicado. */
  onOpenPhotos?: (objectId: string) => void;
  /** Proyecto al que pertenece el espacio: define sus niveles y fases. */
  projectId?: string;
  projectName?: string;
  projectCode?: string;
  operatorName?: string;
  /** Salir del espacio (volver a la lista de espacios del proyecto). */
  onExit?: () => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SurveyScreen({
  services,
  roomId,
  appStore,
  onOpenPhotos,
  projectId,
  projectName = 'Proyecto',
  projectCode = '',
  operatorName = '',
  onExit,
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
  const [showLabels, setShowLabels] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [manualMeasureOpen, setManualMeasureOpen] = useState(false);
  const [manualValue, setManualValue] = useState(3);
  const [measurements, setMeasurements] = useState<readonly Measurement[]>([]);

  // --- Cromo del espacio de trabajo (FABs, BPC, herramientas de esquina) ---
  const wsState = useStore(
    workspaceStore,
    useShallow((s) => ({
      canvasTheme: s.canvasTheme,
      gridLines: s.grid.lines,
      gridDots: s.grid.dots,
      snapNode: s.snap.node,
      snapAngle: s.snap.angle,
      activeTool: s.activeTool,
      view: s.view,
      filters: s.filters,
      layers: s.layers,
      denominator: s.scale.denominator,
    })),
  );
  const { canvasTheme, gridLines, gridDots } = wsState;

  // El lienzo ocupa todo el alto disponible; se mide al montar.
  const [canvasSize, setCanvasSize] = useState({ w: screenWidth, h: canvasHeight });

  // --- Captura de foto anclada a la planta (SPDS) ---
  const [photoCapture] = useState(() => new ExpoPhotoCapture());
  const [photoFs] = useState(() => new ExpoFileSystem());
  const [gps] = useState(() => new ExpoGpsProvider());

  // --- BLE: un manager por pantalla, conectado al store compartido ---
  const [huepa] = useState(() => new HuepaDeviceManager({ useMock: false }));
  const [bleState, setBleState] = useState<ConnectionState>('disconnected');
  const [bleDevice, setBleDevice] = useState<BLEDevice | null>(null);
  const [lastDistance, setLastDistance] = useState<number | undefined>();

  // -----------------------------------------------------------------------
  // Suscripción al controlador
  // -----------------------------------------------------------------------

  useEffect(() => editor.subscribe(setState), [editor]);

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
  useEffect(() => editor.setGridEnabled(gridLines || gridDots), [editor, gridLines, gridDots]);

  const activeTool = wsState.activeTool;
  useEffect(() => {
    if (!activeTool) {
      if (editor.getState().tool !== 'select') editor.setTool('select');
      return;
    }
    const binding = findTool(CATEGORIES_PLAN, activeTool.categoryId, activeTool.toolId)?.tool.binding;
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
      ...(p.thickness !== undefined && { wallThickness: cm(p.thickness)! }),
      ...(p.side !== undefined && { columnDiameter: cm(p.side)! }),
      ...(p.width !== undefined && activeTool?.toolId === 'puerta' && { doorWidth: cm(p.width)! }),
      ...(p.width !== undefined && activeTool?.toolId === 'ventana' && { windowWidth: cm(p.width)! }),
    });
  }, [editor, activeTool]);

  // --- Niveles y fases del proyecto (selectores de rango) ---
  const levelsState = useStore(workspaceStore, (s) => s.levels);
  const phasesState = useStore(workspaceStore, (s) => s.phases);
  const [markersLoaded, setMarkersLoaded] = useState(false);

  const loadMarkers = useCallback(async () => {
    if (!projectId) return;
    const toItem = (m: ProjectMarker) => ({ id: m.id, name: m.name, value: m.value, base: m.isBase });
    const [lv, ph] = await Promise.all([
      services.markers.list(projectId, 'level'),
      services.markers.list(projectId, 'phase'),
    ]);
    const ws = workspaceStore.getState();
    ws.setRangeItems('levels', lv.map(toItem));
    ws.setRangeItems('phases', ph.map(toItem));
    setMarkersLoaded(true);
  }, [services, projectId]);

  useEffect(() => {
    loadMarkers().catch(() => toast('No se pudieron leer los niveles del proyecto.', { kind: 'error' }));
  }, [loadMarkers]);

  // Selector de la VISTA: el nivel activo es la planta que se ve y se edita;
  // [inferior, superior], lo que se calca debajo. A qué niveles se atan los
  // muros y columnas lo decide su propio selector (base/tope), más abajo.
  const levelInfo = useMemo(() => {
    const finite = (st: RangeState) => st.items.filter((it) => Number.isFinite(it.value));
    const nivel = itemAt(levelsState, 'nivel');
    const sup = itemAt(levelsState, 'superior');
    const inf = itemAt(levelsState, 'inferior');
    return { finite: finite(levelsState), nivel, sup, inf, phases: finite(phasesState), fase: itemAt(phasesState, 'nivel') };
  }, [levelsState, phasesState]);

  useEffect(() => {
    if (!markersLoaded) return;
    const { finite, nivel, sup, inf, phases, fase } = levelInfo;
    editor.setScope(
      {
        active: nivel.id,
        base: finite.find((i) => i.base)?.id ?? nivel.id,
        all: new Set(finite.map((i) => i.id)),
        underlay: new Set(finite.filter((i) => i.id !== nivel.id && i.value >= inf.value && i.value <= sup.value).map((i) => i.id)),
        elevations: new Map(finite.map((i) => [i.id, i.value] as [string, number])),
      },
      {
        active: fase.id,
        base: phases.find((i) => i.base)?.id ?? fase.id,
        all: new Set(phases.map((i) => i.id)),
        order: new Map(phases.map((i) => [i.id, i.value] as [string, number])),
      },
    );
  }, [editor, markersLoaded, levelInfo]);

  // --- Selector de base y tope (muros y columnas) ---
  const constraintLevels = useMemo<ConstraintLevel[]>(
    () => sortLevels(levelInfo.finite.map((i) => ({ id: i.id, name: i.name, value: i.value }))),
    [levelInfo.finite],
  );
  const levelsKey = constraintLevels.map((l) => `${l.id}:${l.value}`).join('|');
  const unconnectedDefault = DEFAULT_EDITOR_DEFAULTS.wallHeight as number;
  const [creationEdit, setCreationEdit] = useState<ConstraintEdit | null>(null);

  // Por defecto siempre desde el nivel en que se está trabajando hasta el de
  // arriba; cambiar de planta (o la lista de niveles) lo reinicia.
  useEffect(() => {
    if (!markersLoaded || constraintLevels.length === 0) return;
    const e = defaultExtent(constraintLevels, levelInfo.nivel.id, unconnectedDefault);
    setCreationEdit({ a: e, b: e, linked: true, editing: 'a' });
  }, [markersLoaded, levelInfo.nivel.id, levelsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const makeMarkerHandlers = useCallback(
    (kind: MarkerKind, label: string): RangeEditHandlers => ({
      onAdd: () => {
        if (!projectId) return;
        void services.markers.add(projectId, kind, label).then(() => {
          haptic.commit();
          return loadMarkers();
        });
      },
      onRemove: (id) => {
        void services.markers.remove(id).then((ok) => {
          if (ok) toast(`${label} eliminado: lo que tenía pasa a la base`, { kind: 'info' });
          return loadMarkers();
        });
      },
      onRename: (id, name) => void services.markers.rename(id, name).then(loadMarkers),
      onSetValue: async (id, value) => {
        const r = await services.markers.setValue(id, value);
        if (r.ok) {
          await loadMarkers();
          return null;
        }
        return r.reason === 'not-found' ? 'invalid' : r.reason;
      },
    }),
    [services, projectId, loadMarkers],
  );
  const levelHandlers = useMemo(() => makeMarkerHandlers('level', 'Nivel'), [makeMarkerHandlers]);
  const phaseHandlers = useMemo(() => makeMarkerHandlers('phase', 'Fase'), [makeMarkerHandlers]);

  // --- Alzado (F4): vive encima de la planta, que queda intacta debajo ---
  const [elevWallId, setElevWallId] = useState<string | null>(null);
  const planCamera = useRef<CanvasTransform | null>(null);
  const projectLevels = useMemo<ProjectMarker[]>(
    () =>
      levelInfo.finite.map((i) => ({
        id: i.id,
        projectId: projectId ?? '',
        kind: 'level' as const,
        name: i.name,
        value: i.value,
        isBase: !!i.base,
      })),
    [levelInfo.finite, projectId],
  );
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
      setTimeout(() => setElevWallId(wallDbId), 280);
    },
    [editor, canvasSize, elevWallId],
  );
  const closeElevation = useCallback(() => {
    setElevWallId(null);
    workspaceStore.getState().setMode('plan');
    if (planCamera.current) editor.setTransform(planCamera.current);
    planCamera.current = null;
    // Lo hecho en el alzado (puertas, ventanas, alturas) se ve al volver.
    void editor.reload();
  }, [editor]);

  // Reflejar la selección y la vista en el store global. GAP CERRADO: el
  // `uiSlice` de appStore (selectedObjectId, propertyPanelOpen, canvasTransform,
  // snapAngularEnabled) existía desde el principio y NINGÚN componente lo
  // escribía — era estado muerto.
  useEffect(() => {
    const store = appStore.getState();
    store.setSelectedObjectId(state.selectedId);
    store.setPropertyPanelOpen(panelOpen);
    store.updateCanvasTransform(state.transform);
    store.setSnapAngularEnabled(state.snapEnabled);
    store.setMode(state.tool === 'select' ? 'move' : state.tool === 'measure' ? 'measure' : 'draw');
  }, [appStore, state.selectedId, state.transform, state.snapEnabled, state.tool, panelOpen]);

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
        Alert.alert(
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
      const before = editor.getState().selectedId;
      void editor.handleTap(x, y, CANVAS_TOUCH_TOLERANCE_PX).then(() => {
        const after = editor.getState().selectedId;
        if (editor.getState().tool === 'select' && after && after !== before) haptic.select();
      });
    },
    [editor],
  );

  const handleLongPress = useCallback(
    (x: number, y: number) => {
      if (editor.selectAt(x, y, CANVAS_TOUCH_TOLERANCE_PX)) setPanelOpen(true);
    },
    [editor],
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
  // BLE
  // -----------------------------------------------------------------------

  const handleConnect = useCallback(async () => {
    try {
      setBleState('scanning');
      const devices = await huepa.scan();
      if (devices.length === 0) {
        setBleState('disconnected');
        Alert.alert('Sin dispositivo', 'No se encontró un dispositivo Huepa.');
        return;
      }
      setBleState('connecting');
      await huepa.connect(devices[0].id);
      setBleState('connected');
      const device = huepa.getConnectedDevice();
      setBleDevice(device);
      appStore.getState().setBleEnabled(true);
      if (device) appStore.getState().setBleDevice({ id: device.id, name: device.name });
    } catch (error: any) {
      setBleState('disconnected');
      Alert.alert('Error BLE', error?.message ?? 'No se pudo conectar.');
    }
  }, [huepa, appStore]);

  const handleDisconnect = useCallback(async () => {
    await huepa.disconnect();
    setBleState('disconnected');
    setBleDevice(null);
    appStore.getState().setBleEnabled(false);
    appStore.getState().setBleDevice(null);
  }, [huepa, appStore]);

  /**
   * Mide con el láser y PERSISTE el resultado contra el muro destino.
   *
   * GAP CERRADO: antes esto solo pintaba el número y lo guardaba en el store de
   * Zustand. Nada llegaba a la tabla `measurements`: la medición se perdía al
   * cerrar la app, aunque CaptureMeasurementUseCase existía desde el principio.
   */
  const handleMeasure = useCallback(async () => {
    if (!state.measureTargetId) {
      Alert.alert(
        'Elige el muro',
        'Selecciona la herramienta Medir y toca el muro que vas a medir con el Huepa.',
      );
      return;
    }

    try {
      setBleState('measuring');
      const result = await huepa.measure();
      setLastDistance(result.distance);
      setBleState('connected');
      appStore.getState().setLastMeasurement({
        distance: meters(result.distance),
        timestamp: result.timestamp,
        samples: result.samples.length,
      });

      // Las 7 muestras ya vienen en la ráfaga: se le pasan al UseCase para que
      // no vuelva a pedir 7 ráfagas más (49 disparos del láser).
      const average = await editor.captureMeasurement('ble', undefined, result.samples);
      if (average == null) return;

      Alert.alert(
        'Medición guardada',
        `${Number(average).toFixed(3)} m. ¿Aplicarla como longitud del muro?`,
        [
          { text: 'Solo guardar', style: 'cancel' },
          { text: 'Aplicar al muro', onPress: () => void editor.applyMeasurementToWall(average) },
        ],
      );
    } catch (error: any) {
      setBleState('connected');
      Alert.alert('Error medición', error?.message ?? 'La medición falló.');
    }
  }, [huepa, appStore, editor, state.measureTargetId]);

  // -----------------------------------------------------------------------
  // Panel de propiedades
  // -----------------------------------------------------------------------

  const selected = editor.selected;
  const displayObjects = useMemo(() => editor.displayObjects, [editor, state.objects, state.dragPreview]);
  const handles = useMemo(
    () => editor.selectedHandles,
    [editor, state.objects, state.selectedId, state.dragPreview],
  );
  const roomName = useMemo(() => {
    const room = state.objects.find((o) => o.type === 'Room');
    return (room?.properties.name as string | undefined) || undefined;
  }, [state.objects]);
  const snapIndicator = useMemo(() => {
    const p = state.dragPreview;
    if (!state.dragSnappedToNode || !(p instanceof Wall) || !state.draggingHandle) return null;
    return state.draggingHandle.kind === 'start' ? p.startPoint : p.endPoint;
  }, [state.dragPreview, state.dragSnappedToNode, state.draggingHandle]);
  const canvasScene = useMemo(
    () => ({
      objects: displayObjects,
      selectedId: state.selectedId,
      handles,
      showLabels,
      rooms: state.rooms,
      roomName,
      wallDraft: state.wallDraft,
      draftThickness: 0.15,
      showNodes: state.tool === 'wall',
      measureTargetId: state.measureTargetId as unknown as string | null,
      photoMarkers: state.photoMarkers,
      snapIndicator,
    }),
    [
      displayObjects, state.selectedId, handles, showLabels, state.rooms, roomName, state.wallDraft,
      state.tool, state.measureTargetId, state.photoMarkers, snapIndicator,
    ],
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
  const sceneForCanvas = useMemo(
    () => ({
      ...canvasScene,
      underlay,
      existingIds,
      objects: visibleObjects,
      showLabels: filters.cotas,
      photoMarkers: filters.fotos ? canvasScene.photoMarkers : [],
    }),
    [canvasScene, underlay, existingIds, visibleObjects, filters.cotas, filters.fotos],
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
    creationEdit && (wallMethod || isColumnTool)
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
  }, [editor, selected, state.rooms, levelInfo]);

  const zoomPercent = (state.transform.scale / DEFAULT_SCALE) * 100;
  const bpcContext = resolveBpcContext({
    tool: activeTool,
    selection: selectionSummary,
    viewLabel: VIEWS_PLAN.find((v) => v.id === wsState.view)?.label ?? '',
    scaleDenominator: wsState.denominator,
    zoomPercent,
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
      : bpcContext.kind === 'selection'
        ? (Object.entries(bpcContext.selection.props) as [PropKey, number][]).map(([key, value]) => ({
            key,
            value,
            onCommit: (v) => void commitSelectionProp(key, v),
          }))
        : [];

  const bpcActions: BpcAction[] = [];
  if (bpcContext.kind === 'selection') {
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
  const areaLabel = state.rooms[0] ? `${state.rooms[0].area.toFixed(2)} m²` : 'Abierto';
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
  const handleExportIfc = useCallback(async () => {
    toast('Generando IFC…', { kind: 'info', durationMs: 1200 });
    try {
      const [lv, ph, elevs] = await Promise.all([
        projectId ? services.markers.list(projectId, 'level') : Promise.resolve([] as ProjectMarker[]),
        projectId ? services.markers.list(projectId, 'phase') : Promise.resolve([] as ProjectMarker[]),
        services.elevations.listElevations(roomId),
      ]);
      const sills = new Map<string, number>();
      for (const e of elevs) for (const o of e.openings) if (o.vanoId) sills.set(o.vanoId, o.sillHeight);
      const out = await services.useCases.exportRoomIfc.execute({
        roomId,
        levels: lv.map((m) => ({ id: m.id, name: m.name, elevation: m.value, isBase: m.isBase })),
        phaseNames: new Map(ph.map((m) => [m.id, m.name] as [string, string])),
        openingSills: sills,
        projectName,
        projectKey: projectId,
        author: operatorName,
      });
      const slug = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
      // Hora local (la del operador), no UTC: es la que reconoce al buscar el archivo.
      const d = new Date();
      const two = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
      const saved = await saveTextToUserFolder(`${slug(projectName)}-${slug(roomName ?? 'espacio')}-${stamp}.ifc`, out.ifcContent);
      if (saved.ok) {
        haptic.commit();
        toast(`IFC guardado en ${saved.folderLabel}`, { kind: 'success' });
      } else if (saved.reason !== 'cancelled') {
        console.warn('[export-ifc]', saved);
        toast(
          saved.reason === 'unsupported'
            ? 'Guardar en carpeta solo está disponible en Android'
            : `No se pudo escribir el archivo${saved.detail ? `: ${saved.detail}` : ''}`,
          { kind: 'error' },
        );
      } else {
        toast('Exportación cancelada: no se eligió carpeta', { kind: 'info' });
      }
    } catch (err) {
      console.warn('[export-ifc]', err);
      const msg =
        err instanceof ValidationError
          ? `No se puede exportar: ${err.warnings.map((w) => w.message).join(' · ')}`
          : err instanceof AppError
            ? err.userMessage
            : 'No se pudo exportar el IFC.';
      toast(msg, { kind: 'error' });
    }
  }, [services, projectId, roomId, projectName, operatorName, roomName]);

  const menuItems = useMemo(
    () => [
      ...(onExit ? [{ icon: 'arrow-left', label: 'Volver a los espacios', onPress: onExit }] : []),
      { icon: 'fit-to-screen-outline', label: 'Encuadrar todo', onPress: () => handleZoom('zoomFit') },
      { icon: 'file-export-outline', label: 'Exportar IFC (Revit)', onPress: () => void handleExportIfc() },
    ],
    [onExit, handleZoom, handleExportIfc],
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
          palette={CANVAS_PALETTES[canvasTheme]}
          grid={{ show: gridLines || gridDots, lines: gridLines, dots: gridDots }}
          dragEnabled={state.tool === 'select' && !state.busy}
          drawEnabled={state.tool === 'wall'}
          doubleTapEnabled={state.tool === 'select'}
          longPressEnabled
          snapped={state.dragSnappedToNode || !!state.wallDraft?.snappedToNode}
          onTap={handleTap}
          onDoubleTap={handleDoubleTap}
          onLongPress={handleLongPress}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          onDrawBegin={(x, y) => editor.drawBegin(x, y)}
          onDrawMove={(x, y) => editor.drawMove(x, y)}
          onDrawEnd={(x, y) => {
            haptic.commit();
            void editor.drawEnd(x, y);
          }}
          onDrawCancel={() => editor.drawCancel()}
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
            onClose={closeElevation}
          />
        ) : (
          <>
            <Bpc
              context={bpcContext}
              toolDetail={constraintTarget === 'creation' ? constraintSummary(creationEdit) : undefined}
              pills={bpcPills}
              actions={bpcActions}
              onExitTool={() => workspaceStore.getState().clearTool()}
              top={chromeTop}
              right={chromeSpacing.lg + chromeSizes.fabView + chromeSpacing.sm}
            />
            <LevelChip top={belowBpc} />
            {projectId ? <RangeSelectors levels={levelHandlers} phases={phaseHandlers} extra={constraintElement} /> : null}
            <FabView top={chromeTop} />
            <CornerTools onZoom={handleZoom} />
            <FabCreate onToolActivated={handleToolActivated} />
          </>
        )}

        <ConfigDrawer
          top={0}
          zoomPercent={zoomPercent}
          onZoom={handleZoom}
          info={fileInfo}
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
// Piezas locales
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  lowerPane: {
    flex: 1,
  },
  lowerPaneContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
  },
  statValue: {
    ...typography.heading,
    color: colors.navy,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  suggestions: {
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.selectStroke,
    backgroundColor: colors.surface2,
    gap: spacing.xs,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.touchTargetMin,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  suggestionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  suggestionAction: {
    ...typography.label,
    color: colors.selectStroke,
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.touchTargetMin,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
  },
  selectionBannerText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  selectionBannerAction: {
    ...typography.label,
    color: colors.navy,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  dialogScrim: {
    flex: 1,
    backgroundColor: colors.overlayScrim,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  dialogTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  dialogBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});

export default SurveyScreen;
