// =============================================================================
// workspaceStore.ts — Estado del cromo del espacio de trabajo
// Portado de: polylive-mockup/js/core.js (PL.store + PL.ui) y config.js
// =============================================================================
//
// Estado de la interfaz que rodea al lienzo: qué panel está abierto, vista,
// filtros, capas, tema, cuadrícula, snap, escala, herramienta activa y los
// selectores de Nivel/Fase. El MODELO (muros, columnas…) sigue viviendo en
// EditorController; aquí no hay geometría.
//
// REGLA DE PANELES (del mockup): solo un panel abierto a la vez. Excepción:
// una ventana flotante puede declarar un `owner` y entonces convive con ese
// panel (la configuración del selector de niveles no cierra el selector).
// =============================================================================

import { createStore } from 'zustand/vanilla';
import {
  CATEGORIES_ELEVATION,
  CATEGORIES_PLAN,
  CanvasThemeId,
  FilterId,
  GridId,
  LayerId,
  PropKey,
  ScaleToggleId,
  SnapId,
  ViewId,
  findTool,
  isToolEnabled,
} from '../application/workspace/catalog';
import { FAB_CLOSED, FabState, openFabMethods, pickFabCategory, pressFabMain } from '../application/workspace/fabMachine';
import type { ActiveTool } from '../application/workspace/bpcContext';
import {
  RangeSlot,
  RangeState,
  addItem,
  createRangeState,
  moveThumb,
  removeItem,
  renameItem,
  setItemValue,
  toggleSlotActive,
  withItems,
  SetValueResult,
} from '../application/workspace/rangeModel';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type WorkspaceMode = 'plan' | 'elevation';
export type RangeKey = 'levels' | 'phases';

export type PanelKey =
  | 'fabCreate'
  | 'fabView'
  | 'cornerTools'
  | 'range:levels'
  | 'range:phases'
  | 'configDrawer'
  | 'mainMenu';

export interface FloatingWindow {
  readonly id: string;
  /** Panel que puede seguir abierto junto a esta ventana. */
  readonly owner?: PanelKey;
}

export interface WorkspaceData {
  readonly mode: WorkspaceMode;
  readonly currentPanel: PanelKey | null;
  readonly currentWindow: FloatingWindow | null;
  readonly fab: FabState;
  readonly activeTool: ActiveTool | null;
  readonly view: ViewId;
  readonly filters: Readonly<Record<FilterId, boolean>>;
  readonly layers: Readonly<Record<LayerId, boolean>>;
  readonly canvasTheme: CanvasThemeId;
  readonly grid: Readonly<Record<GridId, boolean>>;
  readonly snap: Readonly<Record<SnapId, boolean>>;
  readonly scale: Readonly<Record<ScaleToggleId, boolean>> & { readonly denominator: string };
  readonly levels: RangeState;
  readonly phases: RangeState;
  /** Lado del muro que se ve en alzado. */
  readonly elevationSide: 'A' | 'B';
  readonly minimapExpanded: boolean;
}

export type ToolActivation =
  | { readonly ok: true; readonly tool: ActiveTool }
  | { readonly ok: false; readonly reason: 'disabled' | 'not-found' };

export interface WorkspaceActions {
  setMode(mode: WorkspaceMode): void;

  openPanel(key: PanelKey): void;
  togglePanel(key: PanelKey): void;
  closePanels(): void;
  openWindow(win: FloatingWindow): void;
  toggleWindow(win: FloatingWindow): void;
  closeWindow(): void;
  /** Toque en el fondo del lienzo: cierra todo y suelta la herramienta. */
  resetToCanvas(): void;

  pressFabMain(): void;
  pickFabCategory(categoryId: string): void;
  /**
   * Toque sobre una herramienta del FAB: si tiene formas de creación abre el
   * nivel 3; si no, la activa. Devuelve lo mismo que `activateTool`, o
   * `methods` si quedó esperando la forma.
   */
  pickFabTool(categoryId: string, toolId: string): ToolActivation | { readonly ok: true; readonly pending: 'methods' };
  activateTool(categoryId: string, toolId: string, methodId?: string): ToolActivation;
  clearTool(): void;
  setToolProp(key: PropKey, value: number): void;

