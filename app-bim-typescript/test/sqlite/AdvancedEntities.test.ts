// =============================================================================
// AdvancedEntities.test.ts — Persistencia de las entidades enriquecidas
// (eje polimórfico, isStructural, columnas rectangulares con rotación)
// Motor portado de LevON.
//
// Estos tests cubren el punto más frágil del port: que lo que el motor añade
// al dominio SOBREVIVA el viaje a SQLite y de vuelta. Un campo que se serializa
// pero no se rehidrata no rompe ningún test de dominio — solo pierde datos en
// silencio en el dispositivo.
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { MoveObjectUseCase } from '../../src/application/use-cases/MoveObjectUseCase';
import { CommandStack } from '../../src/application/state/CommandStack';
import {
  Wall,
  Column,
  Room,
  revitObjectId,
  roomId,
  levelId,
  RevitObjectId,
} from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';
import { arcShape, polylineShape, shapeLength } from '../../src/domain/geometry/shapes';

let db: Database;
let store: ObjectStore;

const TEST_ROOM_ID = roomId('room-adv-001');

beforeEach(async () => {
  db = new Database(':memory:');
  await db.open();
  await db.migrate();
  store = new ObjectStore(db);

  await store.createObject(
    new Room({
      id: revitObjectId('room-adv-001'),
      roomId: TEST_ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      isOpen: true,
    }),
  );
});

