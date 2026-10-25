// =============================================================================
// ObjectStore.test.ts — Tests de CRUD completo para ObjectStore SQLite
// 15+ tests: CRUD, validación FK, cascade delete, transacciones, todos los tipos
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import {
  Wall,
  Door,
  Window,
  Column,
  Floor,
  Room,
  Measurement,
  AuditPhoto,
  revitObjectId,
  roomId,
  wallId,
  levelId,
  measurementId,
  auditPhotoId,
} from '../../src/domain/objects';
import { meters, squareMeters } from '../../src/domain/geometry/types';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let db: Database;
let store: ObjectStore;
const TEST_ROOM_ID = roomId('room-test-001');
const TEST_LEVEL_ID = levelId('level-1');

beforeEach(async () => {
  db = new Database(':memory:');
  await db.open();
  await db.migrate();
  store = new ObjectStore(db);

  // Crear un Room base para todos los tests
  const room = new Room({
    id: revitObjectId('room-test-001') as any,
    roomId: TEST_ROOM_ID,
    levelId: TEST_LEVEL_ID,
    geometry: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ],
    isClosed: true,
    isOpen: false,
    area: squareMeters(80),
  });
  await store.createObject(room);
});

afterEach(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestWall(overrides: Partial<{ id: string; roomId: string }> = {}): Wall {
  return new Wall({
    id: revitObjectId(overrides.id ?? `wall-${Date.now()}-${Math.random()}`),
    roomId: roomId(overrides.roomId ?? 'room-test-001'),
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 5, y: 0 },
    thickness: meters(0.15),
    height: meters(3.0),
    material: 'ladrillo',
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ObjectStore — CRUD básico', () => {
  // ✅ Test 1: Crear Wall
  test('debe crear un Wall y retornar su id', async () => {
    const wall = createTestWall({ id: 'wall-001' });
    const id = await store.createObject(wall);
    expect(id).toBe('wall-001');
  });

  // ✅ Test 2: Leer Wall
  test('debe leer un Wall creado', async () => {
    const wall = createTestWall({ id: 'wall-002' });
    await store.createObject(wall);

    const read = await store.readObject(revitObjectId('wall-002'));
    expect(read).not.toBeNull();
    expect(read!.type).toBe('Wall');
    expect((read as Wall).thickness).toBeCloseTo(0.15);
    expect((read as Wall).height).toBeCloseTo(3.0);
    expect((read as Wall).material).toBe('ladrillo');
  });

  // ✅ Test 3: Actualizar Wall (thickness, material)
  test('debe actualizar thickness y material de un Wall', async () => {
    const wall = createTestWall({ id: 'wall-003' });
    await store.createObject(wall);

    await store.updateObject(revitObjectId('wall-003'), {
      thickness: meters(0.20),
      material: 'hormigón',
    } as any);

    const updated = (await store.readObject(revitObjectId('wall-003'))) as Wall;
    expect(updated).not.toBeNull();
    expect(updated.thickness).toBeCloseTo(0.20);
    expect(updated.material).toBe('hormigón');
  });

  // ✅ Test 4: Listar Walls de un Room
  test('debe listar todos los objetos de un Room', async () => {
    const wall1 = createTestWall({ id: 'wall-list-1' });
    const wall2 = createTestWall({ id: 'wall-list-2' });
    await store.createObject(wall1);
    await store.createObject(wall2);

    const objects = await store.listObjects(TEST_ROOM_ID);
    // Room base + 2 walls = 3
    expect(objects.length).toBe(3);
    const wallTypes = objects.filter((o) => o.type === 'Wall');
    expect(wallTypes.length).toBe(2);
  });

  // ✅ Test 5: Borrar Wall (soft-delete)
  test('debe soft-delete un Wall (is_deleted = true)', async () => {
    const wall = createTestWall({ id: 'wall-del-001' });
    await store.createObject(wall);

    await store.deleteObject(revitObjectId('wall-del-001'));

    // readObject debe retornar null (excluye deleted)
    const read = await store.readObject(revitObjectId('wall-del-001'));
    expect(read).toBeNull();

    // Pero sigue en la base (verificar directamente)
    const row = await db.get<{ is_deleted: number }>(
      'SELECT is_deleted FROM revit_objects WHERE id = ?',
      ['wall-del-001']
    );
    expect(row).toBeDefined();
    expect(row!.is_deleted).toBe(1);
  });
});

describe('ObjectStore — Validación de Foreign Keys', () => {
  // ✅ Test 6: Crear Door con Wall padre válido
  test('debe crear Door cuando el Wall padre existe', async () => {
    const wall = createTestWall({ id: 'wall-fk-001' });
    await store.createObject(wall);

    const door = new Door({
      id: revitObjectId('door-001'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-fk-001'),
      offsetAlongWall: meters(1.0),
      offsetPerpendicular: meters(0.0),
      width: meters(0.9),
      height: meters(2.1),
      doorType: 'swing',
    });

    const id = await store.createObject(door);
    expect(id).toBe('door-001');
  });

  // ✅ Test 7: Fallo si Door sin parentWallId existente
  test('debe fallar si Door referencia un Wall que no existe', async () => {
    const door = new Door({
      id: revitObjectId('door-bad-001'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-inexistente'),
      offsetAlongWall: meters(1.0),
      offsetPerpendicular: meters(0.0),
      width: meters(0.9),
      height: meters(2.1),
    });

    await expect(store.createObject(door)).rejects.toThrow(
      /does not exist/
    );
  });

  // ✅ Test 8: Fallo si Window referencia Wall borrado
  test('debe fallar si Window referencia un Wall que fue borrado', async () => {
    const wall = createTestWall({ id: 'wall-fk-del' });
    await store.createObject(wall);
    await store.deleteObject(revitObjectId('wall-fk-del'));

    const window = new Window({
      id: revitObjectId('window-bad-001'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-fk-del'),
      offsetAlongWall: meters(0.5),
      offsetPerpendicular: meters(0.0),
      width: meters(1.2),
      height: meters(1.2),
    });

    await expect(store.createObject(window)).rejects.toThrow(
      /does not exist/
    );
  });
});

describe('ObjectStore — Cascade Delete', () => {
  // ✅ Test 9: Borrar Wall → Doors también borradas
  test('debe cascade soft-delete Doors cuando Wall se borra', async () => {
    const wall = createTestWall({ id: 'wall-cascade-001' });
    await store.createObject(wall);

    const door1 = new Door({
      id: revitObjectId('door-cascade-1'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-cascade-001'),
      offsetAlongWall: meters(1.0),
      offsetPerpendicular: meters(0.0),
      width: meters(0.9),
      height: meters(2.1),
    });
    const door2 = new Door({
      id: revitObjectId('door-cascade-2'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-cascade-001'),
      offsetAlongWall: meters(3.0),
      offsetPerpendicular: meters(0.0),
      width: meters(0.8),
      height: meters(2.0),
    });
    await store.createObject(door1);
    await store.createObject(door2);

    // Borrar el Wall padre
    await store.deleteObject(revitObjectId('wall-cascade-001'));

    // Doors deben estar soft-deleted
    const d1 = await store.readObject(revitObjectId('door-cascade-1'));
    const d2 = await store.readObject(revitObjectId('door-cascade-2'));
    expect(d1).toBeNull();
    expect(d2).toBeNull();
  });

  // ✅ Test 10: Borrar Wall → Windows también borradas
  test('debe cascade soft-delete Windows cuando Wall se borra', async () => {
    const wall = createTestWall({ id: 'wall-cascade-win' });
    await store.createObject(wall);

    const win = new Window({
      id: revitObjectId('win-cascade-1'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-cascade-win'),
      offsetAlongWall: meters(2.0),
      offsetPerpendicular: meters(0.0),
      width: meters(1.2),
      height: meters(1.2),
      windowType: 'casement',
    });
    await store.createObject(win);

    await store.deleteObject(revitObjectId('wall-cascade-win'));

    const readWin = await store.readObject(revitObjectId('win-cascade-1'));
    expect(readWin).toBeNull();
  });
});

describe('ObjectStore — Transacciones', () => {
  // ✅ Test 11: Rollback si updateObject falla
  test('debe hacer rollback si updateObject falla', async () => {
    const wall = createTestWall({ id: 'wall-tx-001' });
    await store.createObject(wall);

    // Intentar actualizar un objeto que no existe debe fallar
    await expect(
      store.updateObject(revitObjectId('no-existe'), { thickness: meters(0.30) } as any)
    ).rejects.toThrow(/not found/);

    // El wall original debe seguir intacto
    const read = (await store.readObject(revitObjectId('wall-tx-001'))) as Wall;
    expect(read).not.toBeNull();
    expect(read.thickness).toBeCloseTo(0.15);
  });
});

describe('ObjectStore — Todos los tipos de objeto', () => {
  // ✅ Test 12: Crear Column
  test('debe crear y leer una Column', async () => {
    const col = new Column({
      id: revitObjectId('col-001'),
      roomId: TEST_ROOM_ID,
      position: { x: 5, y: 4 },
      diameter: meters(0.30),
      height: meters(3.0),
      material: 'hormigón',
    });
    await store.createObject(col);

    const read = (await store.readObject(revitObjectId('col-001'))) as Column;
    expect(read).not.toBeNull();
    expect(read.type).toBe('Column');
    expect(read.diameter).toBeCloseTo(0.30);
    expect(read.position.x).toBe(5);
    expect(read.position.y).toBe(4);
  });

  // ✅ Test 13: Crear Room
  test('debe crear y leer un Room con geometría', async () => {
    const room = new Room({
      id: revitObjectId('room-002') as any,
      roomId: roomId('room-002'),
      levelId: TEST_LEVEL_ID,
      geometry: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
      isClosed: false,
      isOpen: true,
    });
    await store.createObject(room);

    const read = (await store.readObject(revitObjectId('room-002'))) as Room;
    expect(read).not.toBeNull();
    expect(read.type).toBe('Room');
    expect(read.isOpen).toBe(true);
    expect(read.isClosed).toBe(false);
    expect(read.area).toBeNull();
  });

  // ✅ Test 14: Crear Floor (implícito)
  test('debe crear y leer un Floor implícito', async () => {
    const floor = new Floor({
      id: revitObjectId('floor-001'),
      roomId: TEST_ROOM_ID,
      isImplicit: true,
      material: 'cerámica',
      thickness: meters(0.12),
    });
    await store.createObject(floor);

    const read = (await store.readObject(revitObjectId('floor-001'))) as Floor;
    expect(read).not.toBeNull();
    expect(read.type).toBe('Floor');
    expect(read.isImplicit).toBe(true);
    expect(read.material).toBe('cerámica');
    expect(read.thickness).toBeCloseTo(0.12);
  });

  // ✅ Test 15: Crear Measurement
  test('debe crear un Measurement', async () => {
    const wall = createTestWall({ id: 'wall-meas-001' });
    await store.createObject(wall);

    const m = new Measurement({
      id: measurementId('meas-001'),
      roomId: TEST_ROOM_ID,
      wallId: wallId('wall-meas-001'),
      capture_method: 'ble',
      values_json: JSON.stringify([3.12, 3.15, 3.10, 3.14, 3.11, 3.13, 3.16]),
      average: meters(3.13),
    });
    const id = await store.createMeasurement(m);
    expect(id).toBe('meas-001');
  });

  // ✅ Test 16: Crear AuditPhoto
  test('debe crear un AuditPhoto', async () => {
    const photo = new AuditPhoto({
      id: auditPhotoId('photo-001'),
      roomId: TEST_ROOM_ID,
      foto: Buffer.from('fake-jpeg-data'),
      metadata_json: JSON.stringify({
        timestamp: Date.now(),
        filename: 'room-test-001-photo.jpg',
      }),
    });
    const id = await store.createAuditPhoto(photo);
    expect(id).toBe('photo-001');
  });

  // Gap cerrado: createAuditPhoto() existía pero no había forma de leer una
  // AuditPhoto de vuelta — ver ObjectStore.ts (readAuditPhoto/listAuditPhotos/deleteAuditPhoto).
  test('readAuditPhoto retorna la foto con su BLOB y metadata intactos', async () => {
    const photo = new AuditPhoto({
      id: auditPhotoId('photo-read-001'),
      roomId: TEST_ROOM_ID,
      foto: Buffer.from('fake-jpeg-bytes'),
      metadata_json: JSON.stringify({ timestamp: 12345, filename: 'test.jpg' }),
    });
    await store.createAuditPhoto(photo);

    const read = await store.readAuditPhoto(auditPhotoId('photo-read-001'));
    expect(read).not.toBeNull();
    expect(read!.roomId).toBe(TEST_ROOM_ID);
    expect(read!.foto?.toString()).toBe('fake-jpeg-bytes');
    expect(read!.metadata.filename).toBe('test.jpg');
  });

  test('readAuditPhoto retorna null para un id inexistente', async () => {
    const read = await store.readAuditPhoto(auditPhotoId('no-existe'));
    expect(read).toBeNull();
  });

  test('listAuditPhotos retorna las fotos de un Recinto, más recientes primero', async () => {
    await store.createAuditPhoto(
      new AuditPhoto({
        id: auditPhotoId('photo-a'),
        roomId: TEST_ROOM_ID,
        metadata_json: JSON.stringify({ timestamp: 1, filename: 'a.jpg' }),
      }),
    );
    await store.createAuditPhoto(
      new AuditPhoto({
        id: auditPhotoId('photo-b'),
        roomId: TEST_ROOM_ID,
        metadata_json: JSON.stringify({ timestamp: 2, filename: 'b.jpg' }),
      }),
    );
    // Foto de otro Recinto — no debe aparecer en el listado.
    await store.createAuditPhoto(
      new AuditPhoto({
        id: auditPhotoId('photo-other-room'),
        roomId: roomId('otro-room'),
        metadata_json: JSON.stringify({ timestamp: 3, filename: 'c.jpg' }),
      }),
    );

    const photos = await store.listAuditPhotos(TEST_ROOM_ID);
    expect(photos).toHaveLength(2);
    expect(photos.map((p) => p.id).sort()).toEqual(['photo-a', 'photo-b']);
  });

  test('deleteAuditPhoto hace soft-delete — la foto deja de listarse pero no se borra físicamente', async () => {
    await store.createAuditPhoto(
      new AuditPhoto({
        id: auditPhotoId('photo-to-delete'),
        roomId: TEST_ROOM_ID,
        metadata_json: JSON.stringify({ timestamp: 1, filename: 'x.jpg' }),
      }),
    );

    await store.deleteAuditPhoto(auditPhotoId('photo-to-delete'));

    const listed = await store.listAuditPhotos(TEST_ROOM_ID);
    expect(listed).toHaveLength(0);

    const rawRow = await db.get<{ is_deleted: number }>(
      'SELECT is_deleted FROM audit_photos WHERE id = ?',
      ['photo-to-delete'],
    );
    expect(rawRow).toBeDefined(); // sigue existiendo la fila — soft-delete, no DELETE físico
    expect(rawRow!.is_deleted).toBe(1);
  });
});

describe('ObjectStore — Casos edge', () => {
  // ✅ Test 17: readObject retorna null para id inexistente
  test('debe retornar null para un id que no existe', async () => {
    const read = await store.readObject(revitObjectId('no-existe'));
    expect(read).toBeNull();
  });

  // ✅ Test 18: deleteObject falla para id inexistente
  test('debe fallar al borrar un objeto que no existe', async () => {
    await expect(
      store.deleteObject(revitObjectId('no-existe'))
    ).rejects.toThrow(/not found/);
  });

  // ✅ Test 19: Column con embeddedInWallId
  test('debe crear Column embebida en Wall', async () => {
    const wall = createTestWall({ id: 'wall-embed-col' });
    await store.createObject(wall);

    const col = new Column({
      id: revitObjectId('col-embed-001'),
      roomId: TEST_ROOM_ID,
      position: { x: 2.5, y: 0 },
      diameter: meters(0.25),
      height: meters(3.0),
      embeddedInWallId: wallId('wall-embed-col'),
      material: 'acero',
    });
    await store.createObject(col);

    const read = (await store.readObject(revitObjectId('col-embed-001'))) as Column;
    expect(read.embeddedInWallId).toBe('wall-embed-col');
    expect(read.material).toBe('acero');
  });

  // ✅ Test 20: listObjects excluye soft-deleted
  test('listObjects debe excluir objetos soft-deleted', async () => {
    const wall = createTestWall({ id: 'wall-excl-001' });
    await store.createObject(wall);
    await store.deleteObject(revitObjectId('wall-excl-001'));

    const objects = await store.listObjects(TEST_ROOM_ID);
    const wallIds = objects.filter((o) => o.type === 'Wall').map((o) => o.id);
    expect(wallIds).not.toContain('wall-excl-001');
  });

  // -------------------------------------------------------------------------
  // Propiedades libres del usuario (nombre, notas, claves extra)
  // -------------------------------------------------------------------------

  test('las propiedades libres del usuario sobreviven al ciclo escribir → releer', async () => {
    // BUG CORREGIDO: `serializeProperties` sí las guardaba, pero `rowToObject`
    // no pasaba `properties` a ningún constructor. Renombrar un muro desde el
    // panel de propiedades parecía funcionar y el nombre desaparecía al
    // recargar el Recinto.
    const wall = createTestWall({ id: 'wall-props-001' });
    wall.properties = { name: 'Muro medianero', customKey: 42 };
    wall.notes = 'Revisar humedad';
    await store.createObject(wall);

    const read = await store.readObject(revitObjectId('wall-props-001'));
    expect(read!.properties.name).toBe('Muro medianero');
    expect(read!.properties.customKey).toBe(42);
    // `notes` es un CAMPO de RevitObjectBase, no una propiedad libre: estaba
    // declarado a la vez en `ObjectProperties` y en Wall/Column, así que
    // escribir por un camino y leer por el otro daba cosas distintas.
    expect(read!.notes).toBe('Revisar humedad');
  });

  test('las notas se guardan también en los tipos que antes no las serializaban', async () => {
    // `notes` se escribía solo dentro de las ramas de Wall y Column de
    // serializeProperties: una nota sobre una puerta o un recinto se perdía.
    const room = new Room({
      id: revitObjectId('room-notes-001'),
      roomId: TEST_ROOM_ID,
      levelId: levelId('level-1'),
      notes: 'Acceso por patio trasero',
    });
    await store.createObject(room);

    const read = await store.readObject(revitObjectId('room-notes-001'));
    expect(read!.notes).toBe('Acceso por patio trasero');
  });

  test('las propiedades libres NO se contaminan con los campos propios de la clase', async () => {
    // `thickness`, `startPoint`, `isStructural`... viven en el objeto tipado.
    // Si además aparecieran dentro de `properties`, el panel de propiedades
    // mostraría cada uno dos veces y editarlos por un camino no afectaría al otro.
    const wall = createTestWall({ id: 'wall-props-002' });
    wall.properties = { name: 'Muro' };
    await store.createObject(wall);

    const read = await store.readObject(revitObjectId('wall-props-002'));
    expect(Object.keys(read!.properties).sort()).toEqual(['name']);
  });

  test('un objeto sin propiedades libres se relee con properties vacío, no undefined', async () => {
    const wall = createTestWall({ id: 'wall-props-003' });
    await store.createObject(wall);

    const read = await store.readObject(revitObjectId('wall-props-003'));
    expect(read!.properties).toEqual({});
  });

  // -------------------------------------------------------------------------
  // restoreObject — inversa exacta de deleteObject
  // -------------------------------------------------------------------------

  test('restoreObject revierte un soft-delete', async () => {
    const wall = createTestWall({ id: 'wall-restore-001' });
    await store.createObject(wall);
    await store.deleteObject(revitObjectId('wall-restore-001'));
    expect(await store.readObject(revitObjectId('wall-restore-001'))).toBeNull();

    await store.restoreObject(revitObjectId('wall-restore-001'));

    expect(await store.readObject(revitObjectId('wall-restore-001'))).not.toBeNull();
  });

  test('restoreObject es idempotente sobre un objeto que no estaba borrado', async () => {
    // Los `Create*Command` la llaman también en su primera ejecución, donde el
    // objeto está vivo: no puede fallar ni cambiar nada en ese caso.
    const wall = createTestWall({ id: 'wall-restore-002' });
    await store.createObject(wall);

    await expect(store.restoreObject(revitObjectId('wall-restore-002'))).resolves.toBeUndefined();
    expect(await store.readObject(revitObjectId('wall-restore-002'))).not.toBeNull();
  });

  test('restoreObject sobre un id inexistente falla de forma explícita', async () => {
    await expect(store.restoreObject(revitObjectId('no-existe'))).rejects.toThrow(/not found/i);
  });

  // -------------------------------------------------------------------------
  // updateObject — todos los campos tipados, no solo algunos
  // -------------------------------------------------------------------------

  test('updateObject persiste los campos de un vano (offset, ancho, tipo)', async () => {
    // BUG CORREGIDO: la lista de campos de updateObject se escribía a mano y no
    // incluía `offsetAlongWall`, `offsetPerpendicular`, `width`, `doorType`...
    // Mover o redimensionar una puerta decía que había funcionado y al releer el
    // vano seguía exactamente igual.
    const wall = createTestWall({ id: 'wall-vano-upd' });
    await store.createObject(wall);

    const door = new Door({
      id: revitObjectId('door-upd-001'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-vano-upd'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });
    await store.createObject(door);

    await store.updateObject(revitObjectId('door-upd-001'), {
      offsetAlongWall: meters(2.5),
      offsetPerpendicular: meters(0.05),
      width: meters(1.1),
      doorType: 'abatible doble',
    } as never);

    const read = (await store.readObject(revitObjectId('door-upd-001'))) as Door;
    expect(read.offsetAlongWall).toBeCloseTo(2.5);
    expect(read.offsetPerpendicular).toBeCloseTo(0.05);
    expect(read.width).toBeCloseTo(1.1);
    expect(read.doorType).toBe('abatible doble');
  });

  test('updateObject persiste los campos de una ventana', async () => {
    const wall = createTestWall({ id: 'wall-win-upd' });
    await store.createObject(wall);

    const win = new Window({
      id: revitObjectId('win-upd-001'),
      roomId: TEST_ROOM_ID,
      parentWallId: wallId('wall-win-upd'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1.2),
    });
    await store.createObject(win);

    await store.updateObject(revitObjectId('win-upd-001'), {
      width: meters(1.6),
      glazing: 'doble bajo emisivo',
      frameType: 'PVC',
    } as never);

    const read = (await store.readObject(revitObjectId('win-upd-001'))) as Window;
    expect(read.width).toBeCloseTo(1.6);
    expect(read.glazing).toBe('doble bajo emisivo');
    expect(read.frameType).toBe('PVC');
  });

  test('updateObject sigue traduciendo dimensionX al nombre histórico diameter', async () => {
    // Es la única traducción de nombre que hay entre dominio y persistencia:
    // las filas escritas antes de la sección rectangular usan `diameter`.
    const column = new Column({
      id: revitObjectId('col-upd-001'),
      roomId: TEST_ROOM_ID,
      position: { x: 1, y: 1 },
      diameter: meters(0.3),
      height: meters(3),
    });
    await store.createObject(column);

    await store.updateObject(revitObjectId('col-upd-001'), { dimensionX: meters(0.45) } as never);

    const read = (await store.readObject(revitObjectId('col-upd-001'))) as Column;
    expect(read.dimensionX).toBeCloseTo(0.45);
  });
});
