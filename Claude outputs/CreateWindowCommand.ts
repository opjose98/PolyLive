// =============================================================================
// CreateWindowCommand.ts — Comando para crear una Window
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';
import { Window } from '../../domain/objects';

export class CreateWindowCommand extends Command {
  readonly type = 'CreateWindow' as const;
  private readonly windowId: RevitObjectId;

  constructor(window: Window) {
    super();
    this.windowId = window.id;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya persistido por UseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.deleteObject(this.windowId);
  }
}
