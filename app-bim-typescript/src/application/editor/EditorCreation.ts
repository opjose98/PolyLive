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
import { Floor, floorZoneId } from '../../domain/objects/floor';

import { ElevationSnapshotCommand } from '../commands/ElevationSnapshotCommand';
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

import {
  
  EditorState,
  
  
  
  
  
  
  
  MIN_WALL_LENGTH,
  
  
  
  
} from './EditorCore';
import { EditorGestures } from './EditorGestures';

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
    } catch {
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

}
