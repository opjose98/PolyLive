// =============================================================================
// EditorCore.ts — Estado, vista, consultas, ciclo de vida y deshacer
// =============================================================================
//
// EditorController se divide en capas (una por responsabilidad) para que ningún
// archivo concentre todo el editor: EditorCore (estado, vista, consultas,
// ciclo de vida, deshacer) → EditorGestures (toque y arrastre) → EditorCreation
// (muros, vanos, suelos, acciones sobre la selección) → EditorController
// (recintos, medición y fotos). La API pública es la de EditorController.
// =============================================================================

// =============================================================================
// EditorController.ts — Cerebro del editor de planta
// Basado en: Canvas2D-interacción.md, SurveyInteractionMode.md,
//            transiciones-máquina.md
// Portado de LevON: features/editor/application/editor_controller.dart
// =============================================================================
//
// POR QUÉ EXISTE: SurveyScreen.tsx concentraba estado de React, llamadas a
// UseCases, transformaciones de coordenadas y dibujo en un solo componente, y
// solo sabía hacer una cosa — encadenar muros con taps. Todo lo demás
// (seleccionar, mover, borrar, editar propiedades, crear vanos y columnas,
// detectar recintos, persistir una medición) existía en `application/` sin
// ninguna ruta desde la UI.
//
// Este controlador es esa ruta, y es lógica PURA: no importa React, ni Skia,
// ni react-native. Recibe puntos en coordenadas de PANTALLA, los traduce,
// decide qué UseCase invocar, y publica un estado inmutable que la vista
// renderiza. Eso lo hace testeable en Node sin montar un árbol de componentes
// — que es lo que permite que el editor tenga tests de verdad y no solo
// "renderiza sin romperse".
//
// MÁQUINA DE HERRAMIENTAS (SurveyInteractionMode.md):
//   select  → tocar selecciona; arrastrar un handle mueve
//   wall    → cada muro es independiente (como en LevON): "arrastre" traza
//             inicio→fin con un gesto; "punto a punto" usa un toque para el
//             inicio y otro para el fin. Se unen entre sí por snap a nodo.
//   door    → tap sobre un muro inserta una puerta en ese punto
//   window  → ídem con una ventana
//   column  → tap coloca una columna libre
//   measure → tap elige el muro destino de la próxima medición BLE
//   photo   → tap fija el punto de captura y la vista abre la cámara
// =============================================================================

import { Point2D, Meters, meters, squareMeters, CanvasTransform } from '../../domain/geometry/types';
import { RevitObjectBase, RevitObjectId, RoomId, WallId, generateId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Floor } from '../../domain/objects/floor';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { distanceToSegment, isPointInPolygon } from '../../domain/geometry/polygon-utils';

import { interiorPoint, netGeometry } from '../../domain/objects/zone';
import { reconcileZones } from '../topology/reconcileZones';
import type { ZoneEdit } from '../../infrastructure/sqlite/ZoneStore';
import { LEVEL_PROP, PHASE_PROP } from '../../domain/objects/marker';
import { LevelElevations, VerticalExtent, WallProfile, WallVertical, columnVerticalOf, hostLevelOf, profileSpans, resolveExtent, resolveWallProfile, wallVerticalOf } from '../../domain/objects/vertical';
import { projectPointToWall, isVanoWithinWall } from '../../domain/geometry/projections';
import { reportFailure } from '../../shared/diagnostics';
import { CanvasManager } from '../canvas/CanvasManager';
import { CanvasPoint, canvasPoint, MIN_SCALE, MAX_SCALE } from '../canvas/types';
import { SnapHandler } from '../canvas/SnapHandler';
import { MiterHandler } from '../canvas/MiterHandler';
import { SelectionService, Handle, touchToleranceMeters } from '../canvas/SelectionService';
import { WallEndsChange } from '../../domain/topology/joints';
import type { AppServices } from '../AppServices';

import type { PhotoFaceAnchor } from '../../domain/objects/audit-photo';

/** Marcador de foto listo para dibujar: lo que el renderer necesita y nada más. */
export interface PhotoMarkerView {
  readonly id: string;
  readonly position: Point2D;
  readonly direction?: number;
  readonly label?: string;
  /** Si se tomó en el alzado: la cara y el punto. */
  readonly face?: PhotoFaceAnchor;
}

// ---------------------------------------------------------------------------
// Herramientas y estado
// ---------------------------------------------------------------------------

export type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'column' | 'floor' | 'opening' | 'measure' | 'photo' | 'split' | 'void';

/** Valores por defecto de los objetos que el editor crea. Editables en Ajustes. */
interface EditorDefaults {
  wallThickness: Meters;
  wallHeight: Meters;
  doorWidth: Meters;
  doorHeight: Meters;
  windowWidth: Meters;
  windowHeight: Meters;
  columnDiameter: Meters;
  columnHeight: Meters;
  floorThickness: Meters;
  /** Ancho de un vano genérico (hueco sin puerta ni ventana) creado en planta. */
  openingWidth: Meters;
}

export const DEFAULT_EDITOR_DEFAULTS: EditorDefaults = {
  wallThickness: meters(0.15),
  wallHeight: meters(2.8),
  doorWidth: meters(0.9),
  doorHeight: meters(2.1),
  windowWidth: meters(1.2),
  windowHeight: meters(1.0),
  columnDiameter: meters(0.4),
  columnHeight: meters(2.8),
  floorThickness: meters(0.1),
  openingWidth: meters(0.8),
};

/** Formas de creación (nivel 3 del FAB): cómo se dibuja cada herramienta. */
type WallCreationMethod = 'drag' | 'points';
type ColumnCreationMethod = 'rectangular' | 'circular';
export interface CreationMethods {
  readonly wall: WallCreationMethod;
  readonly column: ColumnCreationMethod;
  /** Suelo: de un recinto (tocándolo) o libre con una forma (andén, patio). */
  readonly floor: FloorCreationMethod;
  /** Vacío en un suelo: con una forma. */
  readonly void: ShapeMethod;
}

export type ShapeMethod = 'polygon' | 'rect' | 'circle';
type FloorCreationMethod = 'zone' | ShapeMethod;

