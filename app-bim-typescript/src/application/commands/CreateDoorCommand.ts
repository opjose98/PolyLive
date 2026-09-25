// =============================================================================
// CreateDoorCommand.ts — Comando para crear una Door
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, Door } from '../../domain/objects';

export class CreateDoorCommand extends Command {
  readonly type = 'CreateDoor' as const;
  private readonly doorId: RevitObjectId;

  constructor(door: Door) {
    super();
    this.doorId = door.id;
  }

  async execute(store: IObjectStore): Promise<void> {
    // La puerta ya fue persistida por el UseCase en su PRIMERA ejecución, donde
    // esto es un no-op (restoreObject sobre algo vivo no cambia nada).
    //
    // BUG CORREGIDO: este método estaba vacío. CommandStack.redo() reejecuta
    // el comando, así que tras un undo (que hace soft-delete) el redo no
    // resucitaba nada: el objeto se quedaba borrado y Rehacer era un no-op
    // silencioso, con el botón habilitado y sin ningún efecto visible.
    await store.restoreObject(this.doorId);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.doorId);
  }
}
