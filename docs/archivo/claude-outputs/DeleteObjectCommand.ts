// =============================================================================
// DeleteObjectCommand.ts — Comando para soft-delete con cascada
// Basado en: DeleteObjectCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, RevitObjectBase } from '../../domain/objects';

/**
 * Marca un objeto como borrado. Undo restaura el objeto y todos sus dependientes.
 *
 * INVARIANTES:
 * - Nunca se borra físicamente (is_deleted = true, no DELETE en SQL)
 * - Cascade automático para dependientes (Doors/Windows si Wall se borra)
 * - El undo restaura el objeto y todos sus dependientes
 */
export class DeleteObjectCommand extends Command {
  readonly type = 'DeleteObject' as const;
  private readonly objectId: RevitObjectId;
  private readonly deletedIds: RevitObjectId[];

  constructor(objectId: RevitObjectId, deletedIds: RevitObjectId[]) {
    super();
    this.objectId = objectId;
    this.deletedIds = [...deletedIds];
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por DeleteObjectUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    // Restaurar todos los objetos borrados (en orden inverso)
    for (const id of [...this.deletedIds].reverse()) {
      await store.updateObject(id, { is_deleted: false } as any);
    }
  }
}