/** Forma en trazado para un suelo libre o un vacío (no persistida). */
interface ShapeDraft {
  readonly mode: 'floor' | 'void';
  /** Polígono: vértices fijados. Rectángulo y círculo: [primera esquina | centro]. */
  readonly points: readonly Point2D[];
  /** Punto bajo el dedo (esquina opuesta, borde del círculo o siguiente vértice). */
  readonly cursor: Point2D | null;
}

/** Muro en curso de trazado (no persistido). */
interface WallDraft {
  /** Punto fijado. En "punto a punto", `null` hasta el primer toque. */
  readonly start: Point2D | null;
  /** Donde está el dedo ahora, ya con snaps aplicados. */
  readonly end: Point2D | null;
  /** `end` está enganchado a un nodo existente. */
  readonly snappedToNode: boolean;
}

/**
 * Recinto cerrado que forman los muros del nivel activo. `area` y `polygon`
 * son al eje (lo que detecta la topología); `id` y lo demás vienen del
 * recinto PERSISTIDO que le corresponde (ver reconcileZones). Sin `id` solo
 * en el instante previo a reconciliar.
 */
export interface DetectedRoom {
  readonly polygon: readonly Point2D[];
  readonly area: number;
  /** Punto interior donde va el rótulo. */
  readonly centroid: Point2D;
  readonly id?: string;
  readonly number?: number;
  readonly name?: string;
  readonly use?: string;
  readonly notes?: string;
  readonly netPolygon?: readonly Point2D[];
  readonly netArea?: number;
  readonly perimeter?: number;
}

/**
 * Alcance de nivel o fase. Un id desconocido (borrado, o un objeto levantado
 * antes de que existieran niveles) se lee como la base.
 */
interface MarkerScope {
  readonly active: string;
  readonly base: string;
  readonly all: ReadonlySet<string>;
}

export interface LevelScope extends MarkerScope {
  /** Otros niveles que se dibujan como calco atenuado. */
  readonly underlay: ReadonlySet<string>;
  /** Cota de cada nivel: resuelve las restricciones de base y tope. */
  readonly elevations: LevelElevations;
}

/**
 * Altura del plano de corte sobre la cota del nivel (la de Revit por defecto):
 * un muro o una columna aparece en la planta de todo nivel cuyo plano de corte
 * atraviesa, no solo en la de su base.
 */
const CUT_PLANE_HEIGHT = 1.2;

/** Restricciones con que nacen los muros y columnas (el selector de base y tope). */
interface CreationVertical {
  readonly wall: WallVertical | null;
  readonly column: VerticalExtent | null;
}

export interface PhaseScope extends MarkerScope {
  /** Orden de cada fase: lo creado en fases posteriores a la activa no se ve. */
  readonly order: ReadonlyMap<string, number>;
}

/** Longitud mínima de un muro: por debajo es un toque accidental, no un muro (LevON). */
export const MIN_WALL_LENGTH = 0.1;

export interface EditorState {
  readonly tool: EditorTool;
  readonly objects: readonly RevitObjectBase[];
  readonly creation: CreationMethods;
  readonly wallDraft: WallDraft | null;
  readonly shapeDraft: ShapeDraft | null;
  /** Recintos cerrados que forman los muros, recalculados en cada cambio. */
  readonly rooms: readonly DetectedRoom[];
  readonly selectedId: RevitObjectId | null;
  /** Recinto seleccionado (tocar dentro de él sin tocar un objeto). Excluye a `selectedId`. */
  readonly selectedZoneId: string | null;
  /** Muro elegido como destino de la próxima medición (herramienta `measure`). */
  readonly measureTargetId: WallId | null;
  /**
   * Punto donde se va a tomar la próxima foto (herramienta `photo`).
   *
   * El controlador NO abre la cámara: es lógica pura y no conoce `expo-camera`.
   * Deja aquí la intención y la vista reacciona. Eso mantiene el controlador
   * testeable en Node y la cámara donde corresponde.
   */
  readonly pendingPhotoPoint: Point2D | null;
  /** Marcadores de fotos del Recinto, para pintarlos en planta. */
  readonly photoMarkers: readonly PhotoMarkerView[];
  /** Vanos genéricos (huecos del alzado sin puerta ni ventana), para cortar los muros en planta. */
  readonly genericOpenings: readonly { readonly wallId: string; readonly xOffset: number; readonly width: number }[];
  readonly transform: CanvasTransform;
  readonly snapEnabled: boolean;
  readonly nodeSnapEnabled: boolean;
  /** Snap a vértices de recinto (esquinas de la cara interior) y a puntos medios de muro. */
  readonly vertexSnapEnabled: boolean;
  readonly midpointSnapEnabled: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly busy: boolean;
  /** Handle en curso de arrastre, si lo hay. */
  readonly draggingHandle: Handle | null;
  /**
   * Copia del objeto arrastrado en su posición actual (no persistida). La
   * vista la dibuja en lugar del original mientras dura el arrastre, para que
   * el objeto siga al dedo; al soltar se persiste exactamente esta posición.
   */
  readonly dragPreview: RevitObjectBase | null;
  /** El extremo arrastrado está enganchado a un nodo de otro muro. */
  readonly dragSnappedToNode: boolean;
  /**
   * Muros que el arrastre mueve por estar UNIDOS al arrastrado (extremos
   * comunes o encuentros en T), en su posición en vivo. Vacío si no hay.
   */
  readonly dragLinked: readonly RevitObjectBase[];
  /** Último mensaje para la UI (éxito o error). La vista lo muestra y lo limpia. */
  readonly notice: { kind: 'info' | 'error' | 'success'; message: string } | null;
}

type EditorListener = (state: EditorState) => void;

/** Lo común a todo destino de arrastre: plan de uniones (si el muro tiene) y muros arrastrados. */
interface DragJoints {
  readonly plan: WallEndsChange[] | null;
  readonly linked: RevitObjectBase[];
}

export type DragTarget =
  | ({ kind: 'center'; dx: number; dy: number; preview: RevitObjectBase | null; snappedToNode: false } & DragJoints)
  /** Contorno de un suelo libre con un vértice o una arista movidos. */
  | ({ kind: 'outline'; outline: Point2D[]; dx: number; dy: number; preview: RevitObjectBase | null; snappedToNode: boolean } & DragJoints)
  | ({
      kind: 'start' | 'end';
      point: Point2D;
      dx: number;
      dy: number;
      preview: RevitObjectBase | null;
      snappedToNode: boolean;
    } & DragJoints);

