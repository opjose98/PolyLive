// =============================================================================
// EditorCreation.ts — Creación de objetos y acciones sobre la selección
//
// EditorController se divide en capas (una por responsabilidad) para que ningún
// archivo concentre todo el editor: EditorCore (estado, vista, consultas,
// ciclo de vida, deshacer) → EditorGestures (toque y arrastre) → EditorCreation
// (muros, vanos, suelos, acciones sobre la selección) → EditorController
// (recintos, medición y fotos). La API pública es la de EditorController.
// =============================================================================

import { Point2D, Meters, meters } from '../../domain/geometry/types';
import { wallId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Floor, circlePolygon, floorZoneId, netFloorArea, rectPolygon } from '../../domain/objects/floor';

import { ElevationSnapshotCommand } from '../commands/ElevationSnapshotCommand';
import { splitSnapCandidates } from '../../domain/objects/wall-split';
import { isPointInPolygon } from '../../domain/geometry/polygon-utils';
import {
  VerticalExtent,
  WallVertical,
  hostLevelOf,
  profileHeight,
  profileProblem,
  resolveExtent,
  resolveWallProfile,
} from '../../domain/objects/vertical';
import { touchToleranceMeters } from '../canvas/SelectionService';
import { diagnostics } from '../../shared/diagnostics';

import {
  EditorState,
  MIN_WALL_LENGTH,
  ShapeMethod,
} from './EditorCore';
import { EditorGestures } from './EditorGestures';

/** Suelo tal como se dibuja: el de un recinto (`zoneId`) o uno libre, con sus vacíos. */
export interface FloorView {
  readonly id: string;
  readonly zoneId: string | null;
  readonly polygon: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
  readonly thickness: number;
}

