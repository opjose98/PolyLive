// =============================================================================
// EditorGestures.ts — Toque y arrastre de handles
//
// EditorController se divide en capas (una por responsabilidad) para que ningún
// archivo concentre todo el editor: EditorCore (estado, vista, consultas,
// ciclo de vida, deshacer) → EditorGestures (toque y arrastre) → EditorCreation
// (muros, vanos, suelos, acciones sobre la selección) → EditorController
// (recintos, medición y fotos). La API pública es la de EditorController.
// =============================================================================

import { RevitObjectBase } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';

import { lineShape } from '../../domain/geometry/shapes';
import { touchToleranceMeters } from '../canvas/SelectionService';
import { JointWall, WallEndsChange, endsAt, planEndMove, planWallTranslate } from '../../domain/topology/joints';

import {
  EditorCore,
  DragTarget,
  cloneWith,
} from './EditorCore';

export abstract class EditorGestures extends EditorCore {
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
      case 'opening':
        return this.addGenericOpening(world, tol);
      case 'measure':
        return this.pickMeasureTarget(world, tol);
      case 'split':
        return this.splitTap(world, tol);
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
    // Un manejador, o el cuerpo de un objeto pequeño seleccionado (columna, puerta,
    // ventana: se mueve por su centro). Antes una columna solo se arrastraba acertando
    // su punto central. En un muro, arrastrar su cuerpo sigue moviendo el plano.
    const small = sel instanceof Column || sel instanceof Door || sel instanceof Window;
    const handle =
      this.selection.hitTestHandle({ worldPoint: world, selectedObject: sel, thresholdMeters: tol }) ??
      (small && this.objectAt(screenX, screenY, touchTolerancePx)?.id === sel.id
        ? (this.selection.handlesFor(sel).find((h) => h.kind === 'center') ?? null)
        : null);
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
  protected dragTargetAt(screenX: number, screenY: number): DragTarget | null {
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
      const extra = this.extraSnap(world, tol as number, others);
      if (extra) {
        point = extra;
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
  protected jointWalls(wall: Wall): JointWall[] | null {
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
  protected previewPlan(sel: Wall, plan: readonly WallEndsChange[]): { main: RevitObjectBase; linked: RevitObjectBase[] } {
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

}
