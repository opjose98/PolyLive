// =============================================================================
// SelectionService.ts — Hit-testing: qué objeto BIM hay bajo un punto
// Basado en: Canvas2D-interacción.md, SurveyInteractionMode.md
// Portado de LevON: features/editor/application/selection_service.dart
// =============================================================================
//
// POR QUÉ EXISTE: sin hit-testing, el canvas solo sabe CREAR. Todo lo que
// requiere un objeto ya existente —mover, borrar, editar propiedades, medir
// un muro, abrir su elevación— era inalcanzable desde la UI aunque el UseCase
// correspondiente existiera desde el principio (ver docs/13-AUDITORIA-UNIFICACION.md).
//
// Es lógica PURA: recibe coordenadas MUNDO (metros) y listas de objetos, y no
// sabe nada de React, de Skia ni de píxeles. La conversión pantalla→mundo es
// responsabilidad de CanvasManager, y la tolerancia táctil se le pasa ya
// convertida a metros por el llamador (píxeles / escala).
//
// ORDEN DE PRIORIDAD (importa): vano → muro → columna → recinto.
// Los vanos (Door/Window) se prueban ANTES que los muros porque viven
// literalmente encima del eje de su muro padre: con el orden de LevON
// (muro primero) una puerta nunca podría seleccionarse, el muro se la comería
// siempre. Los recintos van al final porque su área cubre a todos los demás.
// =============================================================================

import { Point2D, Meters, meters } from '../../domain/geometry/types';
import { distanceToSegment, isPointInPolygon } from '../../domain/geometry/polygon-utils';
import { RevitObjectBase, RevitObjectId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Column } from '../../domain/objects/column';
import { Room } from '../../domain/objects/room';
import { Floor } from '../../domain/objects/floor';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';

// ---------------------------------------------------------------------------
// Handles de manipulación
// ---------------------------------------------------------------------------

/**
 * Punto de agarre de un objeto seleccionado.
 * - `start` / `end`: extremos de un muro (arrastrarlos re-traza el muro)
 * - `center`: mueve el objeto entero (punto medio de un muro, centro de una columna)
 */
type HandleKind = 'start' | 'end' | 'center';

export interface Handle {
  readonly kind: HandleKind;
  readonly position: Point2D;
}

// ---------------------------------------------------------------------------
// Entrada del hit-test
// ---------------------------------------------------------------------------

interface HitTestInput {
  /** Punto tocado, en coordenadas MUNDO (metros). */
  readonly worldPoint: Point2D;
  /** Todos los objetos visibles del Recinto (ya filtrados de borrados). */
  readonly objects: readonly RevitObjectBase[];
  /** Tolerancia táctil en METROS (el llamador la deriva de píxeles / escala). */
  readonly thresholdMeters: Meters;
}

// ---------------------------------------------------------------------------
// SelectionService
// ---------------------------------------------------------------------------

export class SelectionService {
  /**
   * Devuelve el objeto bajo `worldPoint`, o `null` si no hay ninguno dentro de
   * la tolerancia. Ver el comentario de cabecera sobre el orden de prioridad.
   */
  hitTest(input: HitTestInput): RevitObjectBase | null {
    const { worldPoint, objects, thresholdMeters } = input;

    const walls = objects.filter((o): o is Wall => o instanceof Wall);
    const wallsById = new Map<string, Wall>(walls.map((w) => [w.id as string, w]));

    // 1. Vanos (Door / Window) — se posicionan sobre el eje de su muro padre.
    for (const obj of objects) {
      if (!(obj instanceof Door) && !(obj instanceof Window)) continue;
      const wall = wallsById.get(obj.parentWallId as string);
      if (!wall) continue; // vano huérfano: su muro fue borrado — no es seleccionable
      if (this.hitsVano(worldPoint, obj, wall, thresholdMeters)) return obj;
    }

    // 2. Muro más cercano al eje, dentro de la tolerancia.
    let nearestWall: Wall | null = null;
    let minDist = thresholdMeters as number;
    for (const wall of walls) {
      const dist = distanceToSegment(worldPoint, wall.startPoint, wall.endPoint);
      if (dist < minDist) {
        minDist = dist;
        nearestWall = wall;
      }
    }
    if (nearestWall) return nearestWall;

    // 3. Columnas.
    for (const obj of objects) {
      if (!(obj instanceof Column)) continue;
      if (this.hitsColumn(worldPoint, obj, thresholdMeters)) return obj;
    }

    // 3b. Suelos libres (andenes, patios): dentro del contorno y fuera de sus vacíos.
    for (const obj of objects) {
      if (!(obj instanceof Floor) || !obj.outline || obj.outline.length < 3) continue;
      if (isPointInPolygon(worldPoint, obj.outline) && !(obj.holes ?? []).some((h) => isPointInPolygon(worldPoint, h))) return obj;
    }

    // 4. Recintos (point-in-polygon). Último porque cubren todo lo demás.
    for (const obj of objects) {
      if (!(obj instanceof Room)) continue;
      if (obj.geometry.length < 3) continue;
      if (isPointInPolygon(worldPoint, obj.geometry)) return obj;
    }

    return null;
  }

  /**
   * Handles del objeto seleccionado, en coordenadas mundo. Lista vacía para
   * tipos que no se manipulan por handles (vanos, recintos): un vano se mueve
   * editando su `offsetAlongWall` en el panel de propiedades, no arrastrándolo,
   * porque su posición es relativa al muro y no una coordenada libre.
   */
  handlesFor(object: RevitObjectBase): Handle[] {
    if (object instanceof Wall) {
      return [
        { kind: 'start', position: object.startPoint },
        { kind: 'end', position: object.endPoint },
        {
          kind: 'center',
          position: {
            x: (object.startPoint.x + object.endPoint.x) / 2,
            y: (object.startPoint.y + object.endPoint.y) / 2,
          },
        },
      ];
    }

    if (object instanceof Column) {
      return [{ kind: 'center', position: object.position }];
    }

    return [];
  }