export abstract class EditorCreation extends EditorGestures {
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
    if (this.state.tool === 'section') {
      const { point } = this.snapDrawPoint(screenX, screenY, undefined);
      this.patch({ sectionDraft: { a: point, b: point } });
      return;
    }
    if (this.shapeDragActive) {
      const { point } = this.snapDrawPoint(screenX, screenY, undefined);
      this.patch({ shapeDraft: { mode: this.state.tool === 'void' ? 'void' : 'floor', points: [point], cursor: point } });
      return;
    }
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
    const sec = this.state.sectionDraft;
    if (sec && this.state.tool === 'section') {
      this.patch({ sectionDraft: { a: sec.a, b: this.snapDrawPoint(screenX, screenY, sec.a).point } });
      return;
    }
    const shape = this.state.shapeDraft;
    if (shape && this.shapeDragActive) {
      const { point } = this.snapDrawPoint(screenX, screenY, this.shapeMethodActive === 'rect' ? undefined : shape.points[0]);
      this.patch({ shapeDraft: { ...shape, cursor: point } });
      return;
    }
    const draft = this.state.wallDraft;
    if (!draft || this.state.tool !== 'wall') return;
    const { point, snappedToNode } = this.snapDrawPoint(screenX, screenY, draft.start ?? undefined);
    this.patch({ wallDraft: { ...draft, end: point, snappedToNode } });
  }

  async drawEnd(screenX: number, screenY: number): Promise<void> {
    if (this.state.tool === 'section') {
      this.drawMove(screenX, screenY);
      const sec = this.state.sectionDraft;
      if (!sec) return;
      const long = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y) >= 0.3;
      this.patch({ sectionDraft: null, ...(long ? { sectionLine: sec } : {}) });
      if (!long) this.notify('info', 'Arrastra una línea de al menos 30 cm por donde quieres cortar.');
      return;
    }
    if (this.shapeDragActive) {
      this.drawMove(screenX, screenY);
      const poly = this.shapeDraftPolygon;
      const mode = this.state.shapeDraft?.mode ?? 'floor';
      this.patch({ shapeDraft: null });
      if (poly && netFloorArea(poly) >= 0.01) await this.commitShape(mode, poly);
      return;
    }
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
    if (this.state.sectionDraft) this.patch({ sectionDraft: null });
    if (this.shapeDragActive && this.state.shapeDraft) this.patch({ shapeDraft: null });
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

  protected async wallTap(screenX: number, screenY: number): Promise<void> {
    if (this.state.creation.wall === 'drag') {
      this.notify('info', 'Arrastra el dedo de un extremo al otro para trazar el muro.');
      return;
    }
    this.drawBegin(screenX, screenY);
    await this.drawEnd(screenX, screenY);
  }

  protected snapDrawPoint(screenX: number, screenY: number, from: Point2D | undefined): { point: Point2D; snappedToNode: boolean } {
    const world = this.screenToWorld(screenX, screenY);
    const tol = touchToleranceMeters(this.dragTolerancePx, this.state.transform.scale);
    if (this.state.nodeSnapEnabled) {
      const node = this.selection.findNearestNode({ worldPoint: world, walls: this.walls, thresholdMeters: tol });
      if (node) return { point: node, snappedToNode: true };
    }
    const extra = this.extraSnap(world, tol as number, this.walls);
    if (extra) return { point: extra, snappedToNode: true };
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
  protected snapToWallAxis(
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

  protected async commitWall(start: Point2D, end: Point2D): Promise<void> {
    this.patch({ wallDraft: null });
    if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH) {
      if (this.state.creation.wall === 'drag') {
        this.notify('info', 'Muro demasiado corto: arrastra al menos 10 cm.');
      } else {
        // Punto a punto: el segundo toque cayó sobre el primero. Se conserva el inicio
        // y se avisa (antes se perdía el primer punto en silencio).
        this.patch({ wallDraft: { start, end: null, snappedToNode: false } });
        this.notify('info', 'El segundo punto está sobre el primero: toca el final del muro.');
      }
      return;
    }

    // Los guardados van en cola: trazar el muro siguiente mientras se guarda el
    // anterior es lo normal, y dos escrituras simultáneas chocan en SQLite.
    const run = () => this.persistWall(start, end);
    this.wallCommits = this.wallCommits.then(run, run);
    return this.wallCommits;
  }

  protected async persistWall(start: Point2D, end: Point2D): Promise<void> {
    const vertical = this.creationVertical.wall;
    let height = this.defaults.wallHeight;
    let level: string | undefined;
    if (vertical) {
      const len = Math.hypot(end.x - start.x, end.y - start.y);
      const profile = resolveWallProfile(vertical, this.levelElevations, len);
      const problem = profileProblem(profile);
      if (problem) {
        this.notify('error', `${problem} Ajusta la base y el tope en el selector del muro.`);
        return;
      }
      height = meters(profileHeight(profile));
      level = hostLevelOf(vertical, this.levelElevations, len);
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

  protected async addVano(kind: 'door' | 'window', world: Point2D, tol: Meters): Promise<void> {
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

  protected async addColumn(world: Point2D): Promise<void> {
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

  // --- Vano genérico en planta (F6b) -------------------------------------
  //
  // Un hueco sin puerta ni ventana (paso, ducto, hueco de obra). Vive en el
  // alzado del muro (WallElevation), como los que se crean allí; aquí solo se
  // elige el muro y el punto. Es un paso de la historia compartida.

  protected async loadGenericOpenings(): Promise<EditorState['genericOpenings']> {
    try {
      const elevations = await this.services.elevations.listElevations(this.roomId);
      return elevations.flatMap((e) =>
        e.openings.filter((o) => o.type === 'opening').map((o) => ({ wallId: e.wallId, xOffset: o.xOffset, width: o.width })),
      );
    } catch (err) {
      // Los vanos genéricos son un añadido: sin ellos la planta se dibuja igual.
      diagnostics.warn('editor', 'No se pudieron leer los vanos genéricos', err);
      return [];
    }
  }

  protected async addGenericOpening(world: Point2D, tol: Meters): Promise<void> {
    const host = this.nearestWall(world, tol);
    if (!host) {
      this.notify('info', 'Toca sobre un muro para abrir un vano.');
      return;
    }
    const width = this.defaults.openingWidth;
    const xOffset = this.clampVanoOffset(this.projectOntoWall(world, host), width, host) as number;
    this.patch({ busy: true });
    try {
      const svc = this.services.elevations;
      const before = await svc.getElevation(host);
      const r = await svc.addOpening(before, host, { type: 'opening', xOffset, width: width as number });
      await this.services.commandStack.execute(
        new ElevationSnapshotCommand((e) => svc.saveElevation(e), { elevation: before, vanos: new Map() }, { elevation: r.elevation, vanos: new Map() }),
      );
      await this.reload();
      if (r.validation.severity === 'warning' && r.validation.message) this.notify('info', r.validation.message);
    } catch (err) {
      this.fail(err, 'No se pudo abrir el vano.');
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
  get floorViews(): FloorView[] {
    const out: FloorView[] = [];
    for (const o of this.scopedObjects) {
      if (!(o instanceof Floor)) continue;
      if (o.outline && o.outline.length >= 3 && !floorZoneId(o)) {
        out.push({ id: o.id as string, zoneId: null, polygon: o.outline, holes: o.holes ?? [], thickness: (o.thickness as number | undefined) ?? 0 });
        continue;
      }
      const zoneId = floorZoneId(o);
      const room = zoneId ? this.state.rooms.find((r) => r.id === zoneId) : undefined;
      const polygon = room?.netPolygon?.length ? room.netPolygon : room?.polygon;
      if (!zoneId || !polygon || polygon.length < 3) continue;
      out.push({ id: o.id as string, zoneId, polygon, holes: o.holes ?? [], thickness: (o.thickness as number | undefined) ?? 0 });
    }
    return out;
  }

  /** Tocar un recinto con la herramienta Suelo le pone suelo (uno por recinto). */
  protected async addFloor(screenX: number, screenY: number): Promise<void> {
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

  protected pickMeasureTarget(world: Point2D, tol: Meters): void {
    const host = this.nearestWall(world, tol);
    if (!host) {
      this.notify('info', 'Toca el muro que vas a medir.');
      return;
    }
    this.patch({ measureTargetId: wallId(host.id as string), selectedId: host.id });
  }

  // --- Suelos libres y vacíos (formas) -----------------------------------
  //
  // Polígono: cada toque fija un vértice (con el enganche del muro) y tocar el
  // primero, o «Cerrar», lo termina. Rectángulo y círculo: un arrastre de una
  // esquina a la opuesta, o del centro al borde. Un vacío se agrega al suelo
  // (libre o de recinto) que contiene su centro.

  /** Herramienta de forma activa: suelo libre o vacío, con su método. */
  get shapeMethodActive(): ShapeMethod | null {
    const { tool, creation } = this.state;
    if (tool === 'void') return creation.void;
    if (tool === 'floor' && creation.floor !== 'zone') return creation.floor;
    return null;
  }

  /** Rectángulo y círculo se trazan arrastrando (la vista no debe panear). */
  get shapeDragActive(): boolean {
    const m = this.shapeMethodActive;
    return m === 'rect' || m === 'circle';
  }

  /** Polígono que resultaría de la forma en trazado (para dibujarla y para crearla). */
  get shapeDraftPolygon(): Point2D[] | null {
    const d = this.state.shapeDraft;
    const m = this.shapeMethodActive;
    if (!d || !m || d.points.length === 0) return null;
    if (m === 'polygon') return d.cursor ? [...d.points, d.cursor] : [...d.points];
    if (!d.cursor) return null;
    if (m === 'rect') return rectPolygon(d.points[0], d.cursor);
    const r = Math.hypot(d.cursor.x - d.points[0].x, d.cursor.y - d.points[0].y);
    return r > 0.01 ? circlePolygon(d.points[0], r) : null;
  }

  protected async shapeTap(screenX: number, screenY: number, tol: Meters): Promise<void> {
    const m = this.shapeMethodActive;
    if (!m) return;
    if (m !== 'polygon') {
      this.notify('info', m === 'rect' ? 'Arrastra de una esquina a la opuesta.' : 'Arrastra del centro al borde.');
      return;
    }
    const mode = this.state.tool === 'void' ? 'void' : 'floor';
    const d = this.state.shapeDraft;
    const pts = d?.points ?? [];
    const { point } = this.snapDrawPoint(screenX, screenY, pts[pts.length - 1]);
    if (pts.length >= 3 && Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= (tol as number)) {
      await this.closeShape();
      return;
    }
    this.patch({ shapeDraft: { mode, points: [...pts, point], cursor: null } });
  }

  /** Termina el polígono en trazado (botón «Cerrar» o tocar el primer vértice). */
  async closeShape(): Promise<void> {
    const d = this.state.shapeDraft;
    if (!d || d.points.length < 3) return;
    this.patch({ shapeDraft: null });
    await this.commitShape(d.mode, [...d.points]);
  }

  undoShapePoint(): void {
    const d = this.state.shapeDraft;
    if (!d) return;
    this.patch({ shapeDraft: d.points.length > 1 ? { ...d, points: d.points.slice(0, -1) } : null });
  }

  /** Suelo (libre o de recinto) que contiene el punto, para recibir un vacío. */
  floorAtPoint(p: Point2D): Floor | null {
    for (const o of this.scopedObjects) {
      if (!(o instanceof Floor)) continue;
      const poly = o.outline?.length ? o.outline : this.floorViews.find((f) => f.id === (o.id as string))?.polygon;
      if (poly && poly.length >= 3 && isPointInPolygon(p, poly)) return o;
    }
    return null;
  }

  protected async commitShape(mode: 'floor' | 'void', poly: Point2D[]): Promise<void> {
    if (netFloorArea(poly) < 0.01) {
      this.notify('info', 'La forma no tiene área.');
      return;
    }
    this.patch({ busy: true });
    try {
      if (mode === 'floor') {
        const { floor } = await this.services.useCases.createFloor.execute({
          roomId: this.roomId,
          outline: poly,
          thickness: this.defaults.floorThickness,
          properties: this.scopeProps(),
        });
        await this.reload();
        this.patch({ selectedId: floor.id });
        this.notify('success', `Suelo libre de ${netFloorArea(poly).toFixed(2)} m².`);
        return;
      }
      const c = poly.reduce((a, q) => ({ x: a.x + q.x / poly.length, y: a.y + q.y / poly.length }), { x: 0, y: 0 });
      const host = this.floorAtPoint(c);
      if (!host) {
        this.notify('info', 'Dibuja el vacío dentro de un suelo (de recinto o libre).');
        return;
      }
      await this.services.useCases.updateObjectProperty.execute({
        objectId: host.id,
        property: 'holes',
        newValue: [...(host.holes ?? []), poly],
      });
      await this.reload();
      this.notify('success', `Vacío de ${netFloorArea(poly).toFixed(2)} m² en el suelo.`);
    } catch (err) {
      this.fail(err, mode === 'floor' ? 'No se pudo crear el suelo.' : 'No se pudo crear el vacío.');
    } finally {
      this.patch({ busy: false });
    }
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
      // El aviso "eliminado · Deshacer" lo da la vista; aquí solo lo que ella no sabe.
      if (result.deletedCount > 1) this.notify('info', `Se eliminaron también ${result.deletedCount - 1} vano(s) del muro.`);
    } catch (err) {
      this.fail(err, 'No se pudo eliminar el objeto.');
    } finally {
      this.patch({ busy: false });
    }
  }

  /**
   * Parte el muro seleccionado a `distance` m de su arranque (H-74): el primer
   * tramo sigue seleccionado y el segundo es un muro nuevo con los vanos que
   * caen en él. Devuelve `false` si no se pudo.
   */
  async splitSelectedWall(distance: Meters): Promise<boolean> {
    const sel = this.selected;
    return sel instanceof Wall ? this.splitWall(sel, distance) : false;
  }

  /**
   * Herramienta Dividir muro: parte el muro bajo el dedo donde se toca. Se
   * engancha a los cruces y encuentros en T con otros muros y a la mitad.
   */
  protected async splitTap(world: Point2D, tol: Meters): Promise<void> {
    const wall = this.nearestWall(world, tol);
    if (!wall) {
      this.notify('info', 'Toca sobre el muro que quieres dividir.');
      return;
    }
    if (!wall.isStraight) {
      this.notify('info', 'Solo se pueden dividir muros rectos.');
      return;
    }
    const along = this.projectOntoWall(world, wall);
    const others = this.walls.filter((w) => w.id !== wall.id).map((w) => ({ start: w.startPoint, end: w.endPoint }));
    const snaps = splitSnapCandidates(wall.startPoint, wall.endPoint, others);
    const near = snaps.reduce<number | null>((b, d) => (Math.abs(d - along) <= Math.max(tol as number, 0.15) && (b === null || Math.abs(d - along) < Math.abs(b - along)) ? d : b), null);
    const distance = near ?? Math.round(along * 100) / 100;
    if (await this.splitWall(wall, meters(distance))) {
      this.notify('success', `Muro dividido a ${distance.toFixed(2)} m de su inicio${near !== null ? ' (encuentro con otro muro)' : ''}.`);
    }
  }

  /**
   * Muro colineal que comparte un extremo con `wall` y su mismo espesor (lo
   * que «Unir» junta con él), o null. Con dos candidatos, el del extremo final.
   */
  mergeCandidate(wall: Wall): Wall | null {
    if (!wall.isStraight) return null;
    const near = (p: Point2D, q: Point2D) => Math.hypot(p.x - q.x, p.y - q.y) <= 2e-3;
    const dir = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
    const parallel = (w: Wall) => {
      let d = Math.abs(Math.atan2(w.endPoint.y - w.startPoint.y, w.endPoint.x - w.startPoint.x) - dir) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      return d < 0.01;
    };
    const candidates = this.walls.filter(
      (w) =>
        w.id !== wall.id &&
        w.isStraight &&
        Math.abs((w.thickness as number) - (wall.thickness as number)) < 1e-6 &&
        parallel(w) &&
        [w.startPoint, w.endPoint].some((p) => near(p, wall.startPoint) || near(p, wall.endPoint)),
    );
    // Un tercer muro en el nudo (T) no impide unir: la T sigue siendo T.
    return candidates.find((w) => near(w.startPoint, wall.endPoint) || near(w.endPoint, wall.endPoint)) ?? candidates[0] ?? null;
  }

  /** Une el muro seleccionado con su tramo colineal (inverso de partir): un paso de deshacer. */
  async mergeSelectedWall(): Promise<boolean> {
    const sel = this.selected;
    if (!(sel instanceof Wall)) return false;
    const other = this.mergeCandidate(sel);
    if (!other) {
      this.notify('info', 'Este muro no tiene un tramo alineado con el que unirse.');
      return false;
    }
    this.patch({ busy: true });
    try {
      const r = await this.services.useCases.mergeWalls.execute({
        keepId: sel.id,
        removeId: other.id,
        keepVertical: this.wallVertical(sel),
        removeVertical: this.wallVertical(other),
        levels: this.levelElevations,
      });
      await this.reload();
      this.notify(
        r.mismatch ? 'info' : 'success',
        r.mismatch
          ? `Muros unidos (${r.length.toFixed(2)} m). Tenían alturas distintas en el punto común: quedó la del muro seleccionado; revísalo en el alzado.`
          : `Muros unidos: ${r.length.toFixed(2)} m.`,
      );
      return true;
    } catch (err) {
      this.fail(err, 'No se pudieron unir los muros.');
      return false;
    } finally {
      this.patch({ busy: false });
    }
  }

  protected async splitWall(sel: Wall, distance: Meters): Promise<boolean> {
    this.patch({ busy: true });
    try {
      const r = await this.services.useCases.splitWall.execute({
        wallId: sel.id,
        distance: distance as number,
        vertical: this.wallVertical(sel),
        levels: this.levelElevations,
      });
      await this.reload();
      if (r.clamped > 0) this.notify('info', `${r.clamped} vano(s) quedaban sobre el corte y se arrimaron dentro de su tramo.`);
      return true;
    } catch (err) {
      this.fail(err, 'No se pudo partir el muro.');
      return false;
    } finally {
      this.patch({ busy: false });
    }
  }

  /** `also`: otras propiedades que cambian en el MISMO paso de deshacer. */
  async updateSelectedProperty(property: string, newValue: unknown, also?: Record<string, unknown>): Promise<void> {
    const sel = this.selected;
    if (!sel) return;

    this.patch({ busy: true });
    try {
      const roomsBefore = this.state.rooms.filter((r) => r.id);
      const result = await this.services.useCases.updateObjectProperty.execute({
        objectId: sel.id,
        property,
        newValue,
        also,
      });
      await this.reload();
      if (result.warnings.length > 0) {
        this.notify('info', result.warnings.map((w) => w.message).join(' · '));
      } else {
        // Un recinto que deja de cerrarse por esta edición (p. ej. un muro pasado a
        // partición: solo los portantes cierran recintos) se avisa; antes desaparecía
        // en silencio junto con su suelo.
        const lost = roomsBefore.filter((r) => !this.state.rooms.some((n) => n.id === r.id));
        if (lost.length) {
          const names = lost.map((r) => r.name ?? 'Recinto').join(', ');
          const why = property === 'isStructural' && newValue === false ? ' (solo los muros portantes cierran recintos)' : '';
          this.notify('info', `${names} dejó de estar cerrado${why}. Deshacer lo recupera.`);
        }
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
      const profile = resolveWallProfile(vertical, this.levelElevations, sel.length as number);
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

}
