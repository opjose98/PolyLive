// =============================================================================
// MoveObjectUseCase.ts — Mueve un Wall o Column, recalcula vanos hijos
// Basado en: MoveObjectUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Point2D } from '../../domain/geometry/types';
import { translateShape } from '../../domain/geometry/shapes';
import { IObjectStore, RevitObjectBase, RevitObjectId, Wall, Column, Door, Window } from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { MoveObjectCommand, MoveSnapshot } from '../commands/MoveObjectCommand';
import { CommandId } from '../commands/Command';

export interface MoveObjectInput {
  objectId: RevitObjectId;
  newStartPoint?: Point2D;
  newEndPoint?: Point2D;
  newPosition?: Point2D;
}

interface MoveObjectOutput {
  object: RevitObjectBase;
  affectedVanos: RevitObjectId[];
  commandId: CommandId;
}

export class MoveObjectUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: MoveObjectInput): Promise<MoveObjectOutput> {
    const object = await this.store.readObject(input.objectId);
    if (!object) throw new Error('Objeto no existe');

    let affectedVanos: RevitObjectId[] = [];
    let snapshot: MoveSnapshot;

    if (object instanceof Wall) {
      const oldStart = { ...object.startPoint };
      const oldEnd = { ...object.endPoint };

      // Calcular delta
      const newStart = input.newStartPoint ?? oldStart;
      const delta = { x: newStart.x - oldStart.x, y: newStart.y - oldStart.y };
      const newEnd = input.newEndPoint ?? {
        x: object.endPoint.x + delta.x,
        y: object.endPoint.y + delta.y,
      };

      snapshot = {
        oldStartPoint: oldStart,
        oldEndPoint: oldEnd,
        newStartPoint: newStart,
        newEndPoint: newEnd,
      };

      // Actualizar muro. Un eje curvo o quebrado se TRASLADA junto con los
      // extremos: reconstruirlo desde los extremos nuevos lo convertiría en
      // una recta y el muro perdería su curvatura al moverlo.
      const movedShape =
        object.shape.kind === 'line'
          ? undefined
          : translateShape(object.shape, delta.x, delta.y);

      await this.store.updateObject(input.objectId, {
        startPoint: newStart,
        endPoint: newEnd,
        ...(movedShape ? { shape: movedShape } : {}),
        geometry_json: JSON.stringify({
          startPoint: newStart,
          endPoint: newEnd,
          ...(movedShape ? { shape: movedShape } : {}),
        }),
      } as Partial<Wall>);

      // Recalcular vanos hijos
      const allObjects = await this.store.listObjects(object.roomId);
      const vanos = allObjects.filter(
        (o) =>
          (o instanceof Door || o instanceof Window) &&
          o.parentWallId === (object.id as string),
      );
      affectedVanos = vanos.map((v) => v.id);
    } else if (object instanceof Column) {
      const oldPos = { ...object.position };
      const newPos = input.newPosition ?? oldPos;

      snapshot = {
        oldPosition: oldPos,
        newPosition: newPos,
      };

      await this.store.updateObject(input.objectId, {
        position: newPos,
        geometry_json: JSON.stringify({ position: newPos }),
      } as Partial<Column>);
    } else {
      throw new Error('Solo se pueden mover Wall o Column');
    }

    // Comando
    const command = new MoveObjectCommand(input.objectId, snapshot!);
    await this.commandStack.execute(command);

    return {
      object,
      affectedVanos,
      commandId: command.id,
    };
  }
}
