// =============================================================================
// catalog.ts — Catálogos declarativos del espacio de trabajo
// Portado de: polylive-mockup/js/config.js y config-alzado.js
// =============================================================================
//
// Todo lo que aparece en un menú (FAB de creación, FAB de vista, filtros,
// capas, herramientas de esquina, temas) vive aquí como DATOS. Los componentes
// solo pintan estos catálogos: agregar una herramienta no toca componentes.
//
// Una herramienta está habilitada solo si tiene `binding` hacia algo que el
// motor ya sabe crear. El resto se muestra atenuado ("próximamente") hasta que
// exista su objeto de dominio.
//
// `icon` es un nombre de MaterialCommunityIcons; la capa de aplicación no
// importa la librería, un test verifica que cada nombre exista.
// =============================================================================

import type { EditorTool } from '../editor/EditorController';
import type { OpeningType } from '../../domain/objects/wall-elevation';

// ---------------------------------------------------------------------------
// Propiedades editables con la píldora de la BPC
// ---------------------------------------------------------------------------

export type PropKey = 'thickness' | 'side' | 'depth' | 'fontSize' | 'width';

export interface PropDef {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const PROPS: Readonly<Record<PropKey, PropDef>> = {
  thickness: { label: 'Espesor', unit: 'cm', min: 5, max: 60, step: 1 },
  side: { label: 'Lado', unit: 'cm', min: 15, max: 100, step: 5 },
  depth: { label: 'Peralte', unit: 'cm', min: 20, max: 120, step: 5 },
  fontSize: { label: 'Tamaño', unit: 'pt', min: 6, max: 48, step: 1 },
  width: { label: 'Ancho', unit: 'cm', min: 40, max: 400, step: 5 },
};

export type PropValues = Partial<Record<PropKey, number>>;

// ---------------------------------------------------------------------------
// FAB de creación
// ---------------------------------------------------------------------------

export type ToolBinding =
  | { readonly kind: 'plan'; readonly tool: EditorTool }
  | { readonly kind: 'elevation'; readonly opening: OpeningType };

export interface ToolDef {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly props?: PropValues;
  readonly binding?: ToolBinding;
}

export interface CategoryDef {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly tools: readonly ToolDef[];
}

export function isToolEnabled(tool: ToolDef): boolean {
  return tool.binding !== undefined;
}

const ACOTADO_PLANTA: CategoryDef = {
  id: 'acotado',
  label: 'Acotado',
  icon: 'ruler',
  tools: [
    { id: 'cota', label: 'Cota', icon: 'arrow-expand-horizontal' },
    { id: 'medicion', label: 'Medición láser', icon: 'laser-pointer', binding: { kind: 'plan', tool: 'measure' } },
    { id: 'texto', label: 'Texto', icon: 'format-text', props: { fontSize: 12 } },
    { id: 'etiqueta', label: 'Etiqueta', icon: 'tag-outline' },
  ],
};

const DIBUJO: CategoryDef = {
  id: 'dibujo',
  label: 'Dibujo',
  icon: 'pencil-outline',
  tools: [
    { id: 'coordenada', label: 'Coordenada', icon: 'map-marker-outline' },
    { id: 'linea', label: 'Línea', icon: 'vector-line' },
    { id: 'poligono', label: 'Polígono', icon: 'vector-polygon' },
  ],
};

const AUDITORIA: CategoryDef = {
  id: 'auditoria',
  label: 'Auditoría',
  icon: 'clipboard-check-outline',
  tools: [{ id: 'foto', label: 'Foto', icon: 'camera-outline', binding: { kind: 'plan', tool: 'photo' } }],
};

/**
 * Puerta y Ventana no están en el mockup de planta, pero el motor ya las crea
 * sobre un muro: quitarlas sería una regresión.
 */
export const CATEGORIES_PLAN: readonly CategoryDef[] = [
  ACOTADO_PLANTA,
  DIBUJO,
  {
    id: 'arquitectonico',
    label: 'Arquitectónico',
    icon: 'office-building-outline',
    tools: [
      { id: 'muro', label: 'Muro', icon: 'wall', props: { thickness: 15 }, binding: { kind: 'plan', tool: 'wall' } },
      { id: 'columna', label: 'Columna', icon: 'square', props: { side: 30 }, binding: { kind: 'plan', tool: 'column' } },
      { id: 'puerta', label: 'Puerta', icon: 'door', props: { width: 90 }, binding: { kind: 'plan', tool: 'door' } },
      { id: 'ventana', label: 'Ventana', icon: 'window-closed-variant', props: { width: 120 }, binding: { kind: 'plan', tool: 'window' } },
      { id: 'suelo', label: 'Suelo', icon: 'floor-plan', props: { thickness: 10 } },
    ],
  },
  {
    id: 'estructural',
    label: 'Estructural',
    icon: 'crane',
    tools: [
      { id: 'columna-e', label: 'Columna', icon: 'square', props: { side: 30 }, binding: { kind: 'plan', tool: 'column' } },
      { id: 'viga', label: 'Viga', icon: 'minus-thick', props: { depth: 40 } },
    ],
  },
  AUDITORIA,
];

export const CATEGORIES_ELEVATION: readonly CategoryDef[] = [
  {
    ...ACOTADO_PLANTA,
    tools: ACOTADO_PLANTA.tools.filter((t) => t.id !== 'medicion'),
  },
  DIBUJO,
  {
    id: 'arquitectonico',
    label: 'Arquitectónico',
    icon: 'office-building-outline',
    tools: [
      { id: 'vano', label: 'Vano', icon: 'rectangle-outline', props: { width: 80 }, binding: { kind: 'elevation', opening: 'opening' } },
      { id: 'puerta', label: 'Puerta', icon: 'door', props: { width: 90 }, binding: { kind: 'elevation', opening: 'door' } },
      { id: 'ventana', label: 'Ventana', icon: 'window-closed-variant', props: { width: 120 }, binding: { kind: 'elevation', opening: 'window' } },
    ],
  },
  {
    id: 'estructural',
    label: 'Estructural',
    icon: 'crane',
    tools: [
      { id: 'viga', label: 'Viga', icon: 'minus-thick', props: { depth: 40 } },
      { id: 'cercha', label: 'Cercha', icon: 'triangle-outline', props: { depth: 60 } },
      { id: 'correa', label: 'Correa', icon: 'view-sequential', props: { depth: 20 } },
    ],
  },
  AUDITORIA,
];

export function findTool(
  categories: readonly CategoryDef[],
  categoryId: string,
  toolId: string,
): { category: CategoryDef; tool: ToolDef } | null {
  const category = categories.find((c) => c.id === categoryId);
  const tool = category?.tools.find((t) => t.id === toolId);
  return category && tool ? { category, tool } : null;
}

// ---------------------------------------------------------------------------
// Vistas, filtros, capas
// ---------------------------------------------------------------------------

export type ViewId = 'estructural' | 'arquitectura' | 'topografia' | 'coordinacion';

export interface OptionDef<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly icon?: string;
}

