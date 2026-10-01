// =============================================================================
// UpdateObjectPropertyCommand.ts — Comando genérico para actualizar propiedades
// Basado en: UpdateWallThicknessCommand.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';

/** Un campo cambiado, con su valor anterior para deshacer. */
export interface PropertyChange {
  readonly property: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * Comando genérico que cambia una o varias propiedades de un objeto BIM en UN
 * paso de deshacer (p. ej. las restricciones de nivel de un muro y la altura
 * que se deriva de ellas).
 *
 * Cubre los comandos:
 * - UpdateWallThickness
 * - UpdateWallHeight
 * - UpdateWallMaterial
 * - UpdateDoorWidth
 * - UpdateObjectProperty (genérico)
 *
 * BUG CORREGIDO: `execute` estaba vacío porque el UseCase ya persiste el
 * cambio antes de apilar el comando. Pero `CommandStack.redo()` vuelve a
 * llamar a `execute`, así que Rehacer una edición de propiedad no hacía nada.
 * Ahora `execute` escribe el valor nuevo: la primera vez es idempotente con lo
 * que ya escribió el UseCase, y en Rehacer es lo que lo reaplica.
 */
export class UpdateObjectPropertyCommand extends Command {
  readonly type = 'UpdateObjectProperty' as const;
  private readonly objectId: RevitObjectId;
  private readonly changes: readonly PropertyChange[];

  constructor(
    objectId: RevitObjectId,
    property: string,
    oldValue: unknown,
    newValue: unknown,
    more: readonly PropertyChange[] = [],
  ) {
    super();
    this.objectId = objectId;
    this.changes = [{ property, oldValue, newValue }, ...more];
  }

  async execute(store: IObjectStore): Promise<void> {
    await this.write(store, 'newValue');
  }

  async undo(store: IObjectStore): Promise<void> {
    await this.write(store, 'oldValue');
  }

  private async write(store: IObjectStore, which: 'oldValue' | 'newValue'): Promise<void> {
    const obj = await store.readObject(this.objectId);
    if (!obj) return;
    const updates: Record<string, unknown> = {};
    for (const c of this.changes) updates[c.property] = c[which];
    await store.updateObject(this.objectId, updates as any);
  }
}
