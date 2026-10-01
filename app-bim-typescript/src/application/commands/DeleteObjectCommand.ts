// =============================================================================
// DeleteObjectCommand.ts — Comando para soft-delete con cascada
// Basado en: DeleteObjectCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';

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
  /** Objeto que se pidió borrar (los demás de `deletedIds` son sus dependientes). */
  readonly objectId: RevitObjectId;
  private readonly deletedIds: RevitObjectId[];

  constructor(objectId: RevitObjectId, deletedIds: RevitObjectId[]) {
    super();
    this.objectId = objectId;
    this.deletedIds = [...deletedIds];
  }

  async execute(store: IObjectStore): Promise<void> {
    // En la PRIMERA ejecución esto es un no-op: DeleteObjectUseCase ya borró
    // todo, así que `readObject` devuelve null para cada id y no hay nada que
    // hacer. En un REDO (tras un undo que los restauró) sí vuelven a borrarse.
    //
    // MISMO BUG QUE EN Create*Command: el método estaba vacío, así que rehacer
    // un borrado no volvía a borrar nada y el objeto reaparecía para siempre.
    //
    // El `readObject` previo es necesario, no defensivo: `deleteObject` LANZA
    // sobre un objeto ya borrado ("not found or already deleted").
    for (const id of this.deletedIds) {
      if (await store.readObject(id)) await store.deleteObject(id);
    }
  }

  async undo(store: IObjectStore): Promise<void> {
    // BUG CORREGIDO: esto hacía `updateObject(id, { is_deleted: false })`, y
    // `ObjectStore.updateObject` empieza con
    // `SELECT ... WHERE id = ? AND is_deleted = 0` y LANZA si no encuentra
    // nada. El objeto que se intenta restaurar está, por definición, borrado —
    // así que deshacer un borrado lanzaba "Object ... not found or is deleted"
    // en vez de restaurar. `restoreObject` es la operación correcta.
    //
    // Orden inverso: el objeto principal se restaura antes que sus vanos, para
    // que ningún vano exista sin su muro padre ni un instante.
    for (const id of [...this.deletedIds].reverse()) {
      await store.restoreObject(id);
    }
  }
}