export const VIEWS_PLAN: readonly OptionDef<ViewId>[] = [
  { id: 'estructural', label: 'Estructural', icon: 'crane' },
  { id: 'arquitectura', label: 'Arquitectura', icon: 'home-outline' },
  { id: 'topografia', label: 'Topografía', icon: 'terrain' },
  { id: 'coordinacion', label: 'Coordinación', icon: 'compass-outline' },
];

export const VIEWS_ELEVATION: readonly OptionDef<ViewId>[] = VIEWS_PLAN.filter((v) => v.id !== 'topografia');

export type FilterId = 'muros' | 'columnas' | 'vanos' | 'puertas' | 'vigas' | 'cotas' | 'fotos';

export const FILTERS_PLAN: readonly OptionDef<FilterId>[] = [
  { id: 'muros', label: 'Muros' },
  { id: 'columnas', label: 'Columnas' },
  { id: 'cotas', label: 'Cotas' },
  { id: 'fotos', label: 'Fotos' },
];

export const FILTERS_ELEVATION: readonly OptionDef<FilterId>[] = [
  { id: 'vanos', label: 'Vanos' },
  { id: 'puertas', label: 'Puertas' },
  { id: 'vigas', label: 'Vigas' },
  { id: 'cotas', label: 'Cotas' },
  { id: 'fotos', label: 'Fotos' },
];

export type LayerId = 'arquitectonico' | 'estructural' | 'topografia' | 'coordinacion';

