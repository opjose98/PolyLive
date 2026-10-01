// =============================================================================
// Command.ts — Interfaz base y clase abstracta para todos los comandos
// Basado en: Command-abstracción.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { generateId, IObjectStore } from '../../domain/objects';

// ---------------------------------------------------------------------------
// CommandId — Branded type
// ---------------------------------------------------------------------------

export type CommandId = string & { readonly __brand: 'CommandId' };

export function commandId(value: string): CommandId {
  return value as CommandId;
}

// ---------------------------------------------------------------------------
// ICommand — Interfaz que todos los comandos implementan
// ---------------------------------------------------------------------------

/**
 * Contrato para todos los comandos del sistema.
 *
 * INVARIANTES:
 * - Un comando una vez ejecutado es inmutable (datos históricos no cambian)
 * - execute() solo se llama una vez (el CommandStack lo orquesta)
 * - undo() reversa exactamente lo que execute() hizo
 * - execute() + undo() + execute() = estado original (idempotencia)
 */
export interface ICommand {
  readonly id: CommandId;
  readonly type: string;
  readonly timestamp: Date;
  execute(store: IObjectStore): Promise<void>;
  undo(store: IObjectStore): Promise<void>;
  canUndo(): boolean;
}

// ---------------------------------------------------------------------------
// Command — Clase abstracta base
// ---------------------------------------------------------------------------

export abstract class Command implements ICommand {
  readonly id: CommandId;
  readonly timestamp: Date;
  abstract readonly type: string;

  constructor() {
    this.id = generateId() as unknown as CommandId;
    this.timestamp = new Date();
  }

  abstract execute(store: IObjectStore): Promise<void>;
  abstract undo(store: IObjectStore): Promise<void>;

  /** Override si el comando no es reversible (ej. ExportIfc). */
  canUndo(): boolean {
    return true;
  }
}
