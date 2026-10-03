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

export type PropKey = 'thickness' | 'side' | 'depth' | 'fontSize' | 'width' | 'height' | 'sill';

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
  height: { label: 'Alto', unit: 'cm', min: 30, max: 400, step: 5 },
  sill: { label: 'Antepecho', unit: 'cm', min: 0, max: 300, step: 5 },
};

export type PropValues = Partial<Record<PropKey, number>>;

// ---------------------------------------------------------------------------
// FAB de creación
// ---------------------------------------------------------------------------

export type TopoAction = 'mojon' | 'punto-gps' | 'coordenada';

export type ToolBinding =
  | { readonly kind: 'plan'; readonly tool: EditorTool }
  | { readonly kind: 'elevation'; readonly opening: OpeningType }
  /** Herramientas del modo Topografía (M2): no crean objetos BIM, crean mojones. */
  | { readonly kind: 'topo'; readonly action: TopoAction };

/** Forma de creación de una herramienta (nivel 3 del FAB). */
export interface MethodDef {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

export interface ToolDef {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly props?: PropValues;
  readonly binding?: ToolBinding;
  /** Si tiene más de una, el FAB abre un nivel 3 para elegirla. */
  readonly methods?: readonly MethodDef[];
}

export const WALL_METHODS: readonly MethodDef[] = [
  { id: 'drag', label: 'Arrastre libre', icon: 'gesture-swipe-horizontal' },
  { id: 'points', label: 'Punto a punto', icon: 'vector-polyline' },
];

export const COLUMN_METHODS: readonly MethodDef[] = [
  { id: 'rectangular', label: 'Rectangular', icon: 'square' },
  { id: 'circular', label: 'Circular', icon: 'circle' },
];

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
 * En alzado la foto todavía no se ancla a la cara del muro: la herramienta se
 * ve pero queda deshabilitada (antes salía habilitada con el binding de
 * planta y no hacía nada).
 */
const AUDITORIA_ELEVATION: CategoryDef = {
  ...AUDITORIA,
  tools: [{ id: 'foto', label: 'Foto', icon: 'camera-outline' }],
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
      { id: 'muro', label: 'Muro', icon: 'wall', props: { thickness: 15 }, binding: { kind: 'plan', tool: 'wall' }, methods: WALL_METHODS },
      { id: 'columna', label: 'Columna', icon: 'square', props: { side: 30 }, binding: { kind: 'plan', tool: 'column' }, methods: COLUMN_METHODS },
      { id: 'puerta', label: 'Puerta', icon: 'door', props: { width: 90 }, binding: { kind: 'plan', tool: 'door' } },
      { id: 'ventana', label: 'Ventana', icon: 'window-closed-variant', props: { width: 120 }, binding: { kind: 'plan', tool: 'window' } },
      { id: 'suelo', label: 'Suelo', icon: 'floor-plan', props: { thickness: 10 }, binding: { kind: 'plan', tool: 'floor' } },
    ],
  },
  {
    id: 'estructural',
    label: 'Estructural',
    icon: 'crane',
    tools: [
      { id: 'columna-e', label: 'Columna', icon: 'square', props: { side: 30 }, binding: { kind: 'plan', tool: 'column' }, methods: COLUMN_METHODS },
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
  AUDITORIA_ELEVATION,
];

// ---------------------------------------------------------------------------
// Catálogos del FAB + por modo (las herramientas sin dominio van deshabilitadas
// hasta su fase: M2 Topografía, M3 Avance, M4 Revisión)
// ---------------------------------------------------------------------------

export const CATEGORIES_TOPOGRAPHY: readonly CategoryDef[] = [
  {
    id: 'puntos',
    label: 'Puntos',
    icon: 'map-marker-multiple-outline',
    tools: [
      { id: 'mojon', label: 'Mojón', icon: 'map-marker-star-outline', binding: { kind: 'topo', action: 'mojon' } },
      { id: 'punto-gps', label: 'Punto GPS', icon: 'crosshairs-gps', binding: { kind: 'topo', action: 'punto-gps' } },
      { id: 'coordenada', label: 'Coordenada', icon: 'map-marker-plus-outline', binding: { kind: 'topo', action: 'coordenada' } },
    ],
  },
  {
    id: 'medir',
    label: 'Medir',
    icon: 'ruler',
    tools: [
      { id: 'inverso', label: 'Inverso', icon: 'vector-line' },
      { id: 'area', label: 'Área', icon: 'vector-square' },
      { id: 'replanteo', label: 'Replanteo', icon: 'target' },
    ],
  },
];

export const CATEGORIES_PROGRESS: readonly CategoryDef[] = [
  {
    id: 'avance',
    label: 'Avance',
    icon: 'brush',
    tools: [
      { id: 'pincel', label: 'Pincel', icon: 'brush' },
      { id: 'borrador', label: 'Borrador', icon: 'eraser' },
      { id: 'relleno', label: 'Relleno', icon: 'format-color-fill' },
      { id: 'rectangulo-avance', label: 'Rectángulo', icon: 'rectangle-outline' },
    ],
  },
];

export const CATEGORIES_REVIEW: readonly CategoryDef[] = [
  {
    id: 'marcas',
    label: 'Marcas',
    icon: 'draw',
    tools: [
      { id: 'trazo', label: 'Trazo libre', icon: 'draw' },
      { id: 'flecha', label: 'Flecha', icon: 'arrow-top-right' },
      { id: 'rectangulo-rev', label: 'Rectángulo', icon: 'rectangle-outline' },
      { id: 'texto-rev', label: 'Texto', icon: 'format-text' },
      { id: 'nube', label: 'Nube', icon: 'cloud-outline' },
    ],
  },
];

/** Catálogo del FAB + según el modo y la vista (planta o alzado). */
export function categoriesFor(mode: WorkModeId, view: 'plan' | 'elevation'): readonly CategoryDef[] {
  switch (mode) {
    case 'topografia':
      return CATEGORIES_TOPOGRAPHY;
    case 'avance':
      return CATEGORIES_PROGRESS;
    case 'revision':
      return CATEGORIES_REVIEW;
    default:
      return view === 'plan' ? CATEGORIES_PLAN : CATEGORIES_ELEVATION;
  }
}

/** Filtros del FAB de vista según el modo y la vista. */
export function filtersFor(mode: WorkModeId, view: 'plan' | 'elevation'): readonly OptionDef<FilterId>[] {
  switch (mode) {
    case 'topografia':
      return FILTERS_TOPOGRAPHY;
    case 'avance':
      return FILTERS_PROGRESS;
    case 'revision':
      return FILTERS_REVIEW;
    default:
      return view === 'plan' ? FILTERS_PLAN : FILTERS_ELEVATION;
  }
}

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


export interface OptionDef<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly icon?: string;
}

