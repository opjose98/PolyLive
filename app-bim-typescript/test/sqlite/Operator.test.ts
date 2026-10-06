// =============================================================================
// Operator.test.ts — Operator entity + ObjectStore operations + listAllRooms
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { Wall , Room, roomId, levelId, revitObjectId } from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { Operator, operatorId } from '../../src/domain/objects/operator';


describe('Operator (domain)', () => {
  it('rechaza un nombre vacío', () => {
    expect(() => new Operator({ id: operatorId('op-1'), name: '' })).toThrow('no puede estar vacío');
  });

  it('rechaza un nombre solo de espacios', () => {
    expect(() => new Operator({ id: operatorId('op-1'), name: '   ' })).toThrow('no puede estar vacío');
  });

  it('recorta espacios del nombre', () => {
    const op = new Operator({ id: operatorId('op-1'), name: '  Ana Pérez  ' });
    expect(op.name).toBe('Ana Pérez');
  });
});

describe('ObjectStore — operaciones de Operator', () => {
  let db: Database;
  let store: ObjectStore;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('crea y lee un Operator', async () => {
    const op = new Operator({ id: operatorId('op-1'), name: 'Ana Pérez' });
    await store.createOperator(op);

    const read = await store.readOperator(operatorId('op-1'));
    expect(read).not.toBeNull();
    expect(read!.name).toBe('Ana Pérez');
  });

  it('readOperator retorna null para un id inexistente', async () => {
    const read = await store.readOperator(operatorId('no-existe'));
    expect(read).toBeNull();
  });

  it('listOperators retorna todos los no borrados, más recientes primero', async () => {
    await store.createOperator(new Operator({ id: operatorId('op-1'), name: 'Primero' }));
    await new Promise((r) => setTimeout(r, 5));
    await store.createOperator(new Operator({ id: operatorId('op-2'), name: 'Segundo' }));

    const list = await store.listOperators();
    expect(list.map((o) => o.name)).toEqual(['Segundo', 'Primero']);
  });

  it('updateOperatorName renombra correctamente', async () => {
    await store.createOperator(new Operator({ id: operatorId('op-1'), name: 'Nombre Original' }));
    await store.updateOperatorName(operatorId('op-1'), 'Nombre Nuevo');

    const read = await store.readOperator(operatorId('op-1'));
    expect(read!.name).toBe('Nombre Nuevo');
  });

  it('updateOperatorName rechaza nombre vacío sin tocar la base', async () => {
    await store.createOperator(new Operator({ id: operatorId('op-1'), name: 'Original' }));
    await expect(store.updateOperatorName(operatorId('op-1'), '   ')).rejects.toThrow('no puede estar vacío');

    const read = await store.readOperator(operatorId('op-1'));
    expect(read!.name).toBe('Original');
  });

  it('updateOperatorName lanza si el Operator no existe', async () => {
    await expect(store.updateOperatorName(operatorId('no-existe'), 'X')).rejects.toThrow('no existe');
  });

  it('deleteOperator hace soft-delete — deja de listarse y de leerse', async () => {
    await store.createOperator(new Operator({ id: operatorId('op-1'), name: 'Ana' }));
    await store.deleteOperator(operatorId('op-1'));

    expect(await store.readOperator(operatorId('op-1'))).toBeNull();
    expect(await store.listOperators()).toEqual([]);
  });
});

describe('ObjectStore.listAllRooms', () => {
  let db: Database;
  let store: ObjectStore;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('retorna un array vacío cuando no hay Recintos', async () => {
    expect(await store.listAllRooms()).toEqual([]);
  });

  it('lista Rooms de DIFERENTES roomId — no requiere conocerlo de antemano', async () => {
    const room1Id = roomId('room-1');
    const room2Id = roomId('room-2');

    await store.createObject(
      new Room({ id: revitObjectId(room1Id as unknown as string), roomId: room1Id, levelId: levelId('level-1'), isOpen: true }),
    );
    await store.createObject(
      new Room({ id: revitObjectId(room2Id as unknown as string), roomId: room2Id, levelId: levelId('level-1'), isOpen: false }),
    );

    const rooms = await store.listAllRooms();
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.roomId).sort()).toEqual(['room-1', 'room-2']);
  });

  it('excluye Rooms soft-deleted', async () => {
    const rId = roomId('room-deleted');
    const revitId = revitObjectId(rId as unknown as string);
    await store.createObject(new Room({ id: revitId, roomId: rId, levelId: levelId('level-1'), isOpen: true }));
    await store.deleteObject(revitId);

    expect(await store.listAllRooms()).toEqual([]);
  });

  it('no incluye Walls/Doors/etc. de ningún Recinto — solo objetos tipo Room', async () => {
    const rId = roomId('room-with-wall');
    await store.createObject(
      new Room({ id: revitObjectId(rId as unknown as string), roomId: rId, levelId: levelId('level-1'), isOpen: true }),
    );
    await store.createObject(
      new Wall({
        id: revitObjectId('wall-1'),
        roomId: rId,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    const rooms = await store.listAllRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].type).toBe('Room');
  });
});
