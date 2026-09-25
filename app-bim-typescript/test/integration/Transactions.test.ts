// =============================================================================
// Transactions.test.ts — Atomicidad de UseCases, ObjectStore y CommandStack
// Basado en: estrategia-integration-testing.md §Transacciones
//   "Si validación falla: no persiste, no comanda"
//   "Si persistencia falla: rollback automático"
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { Wall, Door, roomId, wallId, revitObjectId } from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';
import { CommandStack } from '../../src/application/state/CommandStack';
import { Command } from '../../src/application/commands/Command';
import { CreateWallUseCase } from '../../src/application/use-cases/CreateWallUseCase';
import { CreateDoorUseCase } from '../../src/application/use-cases/CreateDoorUseCase';
import { IValidationService, ValidationResult } from '../../src/application/use-cases/types';

const ROOM_ID = roomId('tx-room');

function failingValidationService(field: keyof IValidationService): IValidationService {
  const ok: ValidationResult = { valid: true, warnings: [] };
  const failing: ValidationResult = {
    valid: false,
    warnings: [{ type: 'degenerate_triangle', message: 'forced failure for test' }],
  };
  const base: IValidationService = {
    validateWall: jest.fn().mockReturnValue(ok),
    validateColumn: jest.fn().mockReturnValue(ok),
    validateDoor: jest.fn().mockReturnValue(ok),
    validateWindow: jest.fn().mockReturnValue(ok),
    validateRoom: jest.fn().mockReturnValue(ok),
    validateExport: jest.fn().mockReturnValue(ok),
  };
  (base[field] as jest.Mock).mockReturnValue(failing);
  return base;
}

let db: Database;
let store: ObjectStore;
let commandStack: CommandStack;

beforeEach(async () => {
  db = new Database(':memory:');
  await db.open();
  await db.migrate();
  store = new ObjectStore(db);
  commandStack = new CommandStack(store);
});

afterEach(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// "Si validación falla: no persiste, no comanda"
// ---------------------------------------------------------------------------

describe('Validation failure → no persistence, no command', () => {
  it('CreateWallUseCase: wall inválido no se inserta en SQLite ni se emite comando', async () => {
    const useCase = new CreateWallUseCase(store, commandStack, failingValidationService('validateWall'));

    await expect(
      useCase.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 }, // degenerado
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    ).rejects.toThrow('Validation failed');

    const rows = await db.all('SELECT * FROM revit_objects WHERE room_id = ?', [ROOM_ID as unknown as string]);
    expect(rows).toHaveLength(0);
    expect(commandStack.size()).toBe(0);
  });

  it('CreateDoorUseCase: puerta inválida no se inserta ni se emite comando, aunque el Wall padre sí exista', async () => {
    // Servicio que valida Wall ok pero Door siempre falla:
    const service: IValidationService = {
      validateWall: jest.fn().mockReturnValue({ valid: true, warnings: [] }),
      validateColumn: jest.fn().mockReturnValue({ valid: true, warnings: [] }),
      validateDoor: jest
        .fn()
        .mockReturnValue({ valid: false, warnings: [{ type: 'unclosed_polygon', message: 'forced' }] }),
      validateWindow: jest.fn().mockReturnValue({ valid: true, warnings: [] }),
      validateRoom: jest.fn().mockReturnValue({ valid: true, warnings: [] }),
      validateExport: jest.fn().mockReturnValue({ valid: true, warnings: [] }),
    };

    const createWall = new CreateWallUseCase(store, commandStack, service);
    const wallOut = await createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    expect(commandStack.size()).toBe(1);

    const createDoor = new CreateDoorUseCase(store, commandStack, service);
    await expect(
      createDoor.execute({
        roomId: ROOM_ID,
        parentWallId: wallId(wallOut.wall.id as unknown as string),
        offsetAlongWall: meters(1),
        offsetPerpendicular: meters(0),
        width: meters(0.9),
        height: meters(2.1),
      }),
    ).rejects.toThrow('Validation failed');

    // Ningún Door insertado, y el stack sigue en 1 (solo el Wall previo)
    const doorRows = await db.all('SELECT * FROM revit_objects WHERE object_type = ?', ['Door']);
    expect(doorRows).toHaveLength(0);
    expect(commandStack.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// "Si persistencia falla: rollback automático"
// ---------------------------------------------------------------------------

describe('Persistence failure → automatic rollback', () => {
  it('Database.transaction() revierte TODAS las sentencias si una falla a mitad de camino', async () => {
    await expect(
      db.transaction(async () => {
        await db.run(`INSERT INTO revit_objects (id, object_type, room_id) VALUES (?, 'Wall', ?)`, [
          'tx-wall-1',
          'room-tx',
        ]);
        // Esta sentencia viola el CHECK(object_type IN (...)) — fuerza el fallo
        // DESPUÉS de que la primera ya se ejecutó dentro de la misma transacción.
        await db.run(`INSERT INTO revit_objects (id, object_type, room_id) VALUES (?, 'NotAType', ?)`, [
          'tx-wall-2',
          'room-tx',
        ]);
      }),
    ).rejects.toThrow();

    // El ROLLBACK deshace también el primer INSERT, no solo el que falló.
    const row = await db.get('SELECT * FROM revit_objects WHERE id = ?', ['tx-wall-1']);
    expect(row).toBeUndefined();
  });

  it('ObjectStore.createObject: FK inválida en Door no deja fila huérfana insertada', async () => {
    const door = new Door({
      id: revitObjectId('door-orphan'),
      roomId: ROOM_ID,
      parentWallId: wallId('wall-inexistente'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    await expect(store.createObject(door)).rejects.toThrow(/does not exist/);

    const row = await db.get('SELECT * FROM revit_objects WHERE id = ?', ['door-orphan']);
    expect(row).toBeUndefined(); // la transacción de createObject() hizo rollback completo
  });

  it('ObjectStore.updateObject: falla si el objeto no existe, sin dejar efectos secundarios', async () => {
    const wall = new Wall({
      id: revitObjectId('wall-tx-safe'),
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await store.createObject(wall);

    await expect(
      store.updateObject(revitObjectId('no-existe'), { thickness: meters(0.3) } as any),
    ).rejects.toThrow(/not found/);

    // El wall original permanece completamente intacto
    const stillThere = (await store.readObject(wall.id)) as Wall;
    expect(stillThere.thickness).toBeCloseTo(0.15);
  });
});

// ---------------------------------------------------------------------------
// CommandStack — atomicidad de execute()
// ---------------------------------------------------------------------------

describe('CommandStack atomicity', () => {
  class FailingCommand extends Command {
    readonly type = 'Failing' as const;
    async execute(): Promise<void> {
      throw new Error('boom: command execution failed');
    }
    async undo(): Promise<void> {
      /* nunca debería llamarse en este test */
    }
  }

  it('execute() no agrega el comando al stack si execute() del comando lanza', async () => {
    await expect(commandStack.execute(new FailingCommand())).rejects.toThrow('boom');
    expect(commandStack.size()).toBe(0);
    expect(commandStack.canUndo()).toBe(false);
  });
});