  setView(view: ViewId): void;
  toggleFilter(id: FilterId): void;
  toggleLayer(id: LayerId): void;
  setCanvasTheme(theme: CanvasThemeId): void;
  toggleGrid(id: GridId): void;
  toggleSnap(id: SnapId): void;
  toggleScale(id: ScaleToggleId): void;
  setScaleDenominator(value: string): void;

  moveRangeThumb(key: RangeKey, slot: RangeSlot, idx: number): void;
  toggleRangeSlot(key: RangeKey, slot: RangeSlot): void;
  /** Carga los niveles o fases persistidos del proyecto. */
  setRangeItems(key: RangeKey, items: readonly { id: string; name: string; value: number; base: boolean }[]): void;
  addRangeItem(key: RangeKey): void;
  removeRangeItem(key: RangeKey, id: string): void;
  renameRangeItem(key: RangeKey, id: string, name: string): void;
  setRangeItemValue(key: RangeKey, id: string, value: number): SetValueResult;

  toggleElevationSide(): void;
  toggleMinimap(): void;
}

export type WorkspaceState = WorkspaceData & WorkspaceActions;

const RANGE_LABELS: Record<RangeKey, { item: string; base: string }> = {
  levels: { item: 'Nivel', base: 'Nivel 0' },
  phases: { item: 'Fase', base: 'Fase 0' },
};