afterEach(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// Wall — eje polimórfico
// ---------------------------------------------------------------------------

describe('Wall con eje polimórfico', () => {
  it('deriva el eje recto desde startPoint/endPoint', () => {
    const w = new Wall({
      id: revitObjectId('w-recto'),
      roomId: TEST_ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 3, y: 4 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    expect(w.shape.kind).toBe('line');
    expect(w.isStraight).toBe(true);
    expect(w.length).toBeCloseTo(5, 9);
  });

  it('deriva startPoint/endPoint desde un eje curvo', () => {
    const w = new Wall({
      id: revitObjectId('w-curvo'),
      roomId: TEST_ROOM_ID,
      shape: arcShape({
        center: { x: 0, y: 0 },
        radius: meters(2),
        startAngle: 0,
        sweepAngle: Math.PI,
      }),
      thickness: meters(0.15),
      height: meters(2.8),
    });

    expect(w.startPoint.x).toBeCloseTo(2, 9);
    expect(w.endPoint.x).toBeCloseTo(-2, 9);
    // La longitud de un muro curvo es la del ARCO, no la de la cuerda.
    expect(w.length).toBeCloseTo(2 * Math.PI, 9);
    expect(w.isStraight).toBe(false);
  });

  it('exige shape o bien ambos extremos', () => {
    expect(
      () =>
        new Wall({
          id: revitObjectId('w-malo'),
          roomId: TEST_ROOM_ID,
          thickness: meters(0.15),
          height: meters(2.8),
        } as any),
    ).toThrow(/requiere/);
  });

  it('es portante por defecto', () => {
    const w = new Wall({
      id: revitObjectId('w-def'),
      roomId: TEST_ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    expect(w.isStructural).toBe(true);
  });

  it('no mete `shape` en geometry_json si el muro es recto', () => {
    const w = new Wall({
      id: revitObjectId('w-json'),
      roomId: TEST_ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    expect(JSON.parse(w.geometry_json)).toEqual({
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// Wall — ida y vuelta por SQLite
// ---------------------------------------------------------------------------

describe('Wall — persistencia', () => {
  it('conserva un eje de arco tras releer de la base de datos', async () => {
    const id = revitObjectId('w-arco-db');
    await store.createObject(
      new Wall({
        id,
        roomId: TEST_ROOM_ID,
        shape: arcShape({
          center: { x: 1, y: 1 },
          radius: meters(2.5),
          startAngle: 0.25,
          sweepAngle: Math.PI / 3,
        }),
        thickness: meters(0.2),
        height: meters(3),
      }),
    );

    const leido = (await store.readObject(id)) as Wall;
    expect(leido.shape.kind).toBe('arc');
    if (leido.shape.kind !== 'arc') return;
    expect(leido.shape.center).toEqual({ x: 1, y: 1 });
    expect(leido.shape.radius).toBeCloseTo(2.5, 9);
    expect(leido.shape.sweepAngle).toBeCloseTo(Math.PI / 3, 9);
  });

  it('conserva un eje de polilínea y su longitud', async () => {
    const id = revitObjectId('w-poli-db');
    const shape = polylineShape([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ]);
    await store.createObject(
      new Wall({ id, roomId: TEST_ROOM_ID, shape, thickness: meters(0.15), height: meters(2.8) }),
    );

    const leido = (await store.readObject(id)) as Wall;
    expect(leido.shape.kind).toBe('polyline');
    expect(leido.length).toBeCloseTo(shapeLength(shape), 9);
  });

  it('conserva isStructural = false', async () => {
    const id = revitObjectId('w-tabique');
    await store.createObject(
      new Wall({
        id,
        roomId: TEST_ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 2, y: 0 },
        thickness: meters(0.08),
        height: meters(2.8),
        isStructural: false,
        notes: 'tabique de pladur',
      }),
    );

    const leido = (await store.readObject(id)) as Wall;
    expect(leido.isStructural).toBe(false);
    expect(leido.notes).toBe('tabique de pladur');
  });

  it('trata como portante un muro guardado antes de existir el campo', async () => {
    // Simula una fila anterior a la migración: sin isStructural en properties.
    const id = revitObjectId('w-legacy');
    await db.run(
      `INSERT INTO revit_objects (id, object_type, room_id, geometry_json, properties_json, is_deleted, created_at, updated_at)
       VALUES (?, 'Wall', ?, ?, ?, 0, ?, ?)`,
      [
        id as string,
        TEST_ROOM_ID as string,
        JSON.stringify({ startPoint: { x: 0, y: 0 }, endPoint: { x: 4, y: 0 } }),
        JSON.stringify({
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 4, y: 0 },
          thickness: 0.15,
          height: 2.8,
        }),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const leido = (await store.readObject(id)) as Wall;
    expect(leido.isStructural).toBe(true);
    expect(leido.shape.kind).toBe('line');
    expect(leido.length).toBeCloseTo(4, 9);
  });
});

// ---------------------------------------------------------------------------
// Wall — mover un muro curvo
// ---------------------------------------------------------------------------

describe('MoveObjectUseCase con eje curvo', () => {
  it('traslada el arco en vez de degradarlo a recta', async () => {
    const id = revitObjectId('w-mover-arco');
    await store.createObject(
      new Wall({
        id,
        roomId: TEST_ROOM_ID,
        shape: arcShape({
          center: { x: 0, y: 0 },
          radius: meters(2),
          startAngle: 0,
          sweepAngle: Math.PI / 2,
        }),
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    const original = (await store.readObject(id)) as Wall;
    const useCase = new MoveObjectUseCase(store, new CommandStack(store));

    await useCase.execute({
      objectId: id as RevitObjectId,
      newStartPoint: { x: original.startPoint.x + 5, y: original.startPoint.y + 5 },
    });

    const movido = (await store.readObject(id)) as Wall;

    expect(movido.shape.kind).toBe('arc');
    if (movido.shape.kind !== 'arc') return;
    expect(movido.shape.center).toEqual({ x: 5, y: 5 });
    // La curvatura y la longitud sobreviven al movimiento.
    expect(movido.length).toBeCloseTo(original.length, 9);
  });
});

// ---------------------------------------------------------------------------
// Column — sección rectangular y rotación
// ---------------------------------------------------------------------------

describe('Column con sección rectangular', () => {
  it('sigue siendo circular por defecto, con diameter como alias', () => {
    const c = new Column({
      id: revitObjectId('c-circ'),
      roomId: TEST_ROOM_ID,
      position: { x: 1, y: 1 },
      diameter: meters(0.4),
      height: meters(3),
    });

    expect(c.isCircular).toBe(true);
    expect(c.diameter).toBeCloseTo(0.4, 9);
    expect(c.dimensionX).toBeCloseTo(0.4, 9);
    // Una circular no arrastra un dimensionY heredado.
    expect(c.dimensionY).toBe(0);
    expect(c.footprint()).toBeNull();
  });

  it('usa dimensionX como lado y lo duplica si no se da el canto', () => {
    const c = new Column({
      id: revitObjectId('c-cuadrada'),
      roomId: TEST_ROOM_ID,
      position: { x: 0, y: 0 },
      sectionShape: 'rectangular',
      dimensionX: meters(0.3),
      height: meters(3),
    });

    expect(c.width).toBeCloseTo(0.3, 9);
    expect(c.depth).toBeCloseTo(0.3, 9);
  });

  it('calcula la huella sin rotación', () => {
    const c = new Column({
      id: revitObjectId('c-rect'),
      roomId: TEST_ROOM_ID,
      position: { x: 10, y: 20 },
      sectionShape: 'rectangular',
      dimensionX: meters(0.4),
      dimensionY: meters(0.6),
      height: meters(3),
    });

    const huella = c.footprint();
    expect(huella).not.toBeNull();
    if (!huella) return;
    expect(huella).toHaveLength(4);
    expect(huella[0].x).toBeCloseTo(9.8, 9);
    expect(huella[0].y).toBeCloseTo(19.7, 9);
    expect(huella[2].x).toBeCloseTo(10.2, 9);
    expect(huella[2].y).toBeCloseTo(20.3, 9);
  });

  it('aplica la rotación a la huella conservando el área', () => {
    const base = {
      id: revitObjectId('c-rot'),
      roomId: TEST_ROOM_ID,
      position: { x: 0, y: 0 },
      sectionShape: 'rectangular' as const,
      dimensionX: meters(0.4),
      dimensionY: meters(0.6),
      height: meters(3),
    };

    const girada = new Column({ ...base, rotation: Math.PI / 2 });
    const huella = girada.footprint();
    expect(huella).not.toBeNull();
    if (!huella) return;

    // Girar 90° intercambia ancho y canto en coordenadas mundo.
    const xs = huella.map((p) => p.x);
    const ys = huella.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.4, 9);
  });

  it('conserva sección, canto y rotación tras releer de la base de datos', async () => {
    const id = revitObjectId('c-rect-db');
    await store.createObject(
      new Column({
        id,
        roomId: TEST_ROOM_ID,
        position: { x: 2, y: 3 },
        sectionShape: 'rectangular',
        dimensionX: meters(0.35),
        dimensionY: meters(0.55),
        rotation: Math.PI / 6,
        height: meters(3.2),
        notes: 'pilar de esquina',
      }),
    );

    const leida = (await store.readObject(id)) as Column;
    expect(leida.sectionShape).toBe('rectangular');
    expect(leida.dimensionX).toBeCloseTo(0.35, 9);
    expect(leida.dimensionY).toBeCloseTo(0.55, 9);
    expect(leida.rotation).toBeCloseTo(Math.PI / 6, 9);
    expect(leida.notes).toBe('pilar de esquina');
  });

  it('lee como circular una columna guardada antes de existir el campo', async () => {
    const id = revitObjectId('c-legacy');
    await db.run(
      `INSERT INTO revit_objects (id, object_type, room_id, geometry_json, properties_json, is_deleted, created_at, updated_at)
       VALUES (?, 'Column', ?, ?, ?, 0, ?, ?)`,
      [
        id as string,
        TEST_ROOM_ID as string,
        JSON.stringify({ position: { x: 1, y: 1 } }),
        JSON.stringify({ position: { x: 1, y: 1 }, diameter: 0.3, height: 3 }),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const leida = (await store.readObject(id)) as Column;
    expect(leida.isCircular).toBe(true);
    expect(leida.diameter).toBeCloseTo(0.3, 9);
    expect(leida.rotation).toBe(0);
  });
});