export const LAYERS: readonly OptionDef<LayerId>[] = [
  { id: 'arquitectonico', label: 'Arquitectónico' },
  { id: 'estructural', label: 'Estructural' },
  { id: 'topografia', label: 'Topografía' },
  { id: 'coordinacion', label: 'Coordinación' },
];

// ---------------------------------------------------------------------------
// Temas del lienzo
// ---------------------------------------------------------------------------

export type CanvasThemeId = 'claro' | 'oscuro' | 'contraste';

export const CANVAS_THEMES: readonly OptionDef<CanvasThemeId>[] = [
  { id: 'claro', label: 'Claro', icon: 'white-balance-sunny' },
  { id: 'oscuro', label: 'Oscuro', icon: 'weather-night' },
  { id: 'contraste', label: 'Alto contraste', icon: 'contrast-box' },
];

// ---------------------------------------------------------------------------
// Herramientas de esquina (FAB inferior izquierdo)
// ---------------------------------------------------------------------------
//
// Orden del arreglo = de ABAJO hacia ARRIBA en pantalla, como en el mockup.

export type ZoomAction = 'zoomFit' | 'zoomIn' | 'zoomOut' | 'zoomSelection';
export type SnapId = 'node' | 'vertex' | 'midpoint' | 'angle';
export type GridId = 'lines' | 'dots' | 'rotation';
export type ScaleToggleId = 'dimensioned' | 'annotative';

export type CornerItem =
  | { readonly type: 'action'; readonly action: ZoomAction; readonly icon: string; readonly title: string }
  | { readonly type: 'snap'; readonly id: SnapId; readonly icon: string; readonly title: string }
  | { readonly type: 'grid'; readonly id: GridId; readonly icon: string; readonly title: string }
  | { readonly type: 'theme'; readonly id: CanvasThemeId; readonly icon: string; readonly title: string }
  | { readonly type: 'scaleToggle'; readonly id: ScaleToggleId; readonly icon: string; readonly title: string }
  | { readonly type: 'scaleInput'; readonly title: string };

export interface CornerRow {
  readonly id: 'zoom' | 'snap' | 'theme' | 'grid' | 'scale';
  readonly label: string;
  readonly icon: string;
  readonly items: readonly CornerItem[];
}

export const CORNER_TOOLS: readonly CornerRow[] = [
  {
    id: 'scale',
    label: 'Escala',
    icon: 'ruler-square-compass',
    items: [
      { type: 'scaleToggle', id: 'dimensioned', icon: 'arrow-expand-horizontal', title: 'Acotado' },
      { type: 'scaleToggle', id: 'annotative', icon: 'format-text', title: 'Anotativa' },
      { type: 'scaleInput', title: 'Escala personalizada' },
    ],
  },
  {
    id: 'grid',
    label: 'Cuadrícula',
    icon: 'grid',
    items: [
      { type: 'grid', id: 'lines', icon: 'grid', title: 'Cuadrícula de líneas' },
      { type: 'grid', id: 'dots', icon: 'dots-grid', title: 'Rejilla de puntos' },
      { type: 'grid', id: 'rotation', icon: 'rotate-right', title: 'Rotación del lienzo' },
    ],
  },
  {
    id: 'theme',
    label: 'Tema',
    icon: 'theme-light-dark',
    items: CANVAS_THEMES.map((t) => ({ type: 'theme' as const, id: t.id, icon: t.icon!, title: t.label })),
  },
  {
    id: 'snap',
    label: 'Snap',
    icon: 'magnet',
    items: [
      { type: 'snap', id: 'node', icon: 'vector-point', title: 'Nodo' },
      { type: 'snap', id: 'vertex', icon: 'vector-square', title: 'Vértice' },
      { type: 'snap', id: 'midpoint', icon: 'format-vertical-align-center', title: 'Punto medio' },
      { type: 'snap', id: 'angle', icon: 'angle-acute', title: 'Ángulo' },
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    icon: 'magnify',
    items: [
      { type: 'action', action: 'zoomFit', icon: 'fit-to-screen-outline', title: 'Encuadre' },
      { type: 'action', action: 'zoomIn', icon: 'magnify-plus-outline', title: 'Acercar' },
      { type: 'action', action: 'zoomOut', icon: 'magnify-minus-outline', title: 'Alejar' },
      { type: 'action', action: 'zoomSelection', icon: 'selection-drag', title: 'Zoom a selección' },
    ],
  },
];
