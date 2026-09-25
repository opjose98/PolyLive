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

  async execute(_store: IObjectStore): Promise<void> {
    // Ya persistido por UseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.doorId);
  }
}