// ---------------------------------------------------------------------------
// Modos de trabajo (FAB de vista, esquina superior derecha)
// ---------------------------------------------------------------------------
//
// El modo decide QUÉ SE HACE sobre el mismo modelo: levantar, georreferenciar,
// reportar avance o revisar. Todo el cromo es contextual al modo (catálogo del
// FAB +, filtros, BPC, drawer ⋮). Las antiguas "vistas" Estructural y
// Coordinación pasaron a ser capas. Ver docs/14-MODOS-DE-TRABAJO.md.

export type WorkModeId = 'levantamiento' | 'topografia' | 'avance' | 'revision';

export interface WorkModeDef extends OptionDef<WorkModeId> {
  readonly icon: string;
  /** Color del botón del FAB de vista con este modo activo. */
  readonly color: string;
  /** Una línea de ayuda (se muestra al cambiar de modo). */
  readonly hint: string;
  /** Solo existe en planta (Topografía). */
  readonly planOnly?: boolean;
  /** Solo se puede abrir si el espacio tiene objetos (Avance). */
  readonly needsObjects?: boolean;
}

export const WORK_MODES: readonly WorkModeDef[] = [
  { id: 'levantamiento', label: 'Levantamiento', icon: 'pencil-ruler', color: '#FF8F00', hint: 'Levantar muros, vanos y columnas' },
  { id: 'topografia', label: 'Topografía', icon: 'map-marker-radius', color: '#2E7D32', hint: 'Coordenadas reales, mojones y mapa', planOnly: true },
  { id: 'avance', label: 'Avance', icon: 'brush', color: '#1E88E5', hint: 'Pintar avance de obra y cuantificar', needsObjects: true },
  { id: 'revision', label: 'Revisión', icon: 'message-draw', color: '#8E24AA', hint: 'Marcas y comentarios para enviar' },
];

