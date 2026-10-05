// =============================================================================
// CreateFloorCommand.ts — Deshacer/rehacer la creación de un suelo (F6a)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';

export class CreateFloorCommand extends Command {
  readonly type = 'CreateFloor' as const;

  constructor(private readonly floorId: RevitObjectId) {
    super();
  }

  async execute(store: IObjectStore): Promise<void> {
    await store.restoreObject(this.floorId);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.floorId);
  }
}
