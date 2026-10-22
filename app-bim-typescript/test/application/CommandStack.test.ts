// =============================================================================
// CommandStack.test.ts — Tests para CommandStack (undo/redo/FIFO)
// =============================================================================

import {
  IObjectStore,
  RevitObjectBase,
  RevitObjectId,
  RoomId,
} from '../../src/domain/objects';
import { Command } from '../../src/application/commands/Command';
import { CommandStack } from '../../src/application/state/CommandStack';

// ---------------------------------------------------------------------------
// Mock IObjectStore — minimal
// ---------------------------------------------------------------------------

class MockObjectStore implements IObjectStore {
  private objects = new Map<string, RevitObjectBase>();

  async createObject(obj: RevitObjectBase): Promise<RevitObjectId> {
    this.objects.set(obj.id as string, obj);
    return obj.id;
  }

  async readObject(id: RevitObjectId): Promise<RevitObjectBase | null> {
    return this.objects.get(id as string) ?? null;
  }

  async updateObject(id: RevitObjectId, updates: Partial<RevitObjectBase>): Promise<void> {
    const obj = this.objects.get(id as string);
    if (obj) Object.assign(obj, updates);
  }

  async deleteObject(id: RevitObjectId): Promise<void> {
    const obj = this.objects.get(id as string);
    if (obj) obj.is_deleted = true;
  }

  async restoreObject(id: RevitObjectId): Promise<void> {
    const obj = this.objects.get(id as string);
    if (obj) obj.is_deleted = false;
  }

  async listObjects(_rid: RoomId): Promise<RevitObjectBase[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Comando de prueba — registra ejecuciones
// ---------------------------------------------------------------------------

class TestCommand extends Command {
  readonly type = 'Test' as const;
  executeCount = 0;
  undoCount = 0;

  constructor(public label: string = '') {
    super();
  }

  async execute(_store: IObjectStore): Promise<void> {
    this.executeCount++;
  }

  async undo(_store: IObjectStore): Promise<void> {
    this.undoCount++;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandStack', () => {
  let store: MockObjectStore;
  let stack: CommandStack;

  beforeEach(() => {
    store = new MockObjectStore();
    stack = new CommandStack(store);
  });

  // =========================================================================
  // 1. execute() crece el stack
  // =========================================================================

  it('execute() adds command to stack and increases size', async () => {
    expect(stack.size()).toBe(0);

    const cmd = new TestCommand('A');
    await stack.execute(cmd);

    expect(stack.size()).toBe(1);
    expect(cmd.executeCount).toBe(1);
  });

  // =========================================================================
  // 2. undo() quita del stack, mueve a undone
  // =========================================================================

  it('undo() moves last command to undoneStack', async () => {
    const cmd = new TestCommand('A');
    await stack.execute(cmd);

    expect(stack.canUndo()).toBe(true);
    await stack.undo();

    expect(stack.size()).toBe(0);
    expect(stack.undoneSize()).toBe(1);
    expect(cmd.undoCount).toBe(1);
  });

  // =========================================================================
  // 3. redo() re-ejecuta el comando deshecho
  // =========================================================================

  it('redo() re-executes the undone command', async () => {
    const cmd = new TestCommand('A');
    await stack.execute(cmd);
    await stack.undo();

    expect(stack.canRedo()).toBe(true);
    await stack.redo();

    expect(stack.size()).toBe(1);
    expect(stack.undoneSize()).toBe(0);
    expect(cmd.executeCount).toBe(2); // execute + redo
  });

  // =========================================================================
  // 4. execute() después de undo limpia undoneStack
  // =========================================================================

  it('execute() after undo clears undoneStack (no redo)', async () => {
    const cmdA = new TestCommand('A');
    const cmdB = new TestCommand('B');

    await stack.execute(cmdA);
    await stack.undo();
    expect(stack.undoneSize()).toBe(1);

    // Nuevo comando debería limpiar undone
    await stack.execute(cmdB);
    expect(stack.undoneSize()).toBe(0);
    expect(stack.canRedo()).toBe(false);
  });

  // =========================================================================
  // 5. FIFO: máximo 100 comandos
  // =========================================================================

  it('FIFO: stack never exceeds 100 commands', async () => {
    for (let i = 0; i < 110; i++) {
      await stack.execute(new TestCommand(`cmd-${i}`));
    }

    expect(stack.size()).toBe(100);
  });

  // =========================================================================
  // 6. 100x undo sin error
  // =========================================================================

  it('100x undo without error', async () => {
    for (let i = 0; i < 100; i++) {
      await stack.execute(new TestCommand(`cmd-${i}`));
    }

    for (let i = 0; i < 100; i++) {
      await stack.undo();
    }

    expect(stack.size()).toBe(0);
    expect(stack.undoneSize()).toBe(100);
  });

  // =========================================================================
  // 7. undo en stack vacío no arroja error
  // =========================================================================

  it('undo on empty stack is a no-op', async () => {
    await expect(stack.undo()).resolves.toBeUndefined();
    expect(stack.size()).toBe(0);
  });

  // =========================================================================
  // 8. redo en undoneStack vacío no arroja error
  // =========================================================================

  it('redo on empty undoneStack is a no-op', async () => {
    await expect(stack.redo()).resolves.toBeUndefined();
    expect(stack.undoneSize()).toBe(0);
  });

  // =========================================================================
  // 9. clear() limpia ambos stacks
  // =========================================================================

  it('clear() empties both stacks', async () => {
    await stack.execute(new TestCommand('A'));
    await stack.execute(new TestCommand('B'));
    await stack.undo();

    expect(stack.size()).toBe(1);
    expect(stack.undoneSize()).toBe(1);

    stack.clear();

    expect(stack.size()).toBe(0);
    expect(stack.undoneSize()).toBe(0);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  // =========================================================================
  // 10. Múltiples undo/redo mantienen orden correcto
  // =========================================================================

  it('multiple undo/redo maintain LIFO order', async () => {
    const cmds = [
      new TestCommand('A'),
      new TestCommand('B'),
      new TestCommand('C'),
    ];

    for (const cmd of cmds) await stack.execute(cmd);

    // Undo C, B
    await stack.undo();
    await stack.undo();
    expect(stack.size()).toBe(1);
    expect(stack.undoneSize()).toBe(2);

    // Redo B
    await stack.redo();
    expect(stack.size()).toBe(2);
    expect(stack.undoneSize()).toBe(1);

    // C sigue en undone, B fue re-ejecutado
    expect(cmds[1].executeCount).toBe(2); // B: execute + redo
    expect(cmds[2].executeCount).toBe(1); // C: solo execute original
  });

  // =========================================================================
  // 11. FIFO descarta el comando más antiguo
  // =========================================================================

  it('FIFO discards the oldest command when exceeding 100', async () => {
    const firstCmd = new TestCommand('first');
    await stack.execute(firstCmd);

    // Llenar hasta 100 más
    for (let i = 1; i <= 100; i++) {
      await stack.execute(new TestCommand(`cmd-${i}`));
    }

    // El stack tiene 100, el primero fue descartado
    expect(stack.size()).toBe(100);
    // No podemos verificar directamente que firstCmd fue eliminado,
    // pero sabemos que el stack no excede 100
  });
});
