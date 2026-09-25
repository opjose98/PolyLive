// =============================================================================
// CreateColumnCommand.ts — Comando para crear una Column
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, Column } from '../../domain/objects';

export class CreateColumnCommand extends Command {
  readonly type = 'CreateColumn' as const;
  private readonly columnId: RevitObjectId;

  constructor(column: Column) {
    super();
    this.columnId = column.id;
  }

  async execute(store: IObjectStore): Promise<void> {
    // La columna ya fue persistida por el UseCase en su PRIMERA ejecución, donde
    // esto es un no-op (restoreObject sobre algo vivo no cambia nada).
    //
    // BUG CORREGIDO: este método estaba vacío. CommandStack.redo() reejecuta
    // el comando, así que tras un undo (que hace soft-delete) el redo no
    // resucitaba nada: el objeto se quedaba borrado y Rehacer era un no-op
    // silencioso, con el botón habilitado y sin ningún efecto visible.
    await store.restoreObject(this.columnId);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.columnId);
  }
}
