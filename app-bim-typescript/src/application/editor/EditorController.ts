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
import { RevitObjectBase, RevitObjectId, RoomId, WallId, wallId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Floor, floorZoneId } from '../../domain/objects/floor';
import { distanceToSegment, isPointInPolygon } from '../../domain/geometry/polygon-utils';
import { generateId } from '../../domain/objects/base';
import { interiorPoint, netGeometry } from '../../domain/objects/zone';
import { reconcileZones } from '../topology/reconcileZones';
import type { ZoneEdit } from '../../infrastructure/sqlite/ZoneStore';
import { lineShape } from '../../domain/geometry/shapes';
import { LEVEL_PROP, PHASE_PROP } from '../../domain/objects/marker';
import {
  LevelElevations,
  VerticalExtent,
  WallProfile,
  WallVertical,
  columnVerticalOf,
  hostLevelOf,
  profileHeight,
  profileProblem,
  profileSpans,
  resolveExtent,
  resolveWallProfile,
  wallVerticalOf,
} from '../../domain/objects/vertical';
import { projectPointToWall, isVanoWithinWall } from '../../domain/geometry/projections';
import { AppError } from '../../shared/errors/AppError';
import { CanvasManager } from '../canvas/CanvasManager';
import { CanvasPoint, canvasPoint, MIN_SCALE, MAX_SCALE } from '../canvas/types';
import { SnapHandler } from '../canvas/SnapHandler';
import { MiterHandler } from '../canvas/MiterHandler';
import { SelectionService, Handle, touchToleranceMeters } from '../canvas/SelectionService';
import { JointWall, WallEndsChange, endsAt, planEndMove, planWallTranslate } from '../../domain/topology/joints';
import type { AppServices } from '../AppServices';
import type { AuditPhotoId } from '../../domain/objects/base';

/** Marcador de foto listo para dibujar: lo que el renderer necesita y nada más. */
export interface PhotoMarkerView {
  readonly id: string;
  readonly position: Point2D;
  readonly direction?: number;
  readonly label?: string;
}

// ---------------------------------------------------------------------------
// Herramientas y estado
// ---------------------------------------------------------------------------

export type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'column' | 'floor' | 'measure' | 'photo';

/** Valores por defecto de los objetos que el editor crea. Editables en Ajustes. */
export interface EditorDefaults {
  wallThickness: Meters;
  wallHeight: Meters;
  doorWidth: Meters;
  doorHeight: Meters;
  windowWidth: Meters;
  windowHeight: Meters;
  columnDiameter: Meters;
  columnHeight: Meters;
  floorThickness: Meters;
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
};

/** Formas de creación (nivel 3 del FAB): cómo se dibuja cada herramienta. */
export type WallCreationMethod = 'drag' | 'points';
export type ColumnCreationMethod = 'rectangular' | 'circular';
export interface CreationMethods {
  readonly wall: WallCreationMethod;
  readonly column: ColumnCreationMethod;
}

