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

  async execute(_store: IObjectStore): Promise<void> {
    // Ya persistido por UseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.columnId);
  }
}
