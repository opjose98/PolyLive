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
//   wall    → cada tap encadena un muro desde el vértice anterior
//   door    → tap sobre un muro inserta una puerta en ese punto
//   window  → ídem con una ventana
//   column  → tap coloca una columna libre
//   measure → tap elige el muro destino de la próxima medición BLE
//   photo   → tap fija el punto de captura y la vista abre la cámara
// =============================================================================

import { Point2D, Meters, meters, CanvasTransform } from '../../domain/geometry/types';
import { RevitObjectBase, RevitObjectId, RoomId, WallId, wallId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { distanceToSegment } from '../../domain/geometry/polygon-utils';
import { projectPointToWall, isVanoWithinWall } from '../../domain/geometry/projections';
import { AppError } from '../../shared/errors/AppError';
import { CanvasManager } from '../canvas/CanvasManager';
import { CanvasPoint, canvasPoint, MIN_SCALE, MAX_SCALE } from '../canvas/types';
import { SnapHandler } from '../canvas/SnapHandler';
import { MiterHandler } from '../canvas/MiterHandler';
import { SelectionService, Handle, touchToleranceMeters } from '../canvas/SelectionService';
import type { AppServices } from '../AppServices';
import type { RoomSuggestion } from '../use-cases/DetectRoomsUseCase';
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

export type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'column' | 'measure' | 'photo';

/** Metadatos de cada herramienta — los consume la paleta de la UI. */
export interface ToolDescriptor {
  readonly tool: EditorTool;
  readonly label: string;
  readonly icon: string;
  /** Qué hacer, en una línea, para el texto de ayuda contextual. */
  readonly hint: string;
}

export const TOOLS: readonly ToolDescriptor[] = [
  { tool: 'select', label: 'Seleccionar', icon: '⬚', hint: 'Toca un objeto para seleccionarlo; arrastra sus puntos para moverlo.' },
  { tool: 'wall', label: 'Muro', icon: '╱', hint: 'Cada toque encadena un muro desde el punto anterior.' },
  { tool: 'door', label: 'Puerta', icon: '⌷', hint: 'Toca sobre un muro para insertar una puerta en ese punto.' },
  { tool: 'window', label: 'Ventana', icon: '⊞', hint: 'Toca sobre un muro para insertar una ventana en ese punto.' },
  { tool: 'column', label: 'Columna', icon: '◉', hint: 'Toca para colocar una columna en esa posición.' },
  { tool: 'measure', label: 'Medir', icon: '↔', hint: 'Toca el muro que vas a medir con el Huepa, luego pulsa Medir.' },
  { tool: 'photo', label: 'Foto', icon: '◎', hint: 'Toca el punto desde el que quieres fotografiar; se abrirá la cámara.' },
];

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
};

export interface EditorState {
  readonly tool: EditorTool;
  readonly objects: readonly RevitObjectBase[];
  readonly vertices: readonly Point2D[];
  readonly selectedId: RevitObjectId | null;
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
  readonly gridEnabled: boolean;
  readonly nodeSnapEnabled: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly busy: boolean;
  readonly roomSuggestions: readonly RoomSuggestion[];
  /** Handle en curso de arrastre, si lo hay. */
  readonly draggingHandle: Handle | null;
  /** Último mensaje para la UI (éxito o error). La vista lo muestra y lo limpia. */
  readonly notice: { kind: 'info' | 'error' | 'success'; message: string } | null;
}

