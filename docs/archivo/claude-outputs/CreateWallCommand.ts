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

  async execute(_store: IObjectStore): Promise<void> {
    // El muro ya fue persistido por el UseCase — no-op
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.wallId);
  }
}
