// =============================================================================
// appStore.ts — Zustand Store (Estado Global de la App)
// Basado en: gestión-estado-Zustand.md, SurveyLifecycle.md,
//            SurveyInteractionMode.md, SurveyControlPoint.md,
//            SiteCoordinateSystem.md
// =============================================================================
//
// Store único con slices: survey, ble, ui, controlPoints.
// Uso vanilla (sin React hooks) para compatibilidad con tests y lógica pura.
//
// INVARIANTES:
// - Solo un SurveyState a la vez
// - Solo un InteractionMode a la vez
// - CommandStack se resetea en IDLE
// - canvasTransform.scale ∈ [MIN_SCALE, MAX_SCALE]
// =============================================================================

import { createStore } from 'zustand/vanilla';
import {
  Point2D,
  Point3D,
  CanvasTransform,
  Degrees,
  Meters,
  degrees,
} from '../domain/geometry/types';
import { RevitObjectId } from '../domain/objects/base';
import { MIN_SCALE, MAX_SCALE, DEFAULT_SCALE } from '../application/canvas/types';

// ---------------------------------------------------------------------------
// Tipos del estado
// ---------------------------------------------------------------------------

/** Estados del ciclo de vida del levantamiento. */
export type SurveyState = 'idle' | 'creating' | 'editing' | 'recovering' | 'exporting';

/** Modos de interacción dentro de un estado activo. */
export type InteractionMode = 'draw' | 'move' | 'measure' | 'audit';

/** Dispositivo BLE conectado (simplificado para MVP). */
export interface BLEDevice {
  readonly id: string;
  readonly name: string;
}

/** Medición BLE capturada. */
export interface Measurement {
  readonly distance: Meters;
  readonly timestamp: number;
  readonly samples: number;
}

/** Punto de control topográfico (simplificado del dominio). */
export interface ControlPoint {
  readonly id: string;
  readonly name?: string;
  readonly localCoordinates: Point3D;
  readonly capturedAt: Date;
}

/** Sistema de coordenadas de sede. */
export interface SiteCoordSystem {
  readonly origin: Point3D;
  readonly northRotation: Degrees;
}

// ---------------------------------------------------------------------------
// Slices
// ---------------------------------------------------------------------------

export interface SurveySlice {
  currentRoomId: string | null;
  currentState: SurveyState;
  currentMode: InteractionMode;
  commandStackSize: number; // simplificado: solo el count
}

export interface BleSlice {
  bleEnabled: boolean;
  bleDevice: BLEDevice | null;
  lastMeasurement: Measurement | null;
}

export interface UiSlice {
  canvasTransform: CanvasTransform;
  propertyPanelOpen: boolean;
  selectedObjectId: RevitObjectId | null;
  snapAngularEnabled: boolean;
  snapAngularTolerance: Degrees;
}

export interface ControlPointsSlice {
  controlPoints: ControlPoint[];
  siteCoordinateSystem: SiteCoordSystem | null;
}

// ---------------------------------------------------------------------------
// AppState completo
// ---------------------------------------------------------------------------

export interface AppState extends SurveySlice, BleSlice, UiSlice, ControlPointsSlice {
  // --- Survey actions ---
  setRoom: (roomId: string | null) => void;
  setState: (state: SurveyState) => void;
  setMode: (mode: InteractionMode) => void;

  // --- UI actions ---
  updateCanvasTransform: (transform: Partial<CanvasTransform>) => void;
  setPropertyPanelOpen: (open: boolean) => void;
  setSelectedObjectId: (id: RevitObjectId | null) => void;
  setSnapAngularEnabled: (enabled: boolean) => void;
  setSnapAngularTolerance: (tolerance: Degrees) => void;

  // --- BLE actions ---
  setBleEnabled: (enabled: boolean) => void;
  setBleDevice: (device: BLEDevice | null) => void;
  setLastMeasurement: (measurement: Measurement | null) => void;

  // --- Control points actions ---
  addControlPoint: (point: ControlPoint) => void;
  removeControlPoint: (id: string) => void;
  setSiteCoordinateSystem: (system: SiteCoordSystem | null) => void;
}

// ---------------------------------------------------------------------------
// Store creation
// ---------------------------------------------------------------------------

export function createAppStore() {
  return createStore<AppState>((set) => ({
    // --- Survey slice (initial) ---
    currentRoomId: null,
    currentState: 'idle' as SurveyState,
    currentMode: 'draw' as InteractionMode,
    commandStackSize: 0,

    // --- BLE slice (initial) ---
    bleEnabled: false,
    bleDevice: null,
    lastMeasurement: null,

    // --- UI slice (initial) ---
    canvasTransform: { scale: DEFAULT_SCALE, offsetX: 0, offsetY: 0 },
    propertyPanelOpen: false,
    selectedObjectId: null,
    snapAngularEnabled: true,
    snapAngularTolerance: degrees(5),

    // --- Control points slice (initial) ---
    controlPoints: [],
    siteCoordinateSystem: null,

    // --- Survey actions ---
    setRoom: (roomId) =>
      set({ currentRoomId: roomId }),

    setState: (state) =>
      set((prev) => ({
        currentState: state,
        // Resetear commandStack al volver a idle (invariante)
        commandStackSize: state === 'idle' ? 0 : prev.commandStackSize,
        // Resetear mode a draw al cambiar estado (invariante)
        currentMode: 'draw',
      })),

    setMode: (mode) =>
      set({ currentMode: mode }),

    // --- UI actions ---
    updateCanvasTransform: (partial) =>
      set((prev) => {
        const newScale = partial.scale ?? prev.canvasTransform.scale;
        return {
          canvasTransform: {
            scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale)),
            offsetX: partial.offsetX ?? prev.canvasTransform.offsetX,
            offsetY: partial.offsetY ?? prev.canvasTransform.offsetY,
          },
        };
      }),

    setPropertyPanelOpen: (open) =>
      set({ propertyPanelOpen: open }),

    setSelectedObjectId: (id) =>
      set({ selectedObjectId: id }),

    setSnapAngularEnabled: (enabled) =>
      set({ snapAngularEnabled: enabled }),

    setSnapAngularTolerance: (tolerance) =>
      set({ snapAngularTolerance: tolerance }),

    // --- BLE actions ---
    setBleEnabled: (enabled) =>
      set({ bleEnabled: enabled }),

    setBleDevice: (device) =>
      set({ bleDevice: device }),

    setLastMeasurement: (measurement) =>
      set({ lastMeasurement: measurement }),

    // --- Control points actions ---
    addControlPoint: (point) =>
      set((prev) => ({
        controlPoints: [...prev.controlPoints, point],
      })),

    removeControlPoint: (id) =>
      set((prev) => ({
        controlPoints: prev.controlPoints.filter((cp) => cp.id !== id),
      })),

    setSiteCoordinateSystem: (system) =>
      set({ siteCoordinateSystem: system }),
  }));
}

/** Tipo del store (para tipado de suscripciones). */
export type AppStore = ReturnType<typeof createAppStore>;