export type EditorListener = (state: EditorState) => void;

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
  private readonly defaults: EditorDefaults;

  private listeners: EditorListener[] = [];
  private state: EditorState;

  /**
   * Vértices deshechos, espejo del redo del CommandStack: `undo` la llena,
   * `redo` la vacía, y cualquier trazo nuevo la descarta (igual que cualquier
   * editor descarta el futuro al escribir sobre él). Sin esto, un Redo
   * restauraba el muro pero no el vértice, y `vertices` quedaba corto frente a
   * los muros realmente persistidos.
   */
  private undoneVertices: Point2D[] = [];

  /** Punto mundo donde empezó el arrastre en curso, para calcular el delta. */
  private dragOrigin: Point2D | null = null;

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
      vertices: [],
      selectedId: null,
      measureTargetId: null,
      pendingPhotoPoint: null,
      photoMarkers: [],
      transform: this.canvas.getTransform(),
      snapEnabled: true,
      gridEnabled: true,
      nodeSnapEnabled: true,
      canUndo: false,
      canRedo: false,
      busy: false,
      roomSuggestions: [],
      draggingHandle: null,
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

  get walls(): Wall[] {
    return this.state.objects.filter((o): o is Wall => o instanceof Wall);
  }

  get rooms(): Room[] {
    return this.state.objects.filter((o): o is Room => o instanceof Room);
  }

  get selected(): RevitObjectBase | null {
    if (!this.state.selectedId) return null;
    return this.state.objects.find((o) => o.id === this.state.selectedId) ?? null;
  }

  /** Handles del objeto seleccionado, en coordenadas mundo. */
  get selectedHandles(): Handle[] {
    const sel = this.selected;
    return sel ? this.selection.handlesFor(sel) : [];
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
   * Asegura que el Room exista, recarga los objetos y devuelve el borrador
   * pendiente (si lo hay) para que la vista pregunte al usuario qué hacer.
   * No decide por él: recuperar o descartar un trazo es una decisión suya.
   */
  async init(): Promise<{ hasDraft: boolean; draftId: string; vertices: Point2D[]; savedAt: Date } | null> {
    let room = (await this.services.store.readObject(this.roomObjectId)) as Room | null;
    if (!room) {
      room = new Room({
        id: this.roomObjectId,
        roomId: this.roomId,
        levelId: this.services.defaultLevelId,
        geometry: [],
        isOpen: true,
      });
      await this.services.store.createObject(room);
    }

    await this.reload();

    const recovered = await this.services.useCases.recoverRoomDraft.execute({ roomId: this.roomId });
    if (!recovered.hasDraft) {
      // Sin borrador: los vértices en memoria son los de la geometría del Room
      // ya persistida, para que el trazo continúe donde se dejó.
      this.patch({ vertices: room.geometry ?? [] });
      return null;
    }

    return {
      hasDraft: true,
      draftId: recovered.draftId,
      vertices: recovered.vertices,
      savedAt: recovered.savedAt,
    };
  }

  async acceptDraft(draftId: string, vertices: Point2D[]): Promise<void> {
    await this.services.useCases.recoverRoomDraft.confirmContinue(draftId);
    this.patch({ vertices });
  }

  async discardDraft(draftId: string): Promise<void> {
    await this.services.useCases.recoverRoomDraft.discard(draftId);
    const room = (await this.services.store.readObject(this.roomObjectId)) as Room | null;
    this.patch({ vertices: room?.geometry ?? [] });
  }

  /** Relee los objetos del Recinto, los marcadores de foto y el CommandStack. */
  async reload(): Promise<void> {
    const objects = await this.services.store.listObjects(this.roomId);
    await this.reloadPhotoMarkers();
    this.patch({
      objects,
      canUndo: this.services.commandStack.canUndo(),
      canRedo: this.services.commandStack.canRedo(),
      // Una selección apuntando a un objeto que ya no está (borrado, o
      // deshecho) dejaría el panel de propiedades mostrando un fantasma.
      selectedId: objects.some((o) => o.id === this.state.selectedId) ? this.state.selectedId : null,
    });
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
    });
  }

  setSnapEnabled(enabled: boolean): void {
    this.snap.setEnabled(enabled);
    this.patch({ snapEnabled: enabled });
  }

  setGridEnabled(enabled: boolean): void {
    this.patch({ gridEnabled: enabled });
  }

  setNodeSnapEnabled(enabled: boolean): void {
    this.patch({ nodeSnapEnabled: enabled });
  }

  select(id: RevitObjectId | null): void {
    this.patch({ selectedId: id });
  }

  // -------------------------------------------------------------------------
  // Viewport: pan, zoom, encuadre
  // -------------------------------------------------------------------------

  pan(dxPixels: number, dyPixels: number): void {
    const t = this.canvas.getTransform();
    this.canvas.setTransform({ ...t, offsetX: t.offsetX + dxPixels, offsetY: t.offsetY + dyPixels });
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

  /** Encuadra todo lo dibujado en el viewport dado, con un margen. */
  zoomToFit(viewportWidth: number, viewportHeight: number, paddingPx = 32): void {
    const pts: Point2D[] = [...this.state.vertices];
    for (const w of this.walls) pts.push(w.startPoint, w.endPoint);
    for (const o of this.state.objects) if (o instanceof Column) pts.push(o.position);

    if (pts.length === 0) {
      this.canvas.setTransform({ scale: 100, offsetX: viewportWidth / 2, offsetY: viewportHeight / 2 });
      this.patch({ transform: this.canvas.getTransform() });
      return;
    }

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
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
      case 'select':
        this.patch({
          selectedId: this.selection.hitTest({ worldPoint: world, objects: this.state.objects, thresholdMeters: tol })?.id ?? null,
        });
        return;
      case 'wall':
        return this.addVertex(world, tol);
      case 'door':
        return this.addVano('door', world, tol);
      case 'window':
        return this.addVano('window', world, tol);
      case 'column':
        return this.addColumn(world);
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
    this.patch({ draggingHandle: handle });
    return true;
  }

  /**
   * Cierra el arrastre persistiendo el cambio. Un arrastre de handle `center`
   * mueve el objeto entero vía MoveObjectUseCase (que arrastra los vanos con
   * él); arrastrar `start`/`end` reescribe ese extremo del muro.
   */
  async endDrag(screenX: number, screenY: number): Promise<void> {
    const handle = this.state.draggingHandle;
    const origin = this.dragOrigin;
    this.dragOrigin = null;
    this.patch({ draggingHandle: null });

    if (!handle || !origin) return;
    const sel = this.selected;
    if (!sel) return;

    const world = this.screenToWorld(screenX, screenY);
    const dx = world.x - origin.x;
    const dy = world.y - origin.y;
    // Un micro-arrastre por temblor de pulso no debe contar como una edición:
    // generaría un comando en la pila que el usuario no pidió.
    if (Math.hypot(dx, dy) < 1e-4) return;

    this.patch({ busy: true });
    try {
      if (handle.kind === 'center') {
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
        if (sel instanceof Wall) await this.syncVerticesToWalls();
      } else if (sel instanceof Wall) {
        const isStart = handle.kind === 'start';
        const moved = this.snapEndpoint(world, isStart ? sel.endPoint : sel.startPoint);
        await this.services.useCases.updateObjectProperty.execute({
          objectId: sel.id,
          property: isStart ? 'startPoint' : 'endPoint',
          newValue: moved,
        });
        await this.syncVerticesToWalls();
      }
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo mover el objeto.');
    } finally {
      this.patch({ busy: false });
    }
  }

  // -------------------------------------------------------------------------
  // Creación de objetos
  // -------------------------------------------------------------------------

  private async addVertex(rawWorld: Point2D, tol: Meters): Promise<void> {
    const previous = this.state.vertices[this.state.vertices.length - 1];
    const world = this.applySnaps(rawWorld, previous, tol);

    // Tocar dos veces sobre el mismo punto — o tocar junto al último vértice
    // con el snap a nodo activo, que arrastra el toque exactamente encima de
    // él — pediría un muro de longitud cero. CreateWallUseCase lo rechaza con
    // razón, pero el operador vería un error rojo por un doble toque
    // accidental, que es de las cosas más fáciles de hacer con guantes en obra.
    // Se ignora en silencio (con un aviso informativo, no un error).
    if (previous !== undefined && Math.hypot(world.x - previous.x, world.y - previous.y) < 1e-6) {
      this.notify('info', 'Ese punto ya es el último vértice del trazo.');
      return;
    }

    this.patch({ busy: true });
    try {
      this.undoneVertices = [];
      const nextVertices = [...this.state.vertices, world];

      if (previous !== undefined) {
        const created = await this.services.useCases.createWall.execute({
          roomId: this.roomId,
          startPoint: previous,
          endPoint: world,
          thickness: this.defaults.wallThickness,
          height: this.defaults.wallHeight,
        });
        this.warnOnAcuteMeeting(created.wall);
      }

      await this.persistVertices(nextVertices);
      await this.reload();
    } catch (err) {
      this.fail(err, 'No se pudo agregar el punto. Verifica que el muro sea válido.');
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
      });
      await this.reload();

      const created = 'door' in result ? result.door : result.window;
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
    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.createColumn.execute({
        roomId: this.roomId,
        position: world,
        diameter: this.defaults.columnDiameter,
        height: this.defaults.columnHeight,
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

      // Borrar un muro del trazo invalida los vértices que lo definían: si no
      // se recortan, "Cerrar Recinto" triangularía un polígono que ya no
      // corresponde a lo que se ve en pantalla.
      if (sel instanceof Wall) await this.syncVerticesToWalls();

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

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  async undo(): Promise<void> {
    if (this.state.busy || !this.state.canUndo) return;
    this.patch({ busy: true });
    try {
      await this.services.commandStack.undo();
      await this.syncVerticesAfterUndo();
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
      const restored = this.undoneVertices.pop();
      if (restored !== undefined) await this.persistVertices([...this.state.vertices, restored]);
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

  async closeRoom(): Promise<void> {
    if (this.state.vertices.length < 3) {
      this.notify('info', 'Se necesitan al menos 3 vértices para cerrar el Recinto.');
      return;
    }
    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.closeRoom.execute({ roomId: this.roomId });
      await this.reload();
      this.notify('success', `Recinto cerrado. Área: ${Number(result.room.area).toFixed(2)} m².`);
    } catch (err) {
      this.fail(err, 'No se pudo cerrar el Recinto. Revisa que el trazo no se cruce a sí mismo.');
    } finally {
      this.patch({ busy: false });
    }
  }

  /**
   * Detecta recintos cerrados por la topología de los muros. Es una AYUDA:
   * devuelve sugerencias que la vista lista, y cerrar de verdad sigue siendo
   * CloseRoomUseCase. Por eso el resultado va al estado en vez de escribirse.
   */
  detectRooms(): readonly RoomSuggestion[] {
    const output = this.services.useCases.detectRooms.execute({ walls: this.walls });
    this.patch({ roomSuggestions: output.suggestions });
    if (output.suggestions.length === 0) {
      this.notify(
        'info',
        output.rejected.length > 0
          ? `Sin recintos cerrados. ${output.rejected[0].reason}`
          : 'No se detectó ningún recinto cerrado con los muros actuales.',
      );
    }
    return output.suggestions;
  }

  clearRoomSuggestions(): void {
    this.patch({ roomSuggestions: [] });
  }

  /**
   * Adopta una sugerencia como el trazo activo del Recinto. Tras esto,
   * "Cerrar Recinto" triangula ese polígono.
   */
  async adoptSuggestion(suggestion: RoomSuggestion): Promise<void> {
    this.patch({ busy: true });
    try {
      await this.persistVertices([...suggestion.polygon]);
      this.patch({ roomSuggestions: [] });
      this.notify('success', `Trazo adoptado (${Number(suggestion.area).toFixed(2)} m²). Pulsa "Cerrar Recinto" para confirmarlo.`);
    } catch (err) {
      this.fail(err, 'No se pudo adoptar el recinto detectado.');
    } finally {
      this.patch({ busy: false });
    }
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
      await this.services.useCases.updateObjectProperty.execute({
        objectId: wall.id,
        property: 'endPoint',
        newValue: newEnd,
      });
      await this.syncVerticesToWalls();
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

  /**
   * Snap combinado en el orden que fija Canvas2D-interacción.md: primero el
   * snap a nodo existente (gana siempre, porque es lo que cierra la topología
   * y evita las fugas de recinto), y solo si no hay nodo cerca, el snap
   * angular respecto al vértice anterior.
   */
  private applySnaps(world: Point2D, previous: Point2D | undefined, tol: Meters): Point2D {
    if (this.state.nodeSnapEnabled) {
      const node = this.selection.findNearestNode({ worldPoint: world, walls: this.walls, thresholdMeters: tol });
      if (node) return node;
    }
    if (previous !== undefined && this.state.snapEnabled) {
      return this.snap.snapPoint(world, previous);
    }
    return world;
  }

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
   * Única ruta de escritura del trazo: deja el estado del editor, el borrador
   * de recuperación y `Room.geometry` siempre en el mismo valor. Los tres
   * tienen que coincidir porque CloseRoomUseCase triangula `Room.geometry`,
   * no los muros.
   */
  private async persistVertices(vertices: Point2D[]): Promise<void> {
    this.patch({ vertices });
    await this.services.useCases.saveRoomDraft.execute({ roomId: this.roomId, vertices, isClosed: false });
    await this.services.store.updateObject(this.roomObjectId, { geometry: vertices } as Partial<Room>);
  }

  private async syncVerticesAfterUndo(): Promise<void> {
    const removed = this.state.vertices[this.state.vertices.length - 1];
    if (removed !== undefined) this.undoneVertices.push(removed);
    await this.persistVertices(this.state.vertices.slice(0, -1));
  }

  /**
   * Reconstruye la polilínea del trazo a partir de los muros que siguen vivos.
   * Se usa tras borrar un muro o tras reescribir un extremo: el trazo deja de
   * ser una lista independiente y pasa a derivarse de lo persistido.
   */
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
    for (const other of this.walls) {
      if ((other.id as string) === (created.id as string)) continue;

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
      await this.reloadPhotoMarkers();
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

  private async syncVerticesToWalls(): Promise<void> {
    const objects = await this.services.store.listObjects(this.roomId);
    const walls = objects.filter((o): o is Wall => o instanceof Wall);
    if (walls.length === 0) {
      await this.persistVertices([]);
      return;
    }

    // Encadenar por proximidad de extremos, en el orden de creación.
    const vertices: Point2D[] = [walls[0].startPoint];
    for (const wall of walls) {
      const last = vertices[vertices.length - 1];
      const startsHere = Math.hypot(wall.startPoint.x - last.x, wall.startPoint.y - last.y) < 1e-6;
      if (!startsHere) vertices.push(wall.startPoint);
      vertices.push(wall.endPoint);
    }
    await this.persistVertices(vertices);
  }
}
