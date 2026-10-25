// =============================================================================
// CloseRoomCommand.ts — Comando para cerrar un Recinto
// Basado en: CloseRoomCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';

/**
 * Cierra un Recinto (calcula área, materializa Floor).
 * Undo abre el Recinto de nuevo y borra el Floor implícito si fue creado.
 */
export class CloseRoomCommand extends Command {
  readonly type = 'CloseRoom' as const;
  private readonly roomId: RevitObjectId;
  private readonly floorId: RevitObjectId | null;

  constructor(roomId: RevitObjectId, floorId: RevitObjectId | null) {
    super();
    this.roomId = roomId;
    this.floorId = floorId;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por CloseRoomUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    // Reabrir Room
    await store.updateObject(this.roomId, {
      isOpen: true,
      area: null,
    } as any);

    // Si Floor fue implícito, soft-delete
    if (this.floorId) {
      await store.deleteObject(this.floorId);
    }
  }
}