/** Muro en curso de trazado (no persistido). */
export interface WallDraft {
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
export interface MarkerScope {
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
export const CUT_PLANE_HEIGHT = 1.2;

/** Restricciones con que nacen los muros y columnas (el selector de base y tope). */
export interface CreationVertical {
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
  readonly transform: CanvasTransform;
  readonly snapEnabled: boolean;
  readonly nodeSnapEnabled: boolean;
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

export type EditorListener = (state: EditorState) => void;

/** Lo común a todo destino de arrastre: plan de uniones (si el muro tiene) y muros arrastrados. */
interface DragJoints {
  readonly plan: WallEndsChange[] | null;
  readonly linked: RevitObjectBase[];
}

type DragTarget =
  | ({ kind: 'center'; dx: number; dy: number; preview: RevitObjectBase | null; snappedToNode: false } & DragJoints)
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
function cloneWith<T extends object>(obj: T, changes: Partial<T>): T {
  return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj, changes);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class EditorController {
  private readonly services: AppServices;
  private readonly roomId: RoomId;
  private readonly roomObjectId: RevitObjectId;

  private readonly canvas: CanvasManager;
  private readonly selection = new SelectionService();
  private readonly snap: SnapHandler;
  private readonly miter = new MiterHandler();
  private defaults: EditorDefaults;

  private listeners: EditorListener[] = [];
  private state: EditorState;

  /** Punto mundo donde empezó el arrastre en curso, para calcular el delta. */
  private dragOrigin: Point2D | null = null;
  private dragTolerancePx = 22;
  private wallCommits: Promise<void> = Promise.resolve();
  private zoneQueue: Promise<unknown> = Promise.resolve();
  private levelScope: LevelScope | null = null;
  private phaseScope: PhaseScope | null = null;
  private creationVertical: CreationVertical = { wall: null, column: null };
  /** Muros por id, recalculado solo cuando cambia la lista de objetos. */
  private wallIndex: { objects: readonly RevitObjectBase[]; byId: Map<string, Wall> } | null = null;
  /**
   * Objetos y muros del alcance (nivel + fase). Decidir si un muro se ve en la
   * planta activa resuelve sus restricciones y su perfil: hacerlo en cada
   * consulta (la vista pregunta varias veces por render, y cada toque busca
   * nodos) era el costo dominante con muchos muros. Se recalcula solo cuando
   * cambian los objetos o el alcance (ambos se reemplazan, nunca se mutan).
   */
  private scopeCache: {
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
      creation: { wall: 'drag', column: 'rectangular' },
      wallDraft: null,
      rooms: [],
      selectedId: null,
      selectedZoneId: null,
      measureTargetId: null,
      pendingPhotoPoint: null,
      photoMarkers: [],
      transform: this.canvas.getTransform(),
      snapEnabled: true,
      nodeSnapEnabled: true,
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

  private patch(partial: Partial<EditorState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }

  private notify(kind: 'info' | 'error' | 'success', message: string): void {
    this.patch({ notice: { kind, message } });
  }

  /** La vista llama a esto tras mostrar el aviso, para que no se repita. */
  clearNotice(): void {
    if (this.state.notice) this.patch({ notice: null });
  }

  private fail(err: unknown, fallback: string): void {
    this.notify('error', err instanceof AppError ? err.userMessage : fallback);
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
  private get pickable(): readonly RevitObjectBase[] {
    return this.scopedObjects.filter((o) => !(o instanceof Room));
  }

  private scope(): NonNullable<EditorController['scopeCache']> {
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
    return resolveWallProfile(this.wallVertical(wall), this.levelElevations);
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

  private markerOf(o: RevitObjectBase, key: string, scope: MarkerScope): string {
    const id = o.properties?.[key];
    return typeof id === 'string' && scope.all.has(id) ? id : scope.base;
  }

  private wallById(id: string): Wall | undefined {
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
  private levelOf(o: RevitObjectBase, lv: LevelScope): string {
    const raw =
      o instanceof Wall
        ? hostLevelOf(this.wallVertical(o), lv.elevations)
        : o instanceof Column
          ? this.columnVertical(o).baseLevelId
          : o.properties?.[LEVEL_PROP];
    return typeof raw === 'string' && lv.all.has(raw) ? raw : lv.base;
  }

  /**
   * ¿Se ve (y se edita) en la planta del nivel activo? Lo de su nivel, y los
   * muros y columnas de otros niveles que atraviesan su plano de corte. Una
   * puerta o ventana va con su muro.
   */
  private levelVisible(o: RevitObjectBase, lv: LevelScope): boolean {
    if (o instanceof Door || o instanceof Window) {
      const host = this.wallById(o.parentWallId as unknown as string);
      if (host) return this.levelVisible(host, lv);
    }
    if (this.levelOf(o, lv) === lv.active) return true;
    const cut = (lv.elevations.get(lv.active) ?? 0) + CUT_PLANE_HEIGHT;
    if (o instanceof Wall) return profileSpans(this.wallProfile(o), cut);
    if (o instanceof Column) {
      const e = resolveExtent(this.columnVertical(o), lv.elevations);
      return e.base <= cut && cut < e.top;
    }
    return false;
  }

  private phaseVisible(o: RevitObjectBase): boolean {
    const ph = this.phaseScope;
    if (!ph) return true;
    const own = ph.order.get(this.markerOf(o, PHASE_PROP, ph)) ?? 0;
    return own <= (ph.order.get(ph.active) ?? 0);
  }

  private inScope(o: RevitObjectBase): boolean {
    if (o instanceof Room) return true;
    const lv = this.levelScope;
    if (lv && !this.levelVisible(o, lv)) return false;
    return this.phaseVisible(o);
  }

  /**
   * Propiedades con que nace un objeto: nivel y fase activos. Van en la misma
   * escritura que lo crea, así Deshacer/Rehacer nunca ve un objeto sin ellas.
   */
  private scopeProps(level?: string): Record<string, string> {
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
    const id = vano.parentWallId as unknown as string;
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
    // base: navegar a otro nivel no debe reescribir su geometría.
    const lv = this.levelScope;
    const baseRooms =
      !lv || lv.active === lv.base
        ? rooms
        : detect(objects.filter((o): o is Wall => o instanceof Wall && this.levelOf(o, lv) === lv.base));
    if (await this.syncRoomGeometry(objects, baseRooms)) {
      objects = await this.services.store.listObjects(this.roomId);
    }
    await this.reloadPhotoMarkers();
    this.patch({
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
  private syncZones(contours: readonly DetectedRoom[], walls: readonly Wall[]): Promise<DetectedRoom[]> {
    const run = async (): Promise<DetectedRoom[]> => {
      const zones = this.services.zones;
      const space = this.roomId as unknown as string;
      const lv = this.levelScope;
      const level = lv?.active ?? '';
      const all = await zones.list(space);
      // Lo creado antes de cargar los niveles (nivel '') es de la base.
      const mine = all.filter((z) => z.levelId === level || (z.levelId === '' && (!lv || level === lv.base)));
      const thick = walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number }));
      const { assigned, changed } = reconcileZones({
        zones: mine,
        detected: contours.map((c) => ({ polygon: c.polygon, area: c.area, ...netGeometry(c.polygon, thick) })),
        spaceId: space,
        levelId: level,
        nextNumber: Math.max(0, ...all.map((z) => z.number)) + 1,
        newId: () => generateId() as unknown as string,
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
    });
    this.dragOrigin = null;
  }

  setCreationMethod<K extends keyof CreationMethods>(tool: K, method: CreationMethods[K]): void {
    this.patch({ creation: { ...this.state.creation, [tool]: method }, wallDraft: null });
  }

  /** Valores con que se crean los objetos nuevos (espesor de muro, ancho de vano…). */
  setDefaults(partial: Partial<EditorDefaults>): void {
    this.defaults = { ...this.defaults, ...partial };
  }

  setSnapEnabled(enabled: boolean): void {
    this.snap.setEnabled(enabled);
    this.patch({ snapEnabled: enabled });
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
    const node = this.selection.findNearestNode({ worldPoint: world, walls: this.walls, thresholdMeters: tol });
    return node ? { point: node, snapped: true } : { point: world, snapped: false };
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
    for (const o of this.scopedObjects) if (o instanceof Column) pts.push(o.position);
    this.fitPoints(pts, viewportWidth, viewportHeight, paddingPx);
  }

  private fitPoints(pts: Point2D[], viewportWidth: number, viewportHeight: number, paddingPx: number): void {

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
  // Gesto principal: tap
  // -------------------------------------------------------------------------

  async handleTap(screenX: number, screenY: number, touchTolerancePx: number): Promise<void> {
    if (this.state.busy) return;

    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(touchTolerancePx, this.state.transform.scale);

    switch (this.state.tool) {
      case 'select': {
        // Un objeto bajo el dedo gana; si no hay, el recinto que lo contiene.
        const hit = this.selection.hitTest({ worldPoint: world, objects: this.pickable, thresholdMeters: tol });
        const zone = hit ? null : this.zoneAt(screenX, screenY);
        this.patch({ selectedId: hit?.id ?? null, selectedZoneId: zone?.id ?? null });
        return;
      }
      case 'wall':
        return this.wallTap(screenX, screenY);
      case 'door':
        return this.addVano('door', world, tol);
      case 'window':
        return this.addVano('window', world, tol);
      case 'column':
        return this.addColumn(world);
      case 'floor':
        return this.addFloor(screenX, screenY);
      case 'measure':
        return this.pickMeasureTarget(world, tol);
      case 'photo':
        this.patch({ pendingPhotoPoint: world });
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Gesto: arrastre de handles (herramienta select)
  // -------------------------------------------------------------------------

  /** Devuelve `true` si el arrastre agarró un handle (la vista no debe panear). */
  beginDrag(screenX: number, screenY: number, touchTolerancePx: number): boolean {
    if (this.state.tool !== 'select') return false;
    const sel = this.selected;
    if (!sel) return false;

    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(touchTolerancePx, this.state.transform.scale);
    const handle = this.selection.hitTestHandle({ worldPoint: world, selectedObject: sel, thresholdMeters: tol });
    if (!handle) return false;

    this.dragOrigin = world;
    this.dragTolerancePx = touchTolerancePx;
    this.patch({ draggingHandle: handle, dragPreview: null, dragSnappedToNode: false, dragLinked: [] });
    return true;
  }

  /**
   * El dedo se movió con un handle agarrado: actualiza la vista previa sin
   * persistir nada (como `updateManipulation` de LevON). Solo `endDrag` crea
   * el comando, así un arrastre entero es UN paso de deshacer.
   */
  updateDrag(screenX: number, screenY: number): void {
    const target = this.dragTargetAt(screenX, screenY);
    if (!target) return;
    this.patch({ dragPreview: target.preview, dragSnappedToNode: target.snappedToNode, dragLinked: target.linked });
  }

  /** Abandona el arrastre sin persistir (el gesto fue cancelado por el sistema). */
  cancelDrag(): void {
    this.dragOrigin = null;
    if (this.state.draggingHandle || this.state.dragPreview) {
      this.patch({ draggingHandle: null, dragPreview: null, dragSnappedToNode: false, dragLinked: [] });
    }
  }

  /**
   * Cierra el arrastre persistiendo el cambio. Un arrastre de handle `center`
   * mueve el objeto entero vía MoveObjectUseCase (que arrastra los vanos con
   * él); arrastrar `start`/`end` reescribe ese extremo del muro.
   */
  async endDrag(screenX: number, screenY: number): Promise<void> {
    const target = this.dragTargetAt(screenX, screenY);
    this.dragOrigin = null;
    // La vista previa se conserva hasta que termine la recarga: si se borrara
    // ya, el objeto volvería un instante a su sitio viejo antes de saltar al nuevo.
    this.patch({ draggingHandle: null, dragSnappedToNode: false });

    const sel = this.selected;
    if (!target || !sel) {
      this.patch({ dragPreview: null, dragLinked: [] });
      return;
    }

    const { dx, dy } = target;
    // Un micro-arrastre por temblor de pulso no debe contar como una edición:
    // generaría un comando en la pila que el usuario no pidió.
    if (Math.hypot(dx, dy) < 1e-4) {
      this.patch({ dragPreview: null, dragLinked: [] });
      return;
    }

    this.patch({ busy: true });
    try {
      if (target.plan) {
        // Muro con uniones: todos los muros afectados, un solo paso de deshacer.
        await this.services.useCases.reshapeWalls.execute({ changes: target.plan });
      } else if (target.kind === 'center') {
        // MoveObjectUseCase toma posiciones ABSOLUTAS, no deltas: para un muro
        // basta mandar el nuevo inicio (el use case traslada el final y el eje
        // con el mismo delta); para una columna, la nueva posición.
        if (sel instanceof Wall) {
          await this.services.useCases.moveObject.execute({
            objectId: sel.id,
            newStartPoint: { x: sel.startPoint.x + dx, y: sel.startPoint.y + dy },
          });
        } else if (sel instanceof Column) {
          await this.services.useCases.moveObject.execute({
            objectId: sel.id,
            newPosition: { x: sel.position.x + dx, y: sel.position.y + dy },
          });
        }
      } else if (sel instanceof Wall) {
        await this.services.useCases.updateObjectProperty.execute({
          objectId: sel.id,
          property: target.kind === 'start' ? 'startPoint' : 'endPoint',
          newValue: target.point,
        });
      }
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo mover el objeto.');
    } finally {
      this.patch({ busy: false, dragPreview: null, dragLinked: [] });
    }
  }

  /**
   * Dónde quedaría el objeto si el dedo se soltara en (screenX, screenY).
   * Lo usan tanto la vista previa como el commit: lo que se ve es lo que se guarda.
   */
  private dragTargetAt(screenX: number, screenY: number): DragTarget | null {
    const handle = this.state.draggingHandle;
    const origin = this.dragOrigin;
    const sel = this.selected;
    if (!handle || !origin || !sel) return null;

    const world = this.screenToWorld(screenX, screenY);

    if (handle.kind === 'center') {
      const dx = world.x - origin.x;
      const dy = world.y - origin.y;
      let preview: RevitObjectBase | null = null;
      if (sel instanceof Column) {
        preview = cloneWith(sel, { position: { x: sel.position.x + dx, y: sel.position.y + dy } });
      } else if (sel instanceof Wall && sel.isStraight) {
        const joints = this.jointWalls(sel);
        if (joints) {
          const plan = planWallTranslate(joints, sel.id as string, dx, dy);
          const { main, linked } = this.previewPlan(sel, plan);
          return { kind: 'center', dx, dy, preview: main, snappedToNode: false, plan, linked };
        }
      }
      return { kind: 'center', dx, dy, preview, snappedToNode: false, plan: null, linked: [] };
    }

    if (!(sel instanceof Wall)) return null;
    const isStart = handle.kind === 'start';
    const fixed = isStart ? sel.endPoint : sel.startPoint;
    const current = isStart ? sel.startPoint : sel.endPoint;

    // Nodo de OTRO muro primero (cierra la topología, como en el trazo); si no
    // hay, el snap angular respecto al extremo fijo.
    let point = world;
    let snappedToNode = false;
    const joints = this.jointWalls(sel);
    // Los muros unidos en este extremo se mueven con él: engancharse a ellos
    // sería engancharse a sí mismo.
    const joinedHere = new Set(joints ? endsAt(joints, current, new Set([sel.id as string])).map((j) => j.id) : []);
    const tol = touchToleranceMeters(this.dragTolerancePx, this.state.transform.scale);
    const others = this.walls.filter((w) => w.id !== sel.id && !joinedHere.has(w.id as string));
    if (this.state.nodeSnapEnabled) {
      const node = this.selection.findNearestNode({ worldPoint: world, walls: others, thresholdMeters: tol });
      if (node) {
        point = node;
        snappedToNode = true;
      }
    }
    if (!snappedToNode) {
      point = this.snapEndpoint(world, fixed);
      // Llevar el extremo hasta el eje de otro muro lo deja en T (une y divide recintos).
      const onAxis = this.state.nodeSnapEnabled ? this.snapToWallAxis(world, point, fixed, tol, others) : null;
      if (onAxis) {
        point = onAxis;
        snappedToNode = true;
      }
    }

    if (joints) {
      const plan = planEndMove(joints, sel.id as string, isStart ? 'start' : 'end', point);
      const { main, linked } = this.previewPlan(sel, plan);
      return {
        kind: isStart ? 'start' : 'end',
        point,
        dx: point.x - current.x,
        dy: point.y - current.y,
        preview: main,
        snappedToNode,
        plan,
        linked,
      };
    }

    const preview = sel.isStraight
      ? cloneWith(sel, {
          startPoint: isStart ? point : fixed,
          endPoint: isStart ? fixed : point,
          shape: lineShape(isStart ? point : fixed, isStart ? fixed : point),
        })
      : null;
    return {
      kind: isStart ? 'start' : 'end',
      point,
      dx: point.x - current.x,
      dy: point.y - current.y,
      preview,
      snappedToNode,
      plan: null,
      linked: [],
    };
  }

  /**
   * Muros que pueden estar unidos a `wall`: los rectos de su mismo nivel (dos
   * muros de plantas distintas no se unen aunque coincidan en planta). `null`
   * si el muro no es recto: los arcos se mueven solos, como antes.
   */
  private jointWalls(wall: Wall): JointWall[] | null {
    if (!wall.isStraight) return null;
    const lv = this.levelScope;
    const level = lv ? this.levelOf(wall, lv) : null;
    const out: JointWall[] = [];
    for (const w of this.walls) {
      if (!w.isStraight) continue;
      if (lv && this.levelOf(w, lv) !== level) continue;
      out.push({ id: w.id as string, start: w.startPoint, end: w.endPoint });
    }
    return out;
  }

  /** Vistas previas de un plan de uniones: el muro arrastrado y los que arrastra. */
  private previewPlan(sel: Wall, plan: readonly WallEndsChange[]): { main: RevitObjectBase; linked: RevitObjectBase[] } {
    let main: RevitObjectBase = sel;
    const linked: RevitObjectBase[] = [];
    for (const c of plan) {
      const w = c.id === (sel.id as string) ? sel : this.wallById(c.id);
      if (!w) continue;
      const start = c.start ?? w.startPoint;
      const end = c.end ?? w.endPoint;
      const clone = cloneWith(w, { startPoint: start, endPoint: end, shape: lineShape(start, end) });
      if (w === sel) main = clone;
      else linked.push(clone);
    }
    return { main, linked };
  }

  // -------------------------------------------------------------------------
  // Creación de objetos
  // -------------------------------------------------------------------------

  // --- Trazado de muros --------------------------------------------------
  //
  // Un gesto de un dedo con la herramienta Muro es un TRAZO, no un paneo:
  //   drag   → drawBegin fija el inicio; drawEnd crea el muro inicio→fin.
  //   points → cada gesto (o toque) fija un punto; el segundo crea el muro.
  // El muro se crea con snap a nodo (primero) o angular respecto al inicio.

  drawBegin(screenX: number, screenY: number): void {
    // No se bloquea con `busy`: trazar el muro siguiente mientras se guarda el
    // anterior es el ritmo normal de campo; perder ese trazo sería peor.
    if (this.state.tool !== 'wall') return;
    const { point, snappedToNode } = this.snapDrawPoint(screenX, screenY, this.state.wallDraft?.start ?? undefined);
    if (this.state.creation.wall === 'drag') {
      this.patch({ wallDraft: { start: point, end: point, snappedToNode } });
    } else {
      this.patch({ wallDraft: { start: this.state.wallDraft?.start ?? null, end: point, snappedToNode } });
    }
  }

  drawMove(screenX: number, screenY: number): void {
    const draft = this.state.wallDraft;
    if (!draft || this.state.tool !== 'wall') return;
    const { point, snappedToNode } = this.snapDrawPoint(screenX, screenY, draft.start ?? undefined);
    this.patch({ wallDraft: { ...draft, end: point, snappedToNode } });
  }

  async drawEnd(screenX: number, screenY: number): Promise<void> {
    if (this.state.tool !== 'wall') return;
    this.drawMove(screenX, screenY);
    const draft = this.state.wallDraft;
    if (!draft?.end) return;

    if (this.state.creation.wall === 'points' && !draft.start) {
      // Primer punto: queda fijado esperando el segundo.
      this.patch({ wallDraft: { start: draft.end, end: null, snappedToNode: false } });
      return;
    }
    if (!draft.start) return;
    await this.commitWall(draft.start, draft.end);
  }

  /** El gesto se abandonó (entró un segundo dedo, o el sistema lo canceló). */
  drawCancel(): void {
    const draft = this.state.wallDraft;
    if (!draft) return;
    // En punto a punto se conserva el inicio ya fijado: cancelar un gesto no
    // debe perder el primer toque (p. ej. al hacer zoom entre los dos puntos).
    const keep = this.state.creation.wall === 'points' && draft.start;
    this.patch({ wallDraft: keep ? { start: draft.start, end: null, snappedToNode: false } : null });
  }

  /** Suelta el inicio fijado en "punto a punto" sin crear nada. */
  clearWallDraft(): void {
    if (this.state.wallDraft) this.patch({ wallDraft: null });
  }

  private async wallTap(screenX: number, screenY: number): Promise<void> {
    if (this.state.creation.wall === 'drag') {
      this.notify('info', 'Arrastra el dedo de un extremo al otro para trazar el muro.');
      return;
    }
    this.drawBegin(screenX, screenY);
    await this.drawEnd(screenX, screenY);
  }

  private snapDrawPoint(screenX: number, screenY: number, from: Point2D | undefined): { point: Point2D; snappedToNode: boolean } {
    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(this.dragTolerancePx, this.state.transform.scale);
    if (this.state.nodeSnapEnabled) {
      const node = this.selection.findNearestNode({ worldPoint: world, walls: this.walls, thresholdMeters: tol });
      if (node) return { point: node, snappedToNode: true };
    }
    const angled = from !== undefined && this.state.snapEnabled ? this.snap.snapPoint(world, from) : world;
    if (this.state.nodeSnapEnabled) {
      const onAxis = this.snapToWallAxis(world, angled, from, tol, this.walls);
      if (onAxis) return { point: onAxis, snappedToNode: true };
    }
    return { point: angled, snappedToNode: false };
  }

  /**
   * Enganche al EJE de un muro (encuentro en T): sin él, un tabique que llega a
   * la mitad de otro muro queda unos centímetros corto o largo y la topología
   * no lo une, así que el recinto no se divide. Si hay snap angular, se toma el
   * cruce del rayo ya enganchado en ángulo con el eje (el tabique sale recto Y
   * toca el muro); si no, la proyección del dedo sobre el eje. Solo el tramo
   * interior: los extremos son nodos y tienen su propio enganche.
   */
  private snapToWallAxis(
    world: Point2D,
    angled: Point2D,
    from: Point2D | undefined,
    tol: number,
    walls: readonly Wall[],
  ): Point2D | null {
    let best: { p: Point2D; d: number } | null = null;
    for (const w of walls) {
      if (!w.isStraight) continue;
      const a = w.startPoint;
      const b = w.endPoint;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      let p: Point2D | null = null;
      if (from !== undefined && (angled.x !== world.x || angled.y !== world.y)) {
        // Cruce de la recta from→angled con el eje del muro.
        const rx = angled.x - from.x;
        const ry = angled.y - from.y;
        const den = rx * dy - ry * dx;
        if (Math.abs(den) > 1e-12) {
          const t = ((a.x - from.x) * dy - (a.y - from.y) * dx) / den;
          const cand = { x: from.x + rx * t, y: from.y + ry * t };
          if (Math.hypot(cand.x - angled.x, cand.y - angled.y) <= tol) p = cand;
        }
      }
      if (!p) {
        const t = ((world.x - a.x) * dx + (world.y - a.y) * dy) / len2;
        p = { x: a.x + t * dx, y: a.y + t * dy };
      }
      const s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      const len = Math.sqrt(len2);
      // Fuera del tramo interior (o pegado a un extremo): no es una T.
      if (s * len < 0.02 || (1 - s) * len < 0.02) continue;
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d <= tol && (!best || d < best.d)) best = { p, d };
    }
    return best?.p ?? null;
  }

  private async commitWall(start: Point2D, end: Point2D): Promise<void> {
    this.patch({ wallDraft: null });
    if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH) {
      if (this.state.creation.wall === 'drag') {
        this.notify('info', 'Muro demasiado corto: arrastra al menos 10 cm.');
      }
      return;
    }

    // Los guardados van en cola: trazar el muro siguiente mientras se guarda el
    // anterior es lo normal, y dos escrituras simultáneas chocan en SQLite.
    const run = () => this.persistWall(start, end);
    this.wallCommits = this.wallCommits.then(run, run);
    return this.wallCommits;
  }

  private async persistWall(start: Point2D, end: Point2D): Promise<void> {
    const vertical = this.creationVertical.wall;
    let height = this.defaults.wallHeight;
    let level: string | undefined;
    if (vertical) {
      const profile = resolveWallProfile(vertical, this.levelElevations);
      const problem = profileProblem(profile);
      if (problem) {
        this.notify('error', `${problem} Ajusta la base y el tope en el selector del muro.`);
        return;
      }
      height = meters(profileHeight(profile));
      level = hostLevelOf(vertical, this.levelElevations);
    }
    this.patch({ busy: true });
    try {
      const created = await this.services.useCases.createWall.execute({
        roomId: this.roomId,
        startPoint: start,
        endPoint: end,
        thickness: this.defaults.wallThickness,
        height,
        vertical: vertical ?? undefined,
        properties: this.scopeProps(level),
      });
      this.warnOnAcuteMeeting(created.wall);
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo crear el muro. Verifica que sea válido.');
    } finally {
      this.patch({ busy: false });
    }
  }

  private async addVano(kind: 'door' | 'window', world: Point2D, tol: Meters): Promise<void> {
    const host = this.nearestWall(world, tol);
    if (!host) {
      this.notify('info', `Toca sobre un muro para colocar ${kind === 'door' ? 'una puerta' : 'una ventana'}.`);
      return;
    }

    const width = kind === 'door' ? this.defaults.doorWidth : this.defaults.windowWidth;
    const height = kind === 'door' ? this.defaults.doorHeight : this.defaults.windowHeight;

    // El punto tocado marca el CENTRO deseado; el dominio guarda el borde.
    const centerOffset = this.projectOntoWall(world, host);
    const offsetAlongWall = this.clampVanoOffset(centerOffset, width, host);

    this.patch({ busy: true });
    try {
      const useCase = kind === 'door' ? this.services.useCases.createDoor : this.services.useCases.createWindow;
      const result = await useCase.execute({
        roomId: this.roomId,
        parentWallId: wallId(host.id as string),
        offsetAlongWall,
        offsetPerpendicular: meters(0),
        width,
        height,
        properties: this.scopeProps(this.levelScope ? this.levelOf(host, this.levelScope) : undefined),
      });
      const created = 'door' in result ? result.door : result.window;
      await this.reload();

      this.patch({ selectedId: created.id });
      if (result.warnings.length > 0) {
        this.notify('info', result.warnings.map((w) => w.message).join(' · '));
      }
    } catch (err) {
      this.fail(err, `No se pudo crear ${kind === 'door' ? 'la puerta' : 'la ventana'}.`);
    } finally {
      this.patch({ busy: false });
    }
  }

  private async addColumn(world: Point2D): Promise<void> {
    const vertical = this.creationVertical.column;
    let height = this.defaults.columnHeight;
    if (vertical) {
      const e = resolveExtent(vertical, this.levelElevations);
      if (e.top - e.base < 0.1) {
        this.notify('error', 'El tope de la columna queda por debajo de su base. Ajusta el selector.');
        return;
      }
      height = meters(e.top - e.base);
    }
    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.createColumn.execute({
        roomId: this.roomId,
        position: world,
        diameter: this.defaults.columnDiameter,
        sectionShape: this.state.creation.column,
        height,
        vertical: vertical ?? undefined,
        properties: this.scopeProps(vertical?.baseLevelId),
      });
      await this.reload();
      this.patch({ selectedId: result.column.id });
      if (result.warnings.length > 0) {
        this.notify('info', result.warnings.map((w) => w.message).join(' · '));
      }
    } catch (err) {
      this.fail(err, 'No se pudo crear la columna.');
    } finally {
      this.patch({ busy: false });
    }
  }

  // --- Suelo (F6a) -------------------------------------------------------

  /** Suelo vivo del recinto, o `null`. */
  floorOfZone(zoneId: string): Floor | null {
    return (this.state.objects.find((o) => o instanceof Floor && floorZoneId(o) === zoneId) as Floor | undefined) ?? null;
  }

  /**
   * Suelos a dibujar: los del alcance cuyo recinto está cerrado, con el
   * contorno NETO de ese recinto (el suelo no tiene contorno propio).
   */
  get floorViews(): { id: string; zoneId: string; polygon: readonly Point2D[]; thickness: number }[] {
    const out: { id: string; zoneId: string; polygon: readonly Point2D[]; thickness: number }[] = [];
    for (const o of this.scopedObjects) {
      if (!(o instanceof Floor)) continue;
      const zoneId = floorZoneId(o);
      const room = zoneId ? this.state.rooms.find((r) => r.id === zoneId) : undefined;
      const polygon = room?.netPolygon?.length ? room.netPolygon : room?.polygon;
      if (!zoneId || !polygon || polygon.length < 3) continue;
      out.push({ id: o.id as string, zoneId, polygon, thickness: (o.thickness as number | undefined) ?? 0 });
    }
    return out;
  }

  /** Tocar un recinto con la herramienta Suelo le pone suelo (uno por recinto). */
  private async addFloor(screenX: number, screenY: number): Promise<void> {
    const zone = this.zoneAt(screenX, screenY);
    if (!zone?.id) {
      this.notify('info', 'Toca dentro de un recinto cerrado para ponerle suelo.');
      return;
    }
    await this.addFloorToZone(zone.id);
  }

  /** Pone suelo a un recinto (desde la herramienta o desde la hoja del recinto). */
  async addFloorToZone(zoneId: string): Promise<void> {
    const zone = this.state.rooms.find((r) => r.id === zoneId);
    if (!zone?.id) return;
    if (this.floorOfZone(zone.id)) {
      this.patch({ selectedZoneId: zone.id, selectedId: null });
      this.notify('info', `${zone.name ?? 'El recinto'} ya tiene suelo.`);
      return;
    }
    this.patch({ busy: true });
    try {
      await this.services.useCases.createFloor.execute({
        roomId: this.roomId,
        zoneId: zone.id,
        thickness: this.defaults.floorThickness,
        properties: this.scopeProps(),
      });
      await this.reload();
      this.patch({ selectedZoneId: zone.id, selectedId: null });
      this.notify('success', `Suelo en ${zone.name ?? 'el recinto'}.`);
    } catch (err) {
      this.fail(err, 'No se pudo crear el suelo.');
    } finally {
      this.patch({ busy: false });
    }
  }

  /** Quita el suelo de un recinto (un paso de deshacer). */
  async removeZoneFloor(zoneId: string): Promise<void> {
    const floor = this.floorOfZone(zoneId);
    if (!floor) return;
    this.patch({ busy: true });
    try {
      await this.services.useCases.deleteObject.execute({ objectId: floor.id });
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo quitar el suelo.');
    } finally {
      this.patch({ busy: false });
    }
  }

  /** Espesor del suelo del recinto (un paso de deshacer). */
  async setZoneFloorThickness(zoneId: string, thickness: Meters): Promise<void> {
    const floor = this.floorOfZone(zoneId);
    if (!floor) return;
    this.select(floor.id);
    await this.updateSelectedProperty('thickness', thickness);
    this.selectZone(zoneId);
  }

  private pickMeasureTarget(world: Point2D, tol: Meters): void {
    const host = this.nearestWall(world, tol);
    if (!host) {
      this.notify('info', 'Toca el muro que vas a medir.');
      return;
    }
    this.patch({ measureTargetId: wallId(host.id as string), selectedId: host.id });
  }

  // -------------------------------------------------------------------------
  // Acciones sobre la selección
  // -------------------------------------------------------------------------

  async deleteSelected(): Promise<void> {
    const sel = this.selected;
    if (!sel) return;

    // Borrar el propio Recinto desde el editor dejaría todos sus objetos
    // huérfanos y la pantalla sin contexto. Se hace desde el Dashboard.
    if (sel instanceof Room) {
      this.notify('info', 'El Recinto se elimina desde la lista de Recintos, no desde el editor.');
      return;
    }

    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.deleteObject.execute({ objectId: sel.id });

      this.patch({ selectedId: null });
      await this.reload();
      this.notify('success', result.deletedCount > 1
        ? `Eliminados ${result.deletedCount} objetos (incluye vanos dependientes).`
        : 'Objeto eliminado.');
    } catch (err) {
      this.fail(err, 'No se pudo eliminar el objeto.');
    } finally {
      this.patch({ busy: false });
    }
  }

  async updateSelectedProperty(property: string, newValue: unknown): Promise<void> {
    const sel = this.selected;
    if (!sel) return;

    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.updateObjectProperty.execute({
        objectId: sel.id,
        property,
        newValue,
      });
      await this.reload();
      if (result.warnings.length > 0) {
        this.notify('info', result.warnings.map((w) => w.message).join(' · '));
      }
    } catch (err) {
      this.fail(err, 'No se pudo actualizar la propiedad.');
    } finally {
      this.patch({ busy: false });
    }
  }

  /**
   * Cambia las restricciones de nivel del muro o columna seleccionado (y la
   * altura que se deriva de ellas) en un solo paso de deshacer.
   */
  async updateSelectedVertical(vertical: WallVertical | VerticalExtent): Promise<boolean> {
    const sel = this.selected;
    if (!(sel instanceof Wall) && !(sel instanceof Column)) return false;
    let height: number;
    if (sel instanceof Wall) {
      if (!('start' in vertical)) return false;
      const profile = resolveWallProfile(vertical, this.levelElevations);
      const problem = profileProblem(profile);
      if (problem) {
        this.notify('error', problem);
        return false;
      }
      height = profileHeight(profile);
    } else {
      if ('start' in vertical) return false;
      const e = resolveExtent(vertical, this.levelElevations);
      if (e.top - e.base < 0.1) {
        this.notify('error', 'El tope de la columna queda por debajo de su base.');
        return false;
      }
      height = e.top - e.base;
    }
    this.patch({ busy: true });
    try {
      await this.services.useCases.updateObjectProperty.execute({
        objectId: sel.id,
        property: 'vertical',
        newValue: vertical,
        also: { height: meters(height) },
      });
      await this.reload();
      return true;
    } catch (err) {
      this.fail(err, 'No se pudieron cambiar los niveles del elemento.');
      return false;
    } finally {
      this.patch({ busy: false });
    }
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
  private async syncRoomGeometry(objects: readonly RevitObjectBase[], rooms: readonly DetectedRoom[]): Promise<boolean> {
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
  // Medición
  // -------------------------------------------------------------------------

  /**
   * Persiste una medición contra el muro elegido con la herramienta `measure`.
   *
   * GAP CERRADO: la pantalla llamaba a `HuepaDeviceManager.measure()` y el
   * resultado solo se pintaba y se guardaba en el store de Zustand. Nada
   * llegaba nunca a la tabla `measurements` — la medición se perdía al cerrar
   * la app, aunque CaptureMeasurementUseCase existía desde el principio.
   */
  async captureMeasurement(
    method: 'ble' | 'manual',
    manualValue?: Meters,
    bleSamples?: readonly number[],
  ): Promise<Meters | null> {
    const target = this.state.measureTargetId;
    if (!target) {
      this.notify('info', 'Elige primero el muro a medir con la herramienta Medir.');
      return null;
    }

    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.captureMeasurement.execute({
        roomId: this.roomId,
        wallId: target,
        method,
        value: manualValue,
        samples: bleSamples,
      });
      this.notify(
        'success',
        `Medición guardada: ${Number(result.average).toFixed(3)} m` +
          (result.outliers.length > 0 ? ` (${result.outliers.length} muestra(s) descartada(s))` : ''),
      );
      await this.reload();
      return result.average;
    } catch (err) {
      this.fail(err, 'No se pudo guardar la medición.');
      return null;
    } finally {
      this.patch({ busy: false });
    }
  }

  /**
   * Aplica una distancia medida como longitud del muro destino: mueve su
   * extremo final a lo largo de su propia dirección hasta que mida `distance`.
   * Es la razón de medir con el láser en campo — sin esto la medición queda
   * como un dato suelto que no corrige el dibujo.
   */
  async applyMeasurementToWall(distance: Meters): Promise<void> {
    const target = this.state.measureTargetId;
    const wall = target ? this.walls.find((w) => (w.id as string) === (target as unknown as string)) : null;
    if (!wall) {
      this.notify('info', 'Elige primero el muro a corregir con la herramienta Medir.');
      return;
    }

    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      this.notify('error', 'El muro es degenerado: no tiene dirección a lo largo de la cual aplicar la medida.');
      return;
    }

    const newEnd: Point2D = {
      x: wall.startPoint.x + (dx / len) * (distance as number),
      y: wall.startPoint.y + (dy / len) * (distance as number),
    };

    this.patch({ busy: true });
    try {
      // El extremo final se mueve CON sus uniones: la esquina sigue cerrada.
      const joints = this.jointWalls(wall);
      if (joints) {
        await this.services.useCases.reshapeWalls.execute({
          changes: planEndMove(joints, wall.id as string, 'end', newEnd),
        });
      } else {
        await this.services.useCases.updateObjectProperty.execute({
          objectId: wall.id,
          property: 'endPoint',
          newValue: newEnd,
        });
      }
      await this.reload();
      this.notify('success', `Muro ajustado a ${Number(distance).toFixed(3)} m.`);
    } catch (err) {
      this.fail(err, 'No se pudo aplicar la medición al muro.');
    } finally {
      this.patch({ busy: false });
    }
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** Snap para el extremo de un muro que se está arrastrando. */
  private snapEndpoint(world: Point2D, otherEnd: Point2D): Point2D {
    return this.state.snapEnabled ? this.snap.snapPoint(world, otherEnd) : world;
  }

  private nearestWall(world: Point2D, tol: Meters): Wall | null {
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
  private projectOntoWall(world: Point2D, wall: Wall): number {
    const { offsetAlong } = projectPointToWall(world, wall);
    return Math.max(0, Math.min(offsetAlong as number, wall.length as number));
  }

  /**
   * Coloca el vano de forma que quepa entero dentro del muro. Sin este ajuste,
   * tocar cerca de un extremo produce un vano que sobresale — que el dominio
   * acepta con un warning, pero que no es lo que el usuario quiso indicar.
   */
  private clampVanoOffset(centerAlong: number, width: Meters, wall: Wall): Meters {
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
  private warnOnAcuteMeeting(created: Wall): void {
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

  // -------------------------------------------------------------------------
  // Fotos de campo (SPDS)
  // -------------------------------------------------------------------------

  /** Relee los marcadores de foto del Recinto. */
  async reloadPhotoMarkers(): Promise<void> {
    try {
      const photos = await this.services.store.listPhotoMarkers(this.roomId);
      this.patch({
        photoMarkers: photos.flatMap((photo) => {
          const marker = photo.metadata.marker;
          if (!marker || marker.visible === false) return [];
          return [
            {
              id: photo.id as string,
              position: marker.position,
              direction: marker.direction,
              label: photo.metadata.bimCode,
            },
          ];
        }),
      });
    } catch {
      // Un fallo leyendo marcadores no debe impedir dibujar la planta: son
      // información añadida, no la geometría del levantamiento.
      this.patch({ photoMarkers: [] });
    }
  }

  /** Descarta el punto de captura pendiente (la vista canceló la cámara). */
  clearPendingPhotoPoint(): void {
    this.patch({ pendingPhotoPoint: null });
  }

  /**
   * Ancla una foto ya capturada al punto pendiente. La vista llama a esto tras
   * guardar la foto, porque es ella quien tiene la cámara.
   */
  async attachPhotoMarker(photoId: AuditPhotoId, direction?: number): Promise<void> {
    const point = this.state.pendingPhotoPoint;
    if (!point) return;

    try {
      const photo = await this.services.store.readAuditPhoto(photoId);
      if (!photo) return;

      photo.patchMetadata({ marker: { position: point, direction, visible: true } });
      await this.services.store.updateAuditPhoto(photoId, { metadata_json: photo.metadata_json });

      this.patch({ pendingPhotoPoint: null });
      // Recarga completa: la captura apiló un comando y Deshacer debe habilitarse.
      await this.reload();
      this.notify('success', 'Foto anclada a la planta.');
    } catch (err) {
      this.fail(err, 'No se pudo anclar la foto a la planta.');
    }
  }

  /** Marcador de foto bajo un punto de pantalla, o `null`. */
  photoMarkerAt(screenX: number, screenY: number, touchTolerancePx: number): PhotoMarkerView | null {
    const world = this.screenToWorld(screenX, screenY);
    const tol = (touchTolerancePx / this.state.transform.scale) as number;

    let best: PhotoMarkerView | null = null;
    let bestDistance = tol;
    for (const marker of this.state.photoMarkers) {
      const d = Math.hypot(world.x - marker.position.x, world.y - marker.position.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = marker;
      }
    }
    return best;
  }


}