export function initialWorkspaceData(mode: WorkspaceMode = 'plan'): WorkspaceData {
  return {
    mode,
    currentPanel: null,
    currentWindow: null,
    fab: FAB_CLOSED,
    activeTool: null,
    view: 'arquitectura',
    filters: { muros: true, columnas: true, vanos: true, puertas: true, vigas: true, cotas: true, fotos: true },
    layers: { arquitectonico: true, estructural: true, topografia: false, coordinacion: false },
    canvasTheme: 'claro',
    grid: { lines: true, dots: false, rotation: false },
    snap: { node: true, vertex: false, midpoint: false, angle: true },
    scale: { dimensioned: true, annotative: false, denominator: '50' },
    levels: createRangeState(RANGE_LABELS.levels.base),
    phases: createRangeState(RANGE_LABELS.phases.base),
    elevationSide: 'A',
    minimapExpanded: true,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function createWorkspaceStore(initial: Partial<WorkspaceData> = {}) {
  return createStore<WorkspaceState>((set, get) => {
    /** Estado de paneles tras abrir `key`, cerrando todo lo demás. */
    const panelsOpenedAt = (key: PanelKey | null): Partial<WorkspaceData> => {
      const win = get().currentWindow;
      return {
        currentPanel: key,
        currentWindow: win && key !== null && win.owner === key ? win : null,
        fab: key === 'fabCreate' ? get().fab : FAB_CLOSED,
      };
    };

    const updateRange = (key: RangeKey, fn: (s: RangeState) => RangeState) =>
      set((prev) => ({ [key]: fn(prev[key]) } as Pick<WorkspaceData, RangeKey>));

    return {
      ...initialWorkspaceData(),
      ...initial,

      setMode: (mode) => set({ mode, activeTool: null, ...panelsOpenedAt(null) }),

      openPanel: (key) => set(panelsOpenedAt(key)),
      togglePanel: (key) => set(panelsOpenedAt(get().currentPanel === key ? null : key)),
      closePanels: () => set(panelsOpenedAt(null)),

      openWindow: (win) => {
        const panel = get().currentPanel;
        set({ currentWindow: win, currentPanel: panel && win.owner === panel ? panel : null, fab: FAB_CLOSED });
      },
      toggleWindow: (win) => {
        if (get().currentWindow?.id === win.id) set({ currentWindow: null });
        else get().openWindow(win);
      },
      closeWindow: () => set({ currentWindow: null }),

      resetToCanvas: () => set({ activeTool: null, ...panelsOpenedAt(null) }),

      pressFabMain: () => {
        const next = pressFabMain(get().fab);
        set({ ...panelsOpenedAt(next.level === 'closed' ? null : 'fabCreate'), fab: next });
      },
      pickFabCategory: (categoryId) => set({ fab: pickFabCategory(get().fab, categoryId) }),

      pickFabTool: (categoryId, toolId) => {
        const categories = get().mode === 'plan' ? CATEGORIES_PLAN : CATEGORIES_ELEVATION;
        const found = findTool(categories, categoryId, toolId);
        if (found && isToolEnabled(found.tool) && (found.tool.methods?.length ?? 0) > 1) {
          set({ fab: openFabMethods(get().fab, toolId) });
          return { ok: true, pending: 'methods' } as const;
        }
        return get().activateTool(categoryId, toolId);
      },

      activateTool: (categoryId, toolId, methodId) => {
        const categories = get().mode === 'plan' ? CATEGORIES_PLAN : CATEGORIES_ELEVATION;
        const found = findTool(categories, categoryId, toolId);
        if (!found) return { ok: false, reason: 'not-found' };
        if (!isToolEnabled(found.tool)) return { ok: false, reason: 'disabled' };
        const tool: ActiveTool = {
          categoryId,
          toolId,
          label: found.tool.label,
          categoryLabel: found.category.label,
          props: { ...found.tool.props },
        };
        const method = found.tool.methods?.find((m) => m.id === methodId) ?? found.tool.methods?.[0];
        if (method) Object.assign(tool, { methodId: method.id, methodLabel: method.label });
        set({ activeTool: tool, ...panelsOpenedAt(null) });
        return { ok: true, tool };
      },
      clearTool: () => set({ activeTool: null }),
      setToolProp: (key, value) => {
        const tool = get().activeTool;
        if (tool) set({ activeTool: { ...tool, props: { ...tool.props, [key]: value } } });
      },

      setView: (view) => set({ view }),
      toggleFilter: (id) => set((p) => ({ filters: { ...p.filters, [id]: !p.filters[id] } })),
      toggleLayer: (id) => set((p) => ({ layers: { ...p.layers, [id]: !p.layers[id] } })),
      setCanvasTheme: (canvasTheme) => set({ canvasTheme }),
      toggleGrid: (id) => set((p) => ({ grid: { ...p.grid, [id]: !p.grid[id] } })),
      toggleSnap: (id) => set((p) => ({ snap: { ...p.snap, [id]: !p.snap[id] } })),
      toggleScale: (id) => set((p) => ({ scale: { ...p.scale, [id]: !p.scale[id] } })),
      setScaleDenominator: (value) =>
        set((p) => ({ scale: { ...p.scale, denominator: value.replace(/[^0-9]/g, '') } })),

      moveRangeThumb: (key, slot, idx) => {
        if (get()[key].active[slot]) updateRange(key, (s) => moveThumb(s, slot, idx));
      },
      toggleRangeSlot: (key, slot) => updateRange(key, (s) => toggleSlotActive(s, slot)),
      setRangeItems: (key, items) => updateRange(key, (s) => withItems(s, items)),
      addRangeItem: (key) => updateRange(key, (s) => addItem(s, RANGE_LABELS[key].item, key)),
      removeRangeItem: (key, id) => updateRange(key, (s) => removeItem(s, id)),
      renameRangeItem: (key, id, name) => updateRange(key, (s) => renameItem(s, id, name)),
      setRangeItemValue: (key, id, value) => {
        const result = setItemValue(get()[key], id, value);
        if (result.ok) set({ [key]: result.state } as Pick<WorkspaceData, RangeKey>);
        return result;
      },

      toggleElevationSide: () => set((p) => ({ elevationSide: p.elevationSide === 'A' ? 'B' : 'A' })),
      toggleMinimap: () => set((p) => ({ minimapExpanded: !p.minimapExpanded })),
    };
  });
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

/** Instancia única de la app. Los tests crean las suyas con `createWorkspaceStore`. */
export const workspaceStore = createWorkspaceStore();
