// =============================================================================
// MoveObjectCommand.ts — Comando para mover un Wall o Column
// Basado en: MoveWallCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, Wall, Column } from '../../domain/objects';
import { Point2D } from '../../domain/geometry/types';

export interface MoveSnapshot {
  /** Para Wall: startPoint/endPoint anteriores. Para Column: position anterior. */
  oldStartPoint?: Point2D;
  oldEndPoint?: Point2D;
  oldPosition?: Point2D;
  newStartPoint?: Point2D;
  newEndPoint?: Point2D;
  newPosition?: Point2D;
}

/**
 * Mueve un Wall o Column. Undo restaura posición anterior.
 *
 * INVARIANTES:
 * - Almacena posición anterior completa para undo exacto
 * - No recalcula vanos en undo (el UseCase lo maneja)
 */
export class MoveObjectCommand extends Command {
  readonly type = 'MoveObject' as const;
  private readonly objectId: RevitObjectId;
  private readonly snapshot: MoveSnapshot;

  constructor(objectId: RevitObjectId, snapshot: MoveSnapshot) {
    super();
    this.objectId = objectId;
    this.snapshot = snapshot;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por MoveObjectUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    const obj = await store.readObject(this.objectId);
    if (!obj) return;

    if (obj instanceof Wall && this.snapshot.oldStartPoint && this.snapshot.oldEndPoint) {
      await store.updateObject(this.objectId, {
        startPoint: this.snapshot.oldStartPoint,
        endPoint: this.snapshot.oldEndPoint,
        geometry_json: JSON.stringify({
          startPoint: this.snapshot.oldStartPoint,
          endPoint: this.snapshot.oldEndPoint,
        }),
      } as Partial<Wall>);
    } else if (obj instanceof Column && this.snapshot.oldPosition) {
      await store.updateObject(this.objectId, {
        position: this.snapshot.oldPosition,
        geometry_json: JSON.stringify({ position: this.snapshot.oldPosition }),
      } as Partial<Column>);
    }
  }
}
