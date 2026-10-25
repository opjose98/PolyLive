// =============================================================================
// CommandStack.ts — Gestor de undo/redo con FIFO de 100 comandos
// Basado en: CommandStack.md (Obsidian 02-Aplicación/comandos)
// =============================================================================

import { ICommand } from '../commands/Command';
import { IObjectStore } from '../../domain/objects';

/**
 * Mantiene un stack (FIFO) de hasta 100 comandos.
 *
 * INVARIANTES:
 * - Máximo 100 comandos en stack (para evitar exceso de memoria)
 * - Cada execute() de comando es idempotente
 * - undo() es la inversa exacta de execute()
 * - Agregar un comando nuevo borra el undone stack (no se puede redo después)
 */
export class CommandStack {
  private stack: ICommand[] = [];
  private undoneStack: ICommand[] = [];
  private readonly MAX_SIZE = 100;
  private readonly store: IObjectStore;

  constructor(store: IObjectStore) {
    this.store = store;
  }

  /**
   * Ejecuta un comando y lo agrega al stack.
   * Borra el undoneStack (no se puede redo después de un nuevo comando).
   * Si el stack excede MAX_SIZE, elimina el más antiguo (FIFO).
   */
  async execute(command: ICommand): Promise<void> {
    await command.execute(this.store);
    this.stack.push(command);

    // Descartar comandos deshecho
    this.undoneStack = [];

    // Mantener tamaño máximo (FIFO)
    if (this.stack.length > this.MAX_SIZE) {
      this.stack.shift();
    }
  }

  /**
   * Revierte el último comando ejecutado.
   * Si el stack está vacío, no hace nada.
   */
  async undo(): Promise<void> {
    if (this.stack.length === 0) return;

    const command = this.stack.pop()!;
    if (command.canUndo()) {
      await command.undo(this.store);
      this.undoneStack.push(command);
    }
  }

  /**
   * Repite el último comando deshecho.
   * Si el undoneStack está vacío, no hace nada.
   */
  async redo(): Promise<void> {
    if (this.undoneStack.length === 0) return;

    const command = this.undoneStack.pop()!;
    await command.execute(this.store);
    this.stack.push(command);
  }

  /** Limpia todo el stack (ej. al exportar). */
  clear(): void {
    this.stack = [];
    this.undoneStack = [];
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }

  canRedo(): boolean {
    return this.undoneStack.length > 0;
  }

  size(): number {
    return this.stack.length;
  }

  undoneSize(): number {
    return this.undoneStack.length;
  }
}
