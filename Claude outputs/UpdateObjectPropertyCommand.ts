// =============================================================================
// UpdateObjectPropertyCommand.ts — Comando genérico para actualizar una propiedad
// Basado en: UpdateWallThicknessCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';

/**
 * Comando genérico que cambia una propiedad de cualquier objeto BIM.
 * Almacena oldValue para undo.
 *
 * Cubre los comandos:
 * - UpdateWallThickness
 * - UpdateWallHeight
 * - UpdateWallMaterial
 * - UpdateDoorWidth
 * - UpdateObjectProperty (genérico)
 */
export class UpdateObjectPropertyCommand extends Command {
  readonly type = 'UpdateObjectProperty' as const;
  private readonly objectId: RevitObjectId;
  private readonly property: string;
  private readonly oldValue: unknown;
  private readonly newValue: unknown;

  constructor(
    objectId: RevitObjectId,
    property: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    super();
    this.objectId = objectId;
    this.property = property;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por UpdateObjectPropertyUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    const obj = await store.readObject(this.objectId);
    if (!obj) return;
    await store.updateObject(this.objectId, {
      [this.property]: this.oldValue,
    } as any);
  }
}
