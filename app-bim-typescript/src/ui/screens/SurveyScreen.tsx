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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CANVAS_THEMES } from '../../application/workspace/catalog';
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyScreenProps {
  services: AppServices;
  roomId: RoomId;
  appStore: AppStore;
  /** Abre la vista de elevación del muro indicado (Motor de Elevación). */
  onOpenElevation?: (wallDbId: string) => void;
  /** Abre la galería filtrada por el objeto indicado. */
  onOpenPhotos?: (objectId: string) => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SurveyScreen({
  services,
  roomId,
  appStore,
  onOpenElevation,
  onOpenPhotos,
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

  // --- Tema y rejilla del lienzo (cromo del espacio de trabajo) ---
  const canvasTheme = useStore(workspaceStore, (s) => s.canvasTheme);
  const gridLines = useStore(workspaceStore, (s) => s.grid.lines);
  const gridDots = useStore(workspaceStore, (s) => s.grid.dots);

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
    let cancelled = false;

    (async () => {
      try {
        const draft = await editor.init();
        if (cancelled || !draft) return;

        Alert.alert(
          'Recuperar levantamiento',
          `Se encontró un trazo sin terminar de ${draft.vertices.length} punto(s), ` +
            `guardado el ${draft.savedAt.toLocaleString()}. ¿Deseas continuarlo?`,
          [
            {
              text: 'Descartar',
              style: 'destructive',
              onPress: () => void editor.discardDraft(draft.draftId),
            },
            {
              text: 'Continuar',
              onPress: () => void editor.acceptDraft(draft.draftId, draft.vertices),
            },
          ],
        );
      } catch {
        Alert.alert('Error', 'No se pudo inicializar el levantamiento.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor]);

  // Los avisos del controlador se muestran una vez y se limpian, para que un
  // mismo mensaje no reaparezca en cada re-render.
  useEffect(() => {
    if (!state.notice) return;
    const { kind, message } = state.notice;
    editor.clearNotice();
    toast(message, { kind: kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info' });
  }, [state.notice, editor]);

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
      if (hit instanceof Wall && onOpenElevation) onOpenElevation(hit.id as string);
    },
    [editor, onOpenElevation],
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
  // Detección de recintos
  // -----------------------------------------------------------------------

  const handleDetectRooms = useCallback(() => {
    const suggestions = editor.detectRooms();
    if (suggestions.length === 0) return;

    Alert.alert(
      'Recintos detectados',
      `Se detectaron ${suggestions.length} recinto(s) cerrado(s). ` +
        `El mayor mide ${Number(suggestions[0].area).toFixed(2)} m². ` +
        `Se dibujan en azul sobre el plano; elige uno para adoptarlo como trazo.`,
    );
  }, [editor]);

  const adoptSuggestion = useCallback(
    (suggestion: RoomSuggestion) => void editor.adoptSuggestion(suggestion),
    [editor],
  );

  // -----------------------------------------------------------------------
  // Panel de propiedades
  // -----------------------------------------------------------------------

  const selected = editor.selected;
  const displayObjects = useMemo(() => editor.displayObjects, [editor, state.objects, state.dragPreview]);
  const handles = useMemo(
    () => editor.selectedHandles,
    [editor, state.objects, state.selectedId, state.dragPreview],
  );
  const snapIndicator = useMemo(() => {
    const p = state.dragPreview;
    if (!state.dragSnappedToNode || !(p instanceof Wall) || !state.draggingHandle) return null;
    return state.draggingHandle.kind === 'start' ? p.startPoint : p.endPoint;
  }, [state.dragPreview, state.dragSnappedToNode, state.draggingHandle]);
  const canvasScene = useMemo(
    () => ({
      objects: displayObjects,
      vertices: state.vertices,
      selectedId: state.selectedId,
      handles,
      showGrid: state.gridEnabled,
      gridStyle: { lines: gridLines, dots: gridDots },
      showLabels,
      measureTargetId: state.measureTargetId as unknown as string | null,
      suggestions: state.roomSuggestions,
      photoMarkers: state.photoMarkers,
      snapIndicator,
    }),
    [
      displayObjects, state.vertices, state.selectedId, handles, state.gridEnabled, gridLines, gridDots,
      showLabels, state.measureTargetId, state.roomSuggestions, state.photoMarkers, snapIndicator,
    ],
  );
  const themeLabel = CANVAS_THEMES.find((t) => t.id === canvasTheme)?.label ?? '';
  const cycleTheme = () => {
    const i = CANVAS_THEMES.findIndex((t) => t.id === canvasTheme);
    workspaceStore.getState().setCanvasTheme(CANVAS_THEMES[(i + 1) % CANVAS_THEMES.length].id);
  };
  const parentWallLength = useMemo(() => {
    if (!(selected instanceof Door) && !(selected instanceof Window)) return undefined;
    const wall = editor.parentWallOf(selected);
    return wall ? (wall.length as number) : undefined;
  }, [editor, selected, state.objects]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ToolPalette tool={state.tool} disabled={state.busy} onSelect={(t) => editor.setTool(t)} />

      <QuickBar
        snapEnabled={state.snapEnabled}
        nodeSnapEnabled={state.nodeSnapEnabled}
        gridEnabled={state.gridEnabled}
        labelsEnabled={showLabels}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        busy={state.busy}
        onToggleSnap={(v) => editor.setSnapEnabled(v)}
        onToggleNodeSnap={(v) => editor.setNodeSnapEnabled(v)}
        onToggleGrid={(v) => editor.setGridEnabled(v)}
        onToggleLabels={setShowLabels}
        onUndo={() => void editor.undo()}
        onRedo={() => void editor.redo()}
        onZoomToFit={() => editor.zoomToFit(screenWidth, canvasHeight)}
      >
        <Chip label={`Tema: ${themeLabel}`} active={canvasTheme !== 'claro'} onPress={cycleTheme} hint="Claro, oscuro o alto contraste" />
        <Chip label="Líneas" active={gridLines} onPress={() => workspaceStore.getState().toggleGrid('lines')} hint="Rejilla de líneas" />
        <Chip label="Puntos" active={gridDots} onPress={() => workspaceStore.getState().toggleGrid('dots')} hint="Rejilla de puntos" />
      </QuickBar>

      <PlanCanvas
        width={screenWidth}
        height={canvasHeight}
        scene={canvasScene}
        transform={state.transform}
        palette={CANVAS_PALETTES[canvasTheme]}
        dragEnabled={state.tool === 'select' && !state.busy}
        doubleTapEnabled={state.tool === 'select'}
        longPressEnabled
        dragSnapped={state.dragSnappedToNode}
        onTap={handleTap}
        onDoubleTap={onOpenElevation ? handleDoubleTap : undefined}
        onLongPress={handleLongPress}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        onCameraChange={(t) => editor.setTransform(t)}
      />

      <ScrollView style={styles.lowerPane} contentContainerStyle={styles.lowerPaneContent}>
        {/* Resumen del estado del trazo — el operador necesita saber cuántos
            puntos lleva sin tener que contarlos en el plano. */}
        <View style={styles.statsRow}>
          <Stat label="Puntos" value={String(state.vertices.length)} />
          <Stat label="Muros" value={String(editor.walls.length)} />
          <Stat label="Escala" value={`${Math.round(state.transform.scale)} px/m`} />
        </View>

        {state.roomSuggestions.length > 0 ? (
          <View style={styles.suggestions}>
            <Text style={styles.sectionTitle}>Recintos detectados</Text>
            {state.roomSuggestions.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.suggestionRow}
                onPress={() => adoptSuggestion(s)}
                accessibilityRole="button"
                accessibilityLabel={`Adoptar recinto de ${Number(s.area).toFixed(2)} metros cuadrados`}
              >
                <Text style={styles.suggestionText}>
                  {Number(s.area).toFixed(2)} m² · {s.polygon.length} vértices
                </Text>
                <Text style={styles.suggestionAction}>Adoptar</Text>
              </TouchableOpacity>
            ))}
            <ActionButton
              label="Descartar sugerencias"
              variant="secondary"
              onPress={() => editor.clearRoomSuggestions()}
            />
          </View>
        ) : null}

        {selected ? (
          <TouchableOpacity
            style={styles.selectionBanner}
            onPress={() => setPanelOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir propiedades de la selección"
          >
            <Text style={styles.selectionBannerText}>
              Seleccionado: {selected.type}
              {selected instanceof Wall ? ` · ${Number(selected.length).toFixed(2)} m` : ''}
            </Text>
            <Text style={styles.selectionBannerAction}>Propiedades ›</Text>
          </TouchableOpacity>
        ) : null}

        <BLEStatus
          state={bleState}
          device={bleDevice}
          lastDistance={lastDistance}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onMeasure={() => void handleMeasure()}
        />

        <View style={styles.actionsGrid}>
          <ActionButton
            label="Cerrar Recinto"
            onPress={() => void editor.closeRoom()}
            disabled={state.vertices.length < 3 || state.busy}
          />
          <ActionButton
            label="Detectar recintos"
            variant="secondary"
            onPress={handleDetectRooms}
            disabled={editor.walls.length < 3 || state.busy}
          />
        </View>
        <View style={styles.actionsGrid}>
          <ActionButton
            label="Medida manual"
            variant="secondary"
            onPress={() => setManualMeasureOpen(true)}
            disabled={!state.measureTargetId || state.busy}
          />
          <ActionButton
            label="Propiedades"
            variant="secondary"
            onPress={() => setPanelOpen(true)}
            disabled={!selected}
          />
        </View>
      </ScrollView>

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
              onOpenElevation && selected instanceof Wall
                ? () => {
                    setPanelOpen(false);
                    onOpenElevation(selected.id as string);
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
    </SafeAreaView>
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
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