/**
 * Copia de un objeto de dominio con algunos campos cambiados, conservando su
 * clase (los getters como `length` o `isStraight` siguen funcionando). Solo
 * para vistas previas: nunca se persiste.
 */
export function cloneWith<T extends object>(obj: T, changes: Partial<T>): T {
  return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj, changes);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export abstract class EditorCore {
  // --- Implementadas en las capas siguientes (EditorCreation, EditorController) ---
  protected abstract loadGenericOpenings(): Promise<EditorState['genericOpenings']>;
  abstract reloadPhotoMarkers(): Promise<void>;
  protected abstract wallTap(screenX: number, screenY: number): Promise<void>;
  protected abstract snapToWallAxis(world: Point2D, angled: Point2D, from: Point2D | undefined, tol: number, walls: readonly Wall[]): Point2D | null;
  protected abstract addVano(kind: 'door' | 'window', world: Point2D, tol: Meters): Promise<void>;
  protected abstract addColumn(world: Point2D): Promise<void>;
  protected abstract addGenericOpening(world: Point2D, tol: Meters): Promise<void>;
  protected abstract addFloor(screenX: number, screenY: number): Promise<void>;
  protected abstract pickMeasureTarget(world: Point2D, tol: Meters): void;
  protected abstract splitTap(world: Point2D, tol: Meters): Promise<void>;
  protected abstract shapeTap(screenX: number, screenY: number, tol: Meters): Promise<void>;

  protected readonly services: AppServices;
  protected readonly roomId: RoomId;
  protected readonly roomObjectId: RevitObjectId;

  protected readonly canvas: CanvasManager;
  protected readonly selection = new SelectionService();
  protected readonly snap: SnapHandler;
  protected readonly miter = new MiterHandler();
  protected defaults: EditorDefaults;

  protected listeners: EditorListener[] = [];
  protected state: EditorState;

  /** Punto mundo donde empezó el arrastre en curso, para calcular el delta. */
  protected dragOrigin: Point2D | null = null;
  protected dragTolerancePx = 22;
  protected wallCommits: Promise<void> = Promise.resolve();
  protected zoneQueue: Promise<unknown> = Promise.resolve();
  protected levelScope: LevelScope | null = null;
  protected phaseScope: PhaseScope | null = null;
  protected creationVertical: CreationVertical = { wall: null, column: null };
  /** Muros por id, recalculado solo cuando cambia la lista de objetos. */
  protected wallIndex: { objects: readonly RevitObjectBase[]; byId: Map<string, Wall> } | null = null;
  /**
   * Objetos y muros del alcance (nivel + fase). Decidir si un muro se ve en la
   * planta activa resuelve sus restricciones y su perfil: hacerlo en cada
   * consulta (la vista pregunta varias veces por render, y cada toque busca
   * nodos) era el costo dominante con muchos muros. Se recalcula solo cuando
   * cambian los objetos o el alcance (ambos se reemplazan, nunca se mutan).
   */
  protected scopeCache: {
    objects: readonly RevitObjectBase[];
    level: LevelScope | null;
    phase: PhaseScope | null;
    scoped: readonly RevitObjectBase[];
    walls: readonly Wall[];
  } | null = null;

  constructor(params: {
    services: AppServices;
    roomId: RoomId;
    roomObjectId: RevitObjectId;
    defaults?: Partial<EditorDefaults>;
    initialTransform?: Partial<CanvasTransform>;
  }) {
    this.services = params.services;
    this.roomId = params.roomId;
    this.roomObjectId = params.roomObjectId;
    this.defaults = { ...DEFAULT_EDITOR_DEFAULTS, ...params.defaults };

    this.canvas = new CanvasManager(params.initialTransform);
    this.snap = new SnapHandler(true);

    this.state = {
      tool: 'wall',
      objects: [],
      creation: { wall: 'drag', column: 'rectangular', floor: 'zone', void: 'rect' },
      wallDraft: null,
      shapeDraft: null,
      rooms: [],
      selectedId: null,
      selectedZoneId: null,
      measureTargetId: null,
      pendingPhotoPoint: null,
      photoMarkers: [],
      genericOpenings: [],
      transform: this.canvas.getTransform(),
      snapEnabled: true,
      nodeSnapEnabled: true,
      vertexSnapEnabled: false,
      midpointSnapEnabled: false,
      canUndo: false,
      canRedo: false,
      busy: false,
      draggingHandle: null,
      dragPreview: null,
      dragSnappedToNode: false,
      dragLinked: [],
      notice: null,
    };
  }

  // -------------------------------------------------------------------------
  // Suscripción
  // -------------------------------------------------------------------------

  getState(): EditorState {
    return this.state;
  }

  subscribe(listener: EditorListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  protected patch(partial: Partial<EditorState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }

  protected notify(kind: 'info' | 'error' | 'success', message: string): void {
    this.patch({ notice: { kind, message } });
  }

  /** La vista llama a esto tras mostrar el aviso, para que no se repita. */
  clearNotice(): void {
    if (this.state.notice) this.patch({ notice: null });
  }

  protected fail(err: unknown, fallback: string): void {
    // Al registro también: "Enviar diagnóstico" debe traer la causa, no solo el aviso que se vio.
    this.notify('error', reportFailure('editor', err, fallback));
  }

  // -------------------------------------------------------------------------
  // Consultas derivadas — la vista las usa para pintar y para el panel
  // -------------------------------------------------------------------------

  /** Muros del nivel y la fase activos: los únicos que se tocan, enganchan o miden. */
  get walls(): readonly Wall[] {
    return this.scope().walls;
  }

  /** Objetos del nivel activo, sin lo creado en fases posteriores a la activa. */
  get scopedObjects(): readonly RevitObjectBase[] {
    return this.scope().scoped;
  }

  /**
   * Lo que se toca para seleccionar: todo menos el Room contenedor. Tocar
   * dentro de un espacio cerrado selecciona su RECINTO (con identidad), no el
   * contenedor del levantamiento.
   */
  protected get pickable(): readonly RevitObjectBase[] {
    const show = this.pickFilter;
    return this.scopedObjects.filter((o) => !(o instanceof Room) && (!show || show(o)));
  }

  private pickFilter: ((o: RevitObjectBase) => boolean) | null = null;

  /** Qué se puede tocar: lo que la vista oculta con filtros o capas no se selecciona (H-75). */
  setPickFilter(show: ((o: RevitObjectBase) => boolean) | null): void {
    this.pickFilter = show;
    const sel = this.selected;
    if (sel && show && !show(sel)) this.patch({ selectedId: null });
  }

  protected scope(): NonNullable<EditorCore['scopeCache']> {
    const c = this.scopeCache;
    if (c && c.objects === this.state.objects && c.level === this.levelScope && c.phase === this.phaseScope) return c;
    const scoped = this.state.objects.filter((o) => this.inScope(o));
    this.scopeCache = {
      objects: this.state.objects,
      level: this.levelScope,
      phase: this.phaseScope,
      scoped,
      walls: scoped.filter((o): o is Wall => o instanceof Wall),
    };
    return this.scopeCache;
  }

  /** Objetos de otros niveles visibles como calco atenuado. */
  get underlayObjects(): RevitObjectBase[] {
    const lv = this.levelScope;
    if (!lv) return [];
    return this.state.objects.filter(
      (o) => !(o instanceof Room) && !this.inScope(o) && this.phaseVisible(o) && lv.underlay.has(this.levelOf(o, lv)),
    );
  }

  /** Objetos visibles creados en una fase ANTERIOR a la activa: se dibujan como existentes. */
  get existingIds(): ReadonlySet<string> {
    const ph = this.phaseScope;
    const out = new Set<string>();
    if (!ph) return out;
    const active = ph.order.get(ph.active) ?? 0;
    for (const o of this.scopedObjects) {
      if (o instanceof Room) continue;
      if ((ph.order.get(this.markerOf(o, PHASE_PROP, ph)) ?? 0) < active) out.add(o.id as string);
    }
    return out;
  }

  /** Cotas de los niveles del proyecto (vacío sin niveles: todo a cota 0). */
  get levelElevations(): LevelElevations {
    return this.levelScope?.elevations ?? new Map();
  }

  /** Restricciones de un muro, con las de antes de existir niveles resueltas a su nivel. */
  wallVertical(wall: Wall): WallVertical {
    return wallVerticalOf(wall, this.levelScope?.base ?? '', LEVEL_PROP);
  }

  /** Alzado del muro en cotas absolutas. */
  wallProfile(wall: Wall): WallProfile {
    return resolveWallProfile(this.wallVertical(wall), this.levelElevations, wall.length as number);
  }

  columnVertical(column: Column): VerticalExtent {
    return columnVerticalOf(column, this.levelScope?.base ?? '', LEVEL_PROP);
  }

  /** Restricciones con que nacerán los próximos muros y columnas. `null` = altura por defecto. */
  setCreationVertical(v: Partial<CreationVertical>): void {
    this.creationVertical = { ...this.creationVertical, ...v };
  }

  /** Nivel y fase donde nace lo que se crea, y qué se ve. `null` = todo en la base. */
  setScope(level: LevelScope | null, phase: PhaseScope | null): void {
    this.levelScope = level;
    this.phaseScope = phase;
    const sel = this.selected;
    if (sel && !this.inScope(sel)) this.patch({ selectedId: null });
    this.refresh();
  }

  /**
   * Recarga sin esperar ni propagar el error (para llamarla desde la vista o
   * desde un cambio de alcance): un fallo se avisa como cualquier otro, en
   * vez de quedar como promesa rechazada sin manejar.
   */
  refresh(): void {
    this.reload().catch((err) => this.fail(err, 'No se pudo leer la planta.'));
  }

  protected markerOf(o: RevitObjectBase, key: string, scope: MarkerScope): string {
    const id = o.properties?.[key];
    return typeof id === 'string' && scope.all.has(id) ? id : scope.base;
  }

  protected wallById(id: string): Wall | undefined {
    if (this.wallIndex?.objects !== this.state.objects) {
      const byId = new Map<string, Wall>();
      for (const o of this.state.objects) if (o instanceof Wall) byId.set(o.id as string, o);
      this.wallIndex = { objects: this.state.objects, byId };
    }
    return this.wallIndex.byId.get(id);
  }

  /**
   * Nivel al que pertenece un objeto: el de la base de un muro o columna (la
   * más baja, si los extremos difieren), el guardado en los demás.
   */
  protected levelOf(o: RevitObjectBase, lv: LevelScope): string {
    const raw =
      o instanceof Wall
        ? hostLevelOf(this.wallVertical(o), lv.elevations, o.length as number)
        : o instanceof Column
          ? this.columnVertical(o).baseLevelId
          : o.properties?.[LEVEL_PROP];
    return typeof raw === 'string' && lv.all.has(raw) ? raw : lv.base;
  }

  /** Nivel del Recinto persistido: la base, o el más bajo con muros si la base no tiene ninguno. */
  protected roomLevelOf(objects: readonly RevitObjectBase[], lv: LevelScope): string {
    const levels = new Set(objects.filter((o) => o instanceof Wall && !o.is_deleted).map((o) => this.levelOf(o, lv)));
    if (levels.size === 0 || levels.has(lv.base)) return lv.base;
    return [...levels].sort((a, b) => (lv.elevations.get(a) ?? 0) - (lv.elevations.get(b) ?? 0))[0];
  }

  /**
   * ¿Se ve (y se edita) en la planta del nivel activo? Lo de su nivel, y los
   * muros y columnas de otros niveles que atraviesan su plano de corte. Una
   * puerta o ventana va con su muro.
   */
  protected levelVisible(o: RevitObjectBase, lv: LevelScope): boolean {
    if (o instanceof Door || o instanceof Window) {
      const host = this.wallById(o.parentWallId as string);
      if (host) return this.levelVisible(host, lv);
    }
    if (this.levelOf(o, lv) === lv.active) return true;
    const cut = (lv.elevations.get(lv.active) ?? 0) + CUT_PLANE_HEIGHT;
    if (o instanceof Wall) return profileSpans(this.wallProfile(o), cut);
    if (o instanceof Column) {
      const e = resolveExtent(this.columnVertical(o), lv.elevations);
      return e.base <= cut && cut < e.top;
    }
    // Un suelo algo más alto que el nivel (un piso a +0,25 sobre la base) sigue siendo de esta planta.
    if (o instanceof Floor) {
      const z = lv.elevations.get(this.levelOf(o, lv));
      const base = lv.elevations.get(lv.active) ?? 0;
      return z !== undefined && base <= z && z < cut;
    }
    return false;
  }

  protected phaseVisible(o: RevitObjectBase): boolean {
    const ph = this.phaseScope;
    if (!ph) return true;
    const own = ph.order.get(this.markerOf(o, PHASE_PROP, ph)) ?? 0;
    return own <= (ph.order.get(ph.active) ?? 0);
  }

  protected inScope(o: RevitObjectBase): boolean {
    if (o instanceof Room) return true;
    const lv = this.levelScope;
    if (lv && !this.levelVisible(o, lv)) return false;
    return this.phaseVisible(o);
  }

  /**
   * Propiedades con que nace un objeto: nivel y fase activos. Van en la misma
   * escritura que lo crea, así Deshacer/Rehacer nunca ve un objeto sin ellas.
   */
  /** Las mismas propiedades de nacimiento, para quien crea objetos por fuera del editor (puente de desarrollo). */
  creationProps(level?: string): Record<string, string> {
    return this.scopeProps(level);
  }

  protected scopeProps(level?: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lv = level ?? this.levelScope?.active;
    if (lv) out[LEVEL_PROP] = lv;
    if (this.phaseScope) out[PHASE_PROP] = this.phaseScope.active;
    return out;
  }

  get rooms(): Room[] {
    return this.state.objects.filter((o): o is Room => o instanceof Room);
  }

  get selected(): RevitObjectBase | null {
    if (!this.state.selectedId) return null;
    return this.state.objects.find((o) => o.id === this.state.selectedId) ?? null;
  }

  /** Handles del objeto seleccionado, en coordenadas mundo (siguen al arrastre). */
  get selectedHandles(): Handle[] {
    const sel = this.state.dragPreview ?? this.selected;
    return sel ? this.selection.handlesFor(sel) : [];
  }

  /** Objetos a dibujar: los persistidos, con el arrastrado en su posición en vivo. */
  get displayObjects(): readonly RevitObjectBase[] {
    const preview = this.state.dragPreview;
    const scoped = this.scopedObjects;
    if (!preview) return scoped;
    const live = new Map<string, RevitObjectBase>([[preview.id as string, preview]]);
    for (const o of this.state.dragLinked) live.set(o.id as string, o);
    return scoped.map((o) => live.get(o.id as string) ?? o);
  }

  worldToScreen(point: Point2D): CanvasPoint {
    return this.canvas.worldToScreen(point);
  }

  screenToWorld(x: number, y: number): Point2D {
    return this.canvas.screenToWorld(canvasPoint(x, y));
  }

  /** Muro padre de un vano, o `null` si ya no existe. */
  parentWallOf(vano: Door | Window): Wall | null {
    const id = vano.parentWallId as string;
    return this.walls.find((w) => (w.id as string) === id) ?? null;
  }

  vanoWorldCenter(vano: Door | Window): Point2D | null {
    const wall = this.parentWallOf(vano);
    return wall ? this.selection.vanoWorldCenter(vano, wall) : null;
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  /**
   * Asegura que el Room exista y carga sus objetos. Los muros se persisten uno
   * a uno al crearse, así que ya no hay un trazo a medias que recuperar.
   */
  async init(): Promise<void> {
    const room = (await this.services.store.readObject(this.roomObjectId)) as Room | null;
    if (!room) {
      await this.services.store.createObject(
        new Room({
          id: this.roomObjectId,
          roomId: this.roomId,
          levelId: this.services.defaultLevelId,
          geometry: [],
          isOpen: true,
        }),
      );
    }
    await this.reload();
  }

  /** Relee los objetos del Recinto, los marcadores de foto y el CommandStack. */
  async reload(): Promise<void> {
    let objects = await this.services.store.listObjects(this.roomId);
    const detect = (walls: Wall[]) =>
      this.services.useCases.detectRooms
        .execute({ walls })
        .suggestions.map((r) => ({ polygon: r.polygon, area: r.area as number, centroid: r.centroid }))
        .sort((a, b) => b.area - a.area);
    const scopedWalls = objects.filter((o): o is Wall => o instanceof Wall && this.inScope(o));
    const rooms = await this.syncZones(detect(scopedWalls), scopedWalls);
    // El Recinto persistido (el que exportan IFC y DXF) es el de su nivel, la
    // base: navegar a otro nivel no debe reescribir su geometría. Un espacio sin
    // muros en la base (el 2.º piso con cotas absolutas) toma el nivel más bajo con muros.
    const lv = this.levelScope;
    const roomLevel = lv && this.roomLevelOf(objects, lv);
    const baseRooms =
      !lv || lv.active === roomLevel
        ? rooms
        : detect(objects.filter((o): o is Wall => o instanceof Wall && this.levelOf(o, lv) === roomLevel));
    if (await this.syncRoomGeometry(objects, baseRooms)) {
      objects = await this.services.store.listObjects(this.roomId);
    }
    await this.reloadPhotoMarkers();
    const genericOpenings = await this.loadGenericOpenings();
    this.patch({
      genericOpenings,
      objects,
      rooms,
      canUndo: this.services.commandStack.canUndo(),
      canRedo: this.services.commandStack.canRedo(),
      // Una selección apuntando a un objeto que ya no está (borrado, o
      // deshecho) dejaría el panel de propiedades mostrando un fantasma.
      selectedId: objects.some((o) => o.id === this.state.selectedId) ? this.state.selectedId : null,
      selectedZoneId: rooms.some((r) => r.id === this.state.selectedZoneId) ? this.state.selectedZoneId : null,
    });
  }

  /**
   * Liga los contornos detectados a sus recintos persistidos (crea los nuevos,
   * desliga los que dejaron de cerrarse) y devuelve los recintos a dibujar.
   * En cola: dos recargas simultáneas crearían el mismo recinto dos veces.
   */
  protected syncZones(contours: readonly DetectedRoom[], walls: readonly Wall[]): Promise<DetectedRoom[]> {
    const run = async (): Promise<DetectedRoom[]> => {
      const zones = this.services.zones;
      const space = this.roomId as string;
      const lv = this.levelScope;
      const level = lv?.active ?? '';
      const all = await zones.list(space);
      // Al reabrir un espacio, los muros se leen antes de que lleguen los niveles. Con el
      // nivel desconocido los recintos ya guardados (de un nivel) no se reconocen y se
      // crearían de nuevo, duplicados. Se espera: setScope() vuelve a leer al llegar.
      if (!lv && all.some((z) => z.levelId !== '')) return [...contours];
      // Lo creado antes de cargar los niveles (nivel '') es de la base.
      const mine = all.filter((z) => z.levelId === level || (z.levelId === '' && (!lv || level === lv.base)));
      const thick = walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number }));
      const { assigned, changed } = reconcileZones({
        zones: mine,
        detected: contours.map((c) => ({ polygon: c.polygon, area: c.area, ...netGeometry(c.polygon, thick) })),
        spaceId: space,
        levelId: level,
        nextNumber: Math.max(0, ...all.map((z) => z.number)) + 1,
        newId: () => generateId() as string,
        now: new Date().toISOString(),
      });
      await zones.saveGeometry(changed);
      return assigned.map((z, i) => ({
        polygon: contours[i].polygon,
        area: contours[i].area,
        centroid: interiorPoint(z.netPolygon.length >= 3 ? z.netPolygon : z.polygon),
        id: z.id,
        number: z.number,
        name: z.name,
        use: z.use,
        notes: z.notes,
        netPolygon: z.netPolygon,
        netArea: z.netArea,
        perimeter: z.perimeter,
      }));
    };
    const next = this.zoneQueue.then(run, run);
    this.zoneQueue = next.catch(() => undefined);
    return next.catch(() => [...contours]);
  }

  // -------------------------------------------------------------------------
  // Recintos con identidad: selección y edición
  // -------------------------------------------------------------------------

  /** Recinto bajo un punto de pantalla (el más pequeño que lo contenga), o `null`. */
  zoneAt(screenX: number, screenY: number): DetectedRoom | null {
    const p = this.screenToWorld(screenX, screenY);
    const hits = this.state.rooms.filter((r) => r.id && r.polygon.length >= 3 && isPointInPolygon(p, r.polygon));
    return hits.sort((a, b) => a.area - b.area)[0] ?? null;
  }

  get selectedZone(): DetectedRoom | null {
    return this.state.rooms.find((r) => r.id === this.state.selectedZoneId) ?? null;
  }

  selectZone(id: string | null): void {
    this.patch({ selectedZoneId: id, ...(id && { selectedId: null }) });
  }

  /** Cambia nombre, uso o notas del recinto (metadatos: no entran al historial de deshacer). */
  async editZone(id: string, edit: ZoneEdit): Promise<void> {
    try {
      await this.services.zones.edit(id, edit);
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo guardar el recinto.');
    }
  }

  // -------------------------------------------------------------------------
  // Herramientas y toggles
  // -------------------------------------------------------------------------

  setTool(tool: EditorTool): void {
    // Cambiar de herramienta cierra el trazo en curso conceptualmente: los
    // vértices siguen ahí (el trazo no se pierde), pero la selección se limpia
    // porque un objeto seleccionado con la herramienta "muro" activa no tiene
    // ninguna acción asociada y solo confunde.
    this.patch({
      tool,
      selectedId: tool === 'select' ? this.state.selectedId : null,
      measureTargetId: tool === 'measure' ? this.state.measureTargetId : null,
      pendingPhotoPoint: tool === 'photo' ? this.state.pendingPhotoPoint : null,
      draggingHandle: null,
      dragPreview: null,
      dragSnappedToNode: false,
      dragLinked: [],
      wallDraft: null,
      shapeDraft: null,
    });
    this.dragOrigin = null;
  }

  setCreationMethod<K extends keyof CreationMethods>(tool: K, method: CreationMethods[K]): void {
    this.patch({ creation: { ...this.state.creation, [tool]: method }, wallDraft: null, shapeDraft: null });
  }

  /** Valores con que se crean los objetos nuevos (espesor de muro, ancho de vano…). */
  setDefaults(partial: Partial<EditorDefaults>): void {
    this.defaults = { ...this.defaults, ...partial };
  }

  setSnapEnabled(enabled: boolean): void {
    this.snap.setEnabled(enabled);
    this.patch({ snapEnabled: enabled });
  }

  setExtraSnaps(snaps: { vertex: boolean; midpoint: boolean }): void {
    this.patch({ vertexSnapEnabled: snaps.vertex, midpointSnapEnabled: snaps.midpoint });
  }

  /**
   * Snaps de vértice y punto medio: el candidato más cercano dentro de `tol`.
   * Vértices = esquinas de los recintos por la cara interior (lo que se acota
   * en obra) y por el eje; puntos medios = centro del eje de cada muro.
   */
  protected extraSnap(world: Point2D, tol: number, walls: readonly Wall[]): Point2D | null {
    let best: Point2D | null = null;
    let bestD = tol;
    const consider = (p: Point2D) => {
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    };
    if (this.state.vertexSnapEnabled) {
      for (const r of this.state.rooms) {
        for (const p of r.netPolygon ?? []) consider(p);
        for (const p of r.polygon) consider(p);
      }
    }
    if (this.state.midpointSnapEnabled) {
      for (const w of walls) consider({ x: (w.startPoint.x + w.endPoint.x) / 2, y: (w.startPoint.y + w.endPoint.y) / 2 });
    }
    return best;
  }

  setNodeSnapEnabled(enabled: boolean): void {
    this.patch({ nodeSnapEnabled: enabled });
  }

  select(id: RevitObjectId | null): void {
    this.patch({ selectedId: id, selectedZoneId: null });
  }

  /**
   * Selecciona el objeto bajo el dedo con CUALQUIER herramienta activa (el
   * long-press abre propiedades sin obligar a cambiar a Seleccionar). Devuelve
   * el objeto, o `null` si no había nada y la selección no cambió.
   */
  /** Objeto bajo el dedo, SIN seleccionarlo (Etiqueta, consultas). */
  objectAt(screenX: number, screenY: number, touchTolerancePx: number): RevitObjectBase | null {
    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(touchTolerancePx, this.state.transform.scale);
    return this.selection.hitTest({ worldPoint: world, objects: this.pickable, thresholdMeters: tol }) ?? null;
  }

  /** Centro de un objeto en planta (muro: punto medio; vano: su centro; columna: su posición). */
  objectCenter(id: string): Point2D | null {
    const o = this.state.objects.find((x) => (x.id as string) === id);
    if (o instanceof Wall) return { x: (o.startPoint.x + o.endPoint.x) / 2, y: (o.startPoint.y + o.endPoint.y) / 2 };
    if (o instanceof Column) return o.position;
    if (o instanceof Door || o instanceof Window) return this.vanoWorldCenter(o);
    const zone = this.state.rooms.find((r) => r.id === id);
    return zone ? zone.centroid : null;
  }

  selectAt(screenX: number, screenY: number, touchTolerancePx: number): RevitObjectBase | null {
    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(touchTolerancePx, this.state.transform.scale);
    const hit = this.selection.hitTest({ worldPoint: world, objects: this.pickable, thresholdMeters: tol });
    if (hit) this.patch({ selectedId: hit.id, selectedZoneId: null });
    return hit ?? null;
  }

  // -------------------------------------------------------------------------
  // Viewport: pan, zoom, encuadre
  // -------------------------------------------------------------------------

  /**
   * Fija la cámara entera. La usa el lienzo al terminar (o durante) un gesto
   * que animó la cámara en el hilo UI, para que el modelo quede en sincronía.
   */
  setTransform(transform: CanvasTransform): void {
    this.canvas.setTransform({
      ...transform,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale)),
    });
    this.patch({ transform: this.canvas.getTransform() });
  }

  /**
   * Zoom alrededor de un punto focal de pantalla: el punto mundo bajo el dedo
   * se queda donde estaba. Sin esta compensación, hacer pinch desplaza el
   * dibujo bajo los dedos y se siente roto (es el "focal-point compensado"
   * que LevON tuvo que arreglar dos veces).
   */
  zoomAround(focalX: number, focalY: number, factor: number): void {
    const t = this.canvas.getTransform();
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
    // world = (screen - offset) / scale  →  para fijar el punto focal:
    //   offset' = focal - (focal - offset) * (scale' / scale)
    const k = nextScale / t.scale;
    this.canvas.setTransform({
      scale: nextScale,
      offsetX: focalX - (focalX - t.offsetX) * k,
      offsetY: focalY - (focalY - t.offsetY) * k,
    });
    this.patch({ transform: this.canvas.getTransform() });
  }

  /**
   * Punto del mundo bajo el dedo, enganchado a la esquina de muro más
   * cercana si hay una a menos de la tolerancia (para colocar mojones o medir
   * sobre el levantamiento con precisión). `snapped` dice si enganchó.
   */
  snapToNode(screenX: number, screenY: number, touchTolerancePx: number): { point: Point2D; snapped: boolean } {
    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(touchTolerancePx, this.state.transform.scale);
    const node = this.state.nodeSnapEnabled
      ? this.selection.findNearestNode({ worldPoint: world, walls: this.walls, thresholdMeters: tol })
      : null;
    const hit = node ?? this.extraSnap(world, tol as number, this.walls);
    return hit ? { point: hit, snapped: true } : { point: world, snapped: false };
  }

  /**
   * Gira la VISTA a `rotation` (rad) alrededor de un punto de pantalla, que
   * queda quieto. Solo visual: no toca el modelo.
   */
  setRotation(rotation: number, pivotX: number, pivotY: number): void {
    const t = this.canvas.getTransform();
    const w = this.canvas.screenToWorld(canvasPoint(pivotX, pivotY));
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    this.canvas.setTransform({
      scale: t.scale,
      rotation,
      offsetX: pivotX - (w.x * c - w.y * s) * t.scale,
      offsetY: pivotY - (w.x * s + w.y * c) * t.scale,
    });
    this.patch({ transform: this.canvas.getTransform() });
  }

  /** Acerca o aleja alrededor del centro del viewport. */
  zoomBy(factor: number, viewportWidth: number, viewportHeight: number): void {
    this.zoomAround(viewportWidth / 2, viewportHeight / 2, factor);
  }

  /** Encuadra el objeto seleccionado. Sin selección, encuadra todo. */
  zoomToSelection(viewportWidth: number, viewportHeight: number): void {
    const sel = this.selected;
    if (!sel || sel instanceof Room) {
      this.zoomToFit(viewportWidth, viewportHeight);
      return;
    }
    const pts = this.selection.handlesFor(sel).map((h) => h.position);
    if (sel instanceof Column) {
      const r = (sel.dimensionX as number) * 2;
      pts.push({ x: sel.position.x - r, y: sel.position.y - r }, { x: sel.position.x + r, y: sel.position.y + r });
    }
    this.fitPoints(pts, viewportWidth, viewportHeight, 64);
  }

  /** Encuadra todo lo dibujado en el viewport dado, con un margen. */
  zoomToFit(viewportWidth: number, viewportHeight: number, paddingPx = 32): void {
    const pts: Point2D[] = [];
    for (const w of this.walls) pts.push(w.startPoint, w.endPoint);
    for (const o of this.scopedObjects) {
      if (o instanceof Column) pts.push(o.position);
      // Un suelo libre (andén) puede salirse de los muros: también entra en el encuadre.
      else if (o instanceof Floor && o.outline) pts.push(...o.outline);
    }
    this.fitPoints(pts, viewportWidth, viewportHeight, paddingPx);
  }

  /** Encuadra unos puntos (un suelo aislado, un contorno) con un margen. */
  zoomToPoints(pts: readonly Point2D[], viewportWidth: number, viewportHeight: number, paddingPx = 64): void {
    this.fitPoints([...pts], viewportWidth, viewportHeight, paddingPx);
  }

  protected fitPoints(pts: Point2D[], viewportWidth: number, viewportHeight: number, paddingPx: number): void {

    if (pts.length === 0) {
      this.canvas.setTransform({ scale: 100, offsetX: viewportWidth / 2, offsetY: viewportHeight / 2 });
      this.patch({ transform: this.canvas.getTransform() });
      return;
    }

    // Con la vista girada se encuadra la caja de los puntos YA girados.
    const rot = this.canvas.getTransform().rotation ?? 0;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const turned = pts.map((p) => ({ x: p.x * c - p.y * sn, y: p.x * sn + p.y * c }));
    const xs = turned.map((p) => p.x);
    const ys = turned.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = Math.max(maxX - minX, 1e-3);
    const spanY = Math.max(maxY - minY, 1e-3);
    const usableW = Math.max(viewportWidth - paddingPx * 2, 1);
    const usableH = Math.max(viewportHeight - paddingPx * 2, 1);

    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(usableW / spanX, usableH / spanY)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    this.canvas.setTransform({
      scale,
      offsetX: viewportWidth / 2 - cx * scale,
      offsetY: viewportHeight / 2 - cy * scale,
      rotation: rot,
    });
    this.patch({ transform: this.canvas.getTransform() });
  }

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  /** Relee si hay algo que deshacer/rehacer (tras editar desde otra vista, p. ej. el alzado). */
  refreshHistory(): void {
    const canUndo = this.services.commandStack.canUndo();
    const canRedo = this.services.commandStack.canRedo();
    if (canUndo !== this.state.canUndo || canRedo !== this.state.canRedo) this.patch({ canUndo, canRedo });
  }

  async undo(): Promise<void> {
    if (this.state.busy || !this.state.canUndo) return;
    this.patch({ busy: true });
    try {
      await this.services.commandStack.undo();
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo deshacer la última acción.');
    } finally {
      this.patch({ busy: false });
    }
  }

  async redo(): Promise<void> {
    if (this.state.busy || !this.state.canRedo) return;
    this.patch({ busy: true });
    try {
      await this.services.commandStack.redo();
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo rehacer la acción.');
    } finally {
      this.patch({ busy: false });
    }
  }

  // -------------------------------------------------------------------------
  // Recintos
  // -------------------------------------------------------------------------

  /**
   * Mantiene `Room.geometry` y `Room.area` iguales al MAYOR recinto cerrado que
   * forman los muros (es lo que exportan IFC y DXF). Mientras los muros no
   * cierren, el Recinto queda abierto y sin geometría: nunca se rellena un
   * contorno abierto. Devuelve `true` si escribió algo.
   */
  protected async syncRoomGeometry(objects: readonly RevitObjectBase[], rooms: readonly DetectedRoom[]): Promise<boolean> {
    const room = objects.find((o): o is Room => o instanceof Room && o.id === this.roomObjectId);
    if (!room) return false;

    const target = rooms[0];
    const geometry = target ? [...target.polygon] : [];
    const same =
      room.geometry.length === geometry.length &&
      room.geometry.every((p, i) => Math.hypot(p.x - geometry[i].x, p.y - geometry[i].y) < 1e-9);
    if (same && room.isOpen === !target) return false;

    await this.services.store.updateObject(this.roomObjectId, {
      geometry,
      area: target ? squareMeters(target.area) : undefined,
      isOpen: !target,
    } as Partial<Room>);
    return true;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** Snap para el extremo de un muro que se está arrastrando. */
  protected snapEndpoint(world: Point2D, otherEnd: Point2D): Point2D {
    return this.state.snapEnabled ? this.snap.snapPoint(world, otherEnd) : world;
  }

  protected nearestWall(world: Point2D, tol: Meters): Wall | null {
    let best: Wall | null = null;
    let bestDist = tol as number;
    for (const wall of this.walls) {
      const d = distanceToSegment(world, wall.startPoint, wall.endPoint);
      if (d < bestDist) {
        bestDist = d;
        best = wall;
      }
    }
    return best;
  }

  /**
   * Distancia desde el inicio del muro hasta la proyección del punto sobre su
   * eje, acotada al muro.
   *
   * Delega en `projectPointToWall` (domain/geometry/projections.ts), que ya
   * implementaba exactamente esta transformación y no la usaba nadie: la
   * versión anterior de este método rehacía la misma aritmética a mano, con la
   * garantía de que las dos copias acabarían divergiendo.
   */
  protected projectOntoWall(world: Point2D, wall: Wall): number {
    const { offsetAlong } = projectPointToWall(world, wall);
    return Math.max(0, Math.min(offsetAlong as number, wall.length as number));
  }

  /**
   * Coloca el vano de forma que quepa entero dentro del muro. Sin este ajuste,
   * tocar cerca de un extremo produce un vano que sobresale — que el dominio
   * acepta con un warning, pero que no es lo que el usuario quiso indicar.
   */
  protected clampVanoOffset(centerAlong: number, width: Meters, wall: Wall): Meters {
    const wallLen = wall.length as number;
    const w = width as number;

    // Un vano más ancho que su muro no cabe de ninguna manera: se ancla al
    // arranque y el dominio emitirá el warning correspondiente. Recortarle el
    // ancho en silencio sería decidir por el operador que la puerta que acaba
    // de medir es más estrecha de lo que es.
    if (w >= wallLen) return meters(0);

    const offset = meters(Math.max(0, Math.min(centerAlong - w / 2, wallLen - w)));

    // Comprobación de la invariante que este método existe para garantizar,
    // con la misma función que usa la validación del dominio.
    const fits = isVanoWithinWall(
      { offsetAlongWall: offset, offsetPerpendicular: meters(0), width, height: meters(0) },
      wall,
    );
    return fits ? offset : meters(0);
  }

  /**
   * Avisa si el muro recién trazado forma un encuentro demasiado agudo con
   * alguno de los que ya tocaba.
   *
   * POR QUÉ IMPORTA EN CAMPO: por debajo de unos 10°, el encuentro de dos
   * muros no se puede ejecutar limpio — el vértice exterior se dispara a una
   * distancia absurda y en obra se resuelve con un corte o un machón, no con
   * la geometría dibujada. Avisar en el momento del trazo evita descubrirlo al
   * exportar, cuando ya hay veinte muros encima.
   *
   * Es un AVISO, nunca un bloqueo: hay edificios con esquinas así, y la app
   * está para levantar lo que existe.
   */
  protected warnOnAcuteMeeting(created: Wall): void {
    const near = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-3;
    for (const other of this.walls) {
      if ((other.id as string) === (created.id as string)) continue;
      // Solo cuenta un encuentro de verdad: muros que comparten un extremo.
      const touches = [created.startPoint, created.endPoint].some(
        (p) => near(p, other.startPoint) || near(p, other.endPoint),
      );
      if (!touches) continue;

      const result = this.miter.calculateMiter(created, other);
      if (!result.isValid && result.warning) {
        this.notify(
          'info',
          `Encuentro muy agudo (${Number(result.angle).toFixed(1)}°) con un muro contiguo: ` +
            'revisa si en obra se resuelve así.',
        );
        return; // un aviso por trazo basta; encadenarlos sería ruido
      }
    }
  }

}
