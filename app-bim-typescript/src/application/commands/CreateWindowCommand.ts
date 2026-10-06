// =============================================================================
// CreateWindowCommand.ts — Comando para crear una Window
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId , Window } from '../../domain/objects';


export class CreateWindowCommand extends Command {
  readonly type = 'CreateWindow' as const;
  private readonly windowId: RevitObjectId;

  constructor(window: Window) {
    super();
    this.windowId = window.id;
  }

  async execute(store: IObjectStore): Promise<void> {
    // La ventana ya fue persistida por el UseCase en su PRIMERA ejecución, donde
    // esto es un no-op (restoreObject sobre algo vivo no cambia nada).
    //
    // BUG CORREGIDO: este método estaba vacío. CommandStack.redo() reejecuta
    // el comando, así que tras un undo (que hace soft-delete) el redo no
    // resucitaba nada: el objeto se quedaba borrado y Rehacer era un no-op
    // silencioso, con el botón habilitado y sin ningún efecto visible.
    await store.restoreObject(this.windowId);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.windowId);
  }
}