  /**
   * Handle tocado, o `null`. La tolerancia se amplía un 50% respecto a la del
   * hit-test de objetos: los handles se dibujan pequeños (8px) pero tienen que
   * poder agarrarse con el dedo, y tienen prioridad sobre el objeto que los
   * posee (si no, arrastrar un extremo movería el muro entero).
   */
  hitTestHandle(input: {
    worldPoint: Point2D;
    selectedObject: RevitObjectBase;
    thresholdMeters: Meters;
  }): Handle | null {
    const r = (input.thresholdMeters as number) * 1.5;
    let best: Handle | null = null;
    let bestDist = r;

    for (const handle of this.handlesFor(input.selectedObject)) {
      const d = Math.hypot(
        input.worldPoint.x - handle.position.x,
        input.worldPoint.y - handle.position.y,
      );
      if (d < bestDist) {
        bestDist = d;
        best = handle;
      }
    }

    return best;
  }

  /**
   * Nodo de snap más cercano entre los extremos de todos los muros.
   * Es lo que permite que un trazo nuevo "pegue" al final de uno anterior y
   * que el TopologyGraph detecte el recinto como cerrado — sin esto, dos
   * vértices a 2mm de distancia son dos nodos distintos y el recinto nunca
   * cierra (es la "fuga topológica" documentada como bug conocido en LevON).
   */
  findNearestNode(input: {
    worldPoint: Point2D;
    walls: readonly Wall[];
    thresholdMeters: Meters;
  }): Point2D | null {
    let nearest: Point2D | null = null;
    let minDist = input.thresholdMeters as number;

    for (const wall of input.walls) {
      for (const node of [wall.startPoint, wall.endPoint]) {
        const dist = Math.hypot(input.worldPoint.x - node.x, input.worldPoint.y - node.y);
        if (dist < minDist) {
          minDist = dist;
          nearest = node;
        }
      }
    }

    return nearest;
  }

  /**
   * Posición mundo del CENTRO de un vano, derivada de su muro padre.
   * La usan tanto el hit-test como el renderizado en planta, así que vive aquí
   * en vez de duplicarse en el painter.
   *
   * Devuelve `null` si el muro es degenerado (longitud ~0), caso en el que no
   * existe una dirección a lo largo de la cual medir `offsetAlongWall`.
   */
  vanoWorldCenter(vano: Door | Window, wall: Wall): Point2D | null {
    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;

    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular unitaria (rotación +90°), para el desplazamiento lateral.
    const px = -uy;
    const py = ux;

    const along = (vano.offsetAlongWall as number) + (vano.width as number) / 2;
    const perp = vano.offsetPerpendicular as number;

    return {
      x: wall.startPoint.x + ux * along + px * perp,
      y: wall.startPoint.y + uy * along + py * perp,
    };
  }

  /** IDs de los vanos que cuelgan de un muro dado. */
  vanosOfWall(wallId: RevitObjectId, objects: readonly RevitObjectBase[]): RevitObjectId[] {
    return objects
      .filter(
        (o): o is Door | Window =>
          (o instanceof Door || o instanceof Window) &&
          (o.parentWallId as string) === (wallId as string),
      )
      .map((o) => o.id);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private hitsVano(
    point: Point2D,
    vano: Door | Window,
    wall: Wall,
    threshold: Meters,
  ): boolean {
    const center = this.vanoWorldCenter(vano, wall);
    if (!center) return false;

    // Caja del vano medida en el marco local del muro: media anchura a lo
    // largo del eje, medio espesor del muro en perpendicular.
    const halfAlong = (vano.width as number) / 2 + (threshold as number);
    const halfPerp = (wall.thickness as number) / 2 + (threshold as number);

    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return false;
    const ux = dx / len;
    const uy = dy / len;

    const vx = point.x - center.x;
    const vy = point.y - center.y;
    const along = Math.abs(vx * ux + vy * uy);
    const perp = Math.abs(vx * -uy + vy * ux);

    return along <= halfAlong && perp <= halfPerp;
  }

  private hitsColumn(point: Point2D, column: Column, threshold: Meters): boolean {
    if (column.isCircular) {
      const r = (column.dimensionX as number) / 2 + (threshold as number);
      return Math.hypot(point.x - column.position.x, point.y - column.position.y) < r;
    }

    // Rectangular: llevar el punto al marco local de la columna (deshacer la
    // rotación) y comparar contra la caja semi-extendida por la tolerancia.
    const cos = Math.cos(-column.rotation);
    const sin = Math.sin(-column.rotation);
    const dx = point.x - column.position.x;
    const dy = point.y - column.position.y;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;

    const halfW = (column.dimensionX as number) / 2 + (threshold as number);
    const halfH = (column.dimensionY as number) / 2 + (threshold as number);
    return Math.abs(lx) < halfW && Math.abs(ly) < halfH;
  }
}

/**
 * Convierte una tolerancia táctil en píxeles a metros para la escala actual.
 * Centraliza la única fórmula que la UI necesita saber para hablar con este
 * servicio, y evita que cada pantalla reinvente (y desincronice) el factor.
 */
export function touchToleranceMeters(pixels: number, scale: number): Meters {
  return meters(pixels / Math.max(scale, 1e-6));
}
