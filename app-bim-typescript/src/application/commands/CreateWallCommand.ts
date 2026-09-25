// =============================================================================
// CreateWallCommand.ts — Comando para crear un Wall
// Basado en: CreateWallCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, Wall } from '../../domain/objects';

/**
 * Ejecuta la creación de un muro. En undo, soft-delete.
 *
 * INVARIANTES:
 * - El muro se persistió ANTES de emitir el comando (en CreateWallUseCase)
 * - El comando solo es "testigo" de la creación
 * - undo() no borra físicamente, solo marca is_deleted = true
 */
export class CreateWallCommand extends Command {
  readonly type = 'CreateWall' as const;
  private readonly wallId: RevitObjectId;

  constructor(wall: Wall) {
    super();
    this.wallId = wall.id;
  }

  async execute(store: IObjectStore): Promise<void> {
    // El muro ya fue persistido por el UseCase en su PRIMERA ejecución, donde
    // esto es un no-op (restoreObject sobre algo vivo no cambia nada).
    //
    // BUG CORREGIDO: este método estaba vacío. CommandStack.redo() reejecuta
    // el comando, así que tras un undo (que hace soft-delete) el redo no
    // resucitaba nada: el objeto se quedaba borrado y Rehacer era un no-op
    // silencioso, con el botón habilitado y sin ningún efecto visible.
    await store.restoreObject(this.wallId);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.wallId);
  }
}
