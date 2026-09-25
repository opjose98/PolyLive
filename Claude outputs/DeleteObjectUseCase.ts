// =============================================================================
// DeleteObjectUseCase.ts — Soft-delete con cascada para vanos hijos
// Basado en: DeleteObjectUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import {
  IObjectStore,
  RevitObjectId,
  Wall,
  Door,
} from '../../domain/objects';
import { Window } from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { DeleteObjectCommand } from '../commands/DeleteObjectCommand';
import { CommandId } from '../commands/Command';

export interface DeleteObjectInput {
  objectId: RevitObjectId;
  cascade?: boolean; // default: true
}

export interface DeleteObjectOutput {
  deletedCount: number;
  commandId: CommandId;
}

export class DeleteObjectUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: DeleteObjectInput): Promise<DeleteObjectOutput> {
    const cascade = input.cascade ?? true;
    const object = await this.store.readObject(input.objectId);
    if (!object) throw new Error('Objeto no existe');

    const deletedIds: RevitObjectId[] = [];

    // Si es Wall y cascade=true, borrar vanos hijos primero
    if (object instanceof Wall && cascade) {
      const allObjects = await this.store.listObjects(object.roomId);
      const vanos = allObjects.filter(
        (o) =>
          (o instanceof Door || o instanceof Window) &&
          o.parentWallId === (object.id as unknown as string),
      );

      for (const vano of vanos) {
        await this.store.deleteObject(vano.id);
        deletedIds.push(vano.id);
      }
    }

    // Soft-delete el objeto principal
    await this.store.deleteObject(input.objectId);
    deletedIds.push(input.objectId);

    // Comando
    const command = new DeleteObjectCommand(input.objectId, deletedIds);
    await this.commandStack.execute(command);

    return {
      deletedCount: deletedIds.length,
      commandId: command.id,
    };
  }
}