export function workModeDef(id: WorkModeId): WorkModeDef {
  return WORK_MODES.find((m) => m.id === id) ?? WORK_MODES[0];
}

export type ModeBlock = 'planOnly' | 'needsObjects';

/** ¿Se puede entrar al modo? Devuelve el motivo si no. */
export function modeBlock(id: WorkModeId, ctx: { view: 'plan' | 'elevation'; hasObjects: boolean }): ModeBlock | null {
  const def = workModeDef(id);
  if (def.planOnly && ctx.view !== 'plan') return 'planOnly';
  if (def.needsObjects && !ctx.hasObjects) return 'needsObjects';
  return null;
}

export const MODE_BLOCK_MESSAGE: Readonly<Record<ModeBlock, string>> = {
  planOnly: 'Topografía se trabaja en planta',
  needsObjects: 'Avance necesita objetos: levanta primero muros o suelos',
};

export type FilterId =
  | 'muros'
  | 'columnas'
  | 'vanos'
  | 'puertas'
  | 'ventanas'
  | 'vigas'
  | 'cotas'
  | 'fotos'
  // Topografía
  | 'vertices'
  | 'mojones'
  | 'coordenadas'
  | 'cuadricula'
  | 'mapa'
  | 'norte'
  // Avance / Revisión
  | 'actividades'
  | 'cortesAnteriores'
  | 'comentarios'
  | 'resueltos';

export const FILTERS_PLAN: readonly OptionDef<FilterId>[] = [
  { id: 'muros', label: 'Muros' },
  { id: 'columnas', label: 'Columnas' },
  { id: 'cotas', label: 'Cotas' },
  { id: 'fotos', label: 'Fotos' },
];

/** Topografía: qué se rotula y qué se dibuja de fondo. */
export const FILTERS_TOPOGRAPHY: readonly OptionDef<FilterId>[] = [
  { id: 'muros', label: 'Muros' },
  { id: 'columnas', label: 'Columnas' },
  { id: 'vertices', label: 'Vértices' },
  { id: 'mojones', label: 'Mojones' },
  { id: 'coordenadas', label: 'Rótulos de coordenadas' },
  { id: 'cuadricula', label: 'Cuadrícula de coordenadas' },
  { id: 'mapa', label: 'Mapa de fondo' },
  { id: 'norte', label: 'Norte' },
];

export const FILTERS_PROGRESS: readonly OptionDef<FilterId>[] = [
  { id: 'actividades', label: 'Actividades del corte' },
  { id: 'cortesAnteriores', label: 'Cortes anteriores' },
  { id: 'cotas', label: 'Cotas' },
];

export const FILTERS_REVIEW: readonly OptionDef<FilterId>[] = [
  { id: 'comentarios', label: 'Comentarios abiertos' },
  { id: 'resueltos', label: 'Resueltos' },
  { id: 'cotas', label: 'Cotas' },
];

export const FILTERS_ELEVATION: readonly OptionDef<FilterId>[] = [
  { id: 'vanos', label: 'Vanos' },
  { id: 'puertas', label: 'Puertas' },
  { id: 'ventanas', label: 'Ventanas' },
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
