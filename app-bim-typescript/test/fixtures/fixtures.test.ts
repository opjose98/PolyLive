// =============================================================================
// fixtures.test.ts — Sanity checks sobre los propios fixtures
//
// Los fixtures son datos, pero varios de ellos codifican invariantes (área
// esperada, conteo de objetos, relaciones parentWallId) que vale la pena
// verificar una sola vez aquí — si un fixture se rompe, es mejor que falle
// este test rápido y no 10 tests distintos que lo consumen.
// =============================================================================

import { Wall, Door, Column, Floor, AuditPhoto, Measurement, Room } from '../../src/domain/objects';
import { CDT } from '../../src/domain/geometry/CDT';
import {
  createFixtureRoom1,
  createFixtureWall1,
  createFixtureWall2,
  createFixtureWall3,
  createFixtureWall4,
  createFixtureWalls1to4,
  createFixtureRoomLShape,
  createFixturePolygonComplex,
  createFixturePointArray100,
  createFixtureDoor1,
  createFixtureDoor2,
  createFixtureColumn1,
  createFixtureFloor1,
  createFixtureMeasurement1,
  createFixturePhoto1,
  createFixtureCommandSequence,
  createRoomFixtureSquare,
  createRoomFixtureLShape,
  createRoomFixtureWithColumn,
  createRoomFixtureWithDoors,
  createRoomFixtureBad,
  createRoomFixtureWithPhotos,
  createRoomFixtureWithBleMeasurements,
} from './index';

describe('geometry.fixtures', () => {
  it('createFixtureRoom1 is a 4×3 rectangle with id === roomId', () => {
    const room = createFixtureRoom1();
    expect(room).toBeInstanceOf(Room);
    expect(room.id as unknown as string).toBe(room.roomId as unknown as string);
    expect(room.geometry).toHaveLength(4);
  });

  it('createFixtureWalls1to4 forms a closed perimeter matching room-1', () => {
    const [w1, w2, w3, w4] = createFixtureWalls1to4();
    expect(w1.endPoint).toEqual(w2.startPoint);
    expect(w2.endPoint).toEqual(w3.startPoint);
    expect(w3.endPoint).toEqual(w4.startPoint);
    expect(w4.endPoint).toEqual(w1.startPoint);
    [w1, w2, w3, w4].forEach((w) => expect(w).toBeInstanceOf(Wall));
  });

  it('individual wall fixtures match the aggregate helper', () => {
    expect(createFixtureWall1().id).toBe(createFixtureWalls1to4()[0].id);
    expect(createFixtureWall2().startPoint).toEqual({ x: 4, y: 0 });
    expect(createFixtureWall3().startPoint).toEqual({ x: 4, y: 3 });
    expect(createFixtureWall4().endPoint).toEqual({ x: 0, y: 0 });
  });

  it('createFixtureRoomLShape triangulates to 27 m² via the real CDT', () => {
    const room = createFixtureRoomLShape();
    const cdt = new CDT();
    const result = cdt.triangulate({ vertices: room.geometry, isClosed: true });
    expect(result.valid).toBe(true);
    expect(result.totalArea as unknown as number).toBeCloseTo(27, 6);
  });

  it('createFixturePolygonComplex triangulates without self-intersection', () => {
    const cdt = new CDT();
    const result = cdt.triangulate(createFixturePolygonComplex());
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.type === 'self_intersecting_polygon')).toBe(false);
  });

  it('createFixturePointArray100 returns exactly 100 distinct points', () => {
    const points = createFixturePointArray100();
    expect(points).toHaveLength(100);
    const unique = new Set(points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`));
    expect(unique.size).toBe(100);
  });
});

describe('bim.fixtures', () => {
  it('createFixtureDoor1/2 reference wall-1 and wall-2 respectively', () => {
    expect(createFixtureDoor1()).toBeInstanceOf(Door);
    expect(createFixtureDoor1().parentWallId).toBe('wall-1');
    expect(createFixtureDoor2().parentWallId).toBe('wall-2');
  });

  it('createFixtureColumn1 sits at the geometric center of room-1', () => {
    const col = createFixtureColumn1();
    expect(col).toBeInstanceOf(Column);
    expect(col.position).toEqual({ x: 2, y: 1.5 });
  });

  it('createFixtureFloor1 is implicit', () => {
    const floor = createFixtureFloor1();
    expect(floor).toBeInstanceOf(Floor);
    expect(floor.isImplicit).toBe(true);
  });

  it('createFixtureMeasurement1 averages to 3.45m ± 0.05m from 7 BLE samples', () => {
    const m = createFixtureMeasurement1();
    expect(m).toBeInstanceOf(Measurement);
    expect(m.capture_method).toBe('ble');
    expect(m.samples).toHaveLength(7);
    expect(m.average as unknown as number).toBeCloseTo(3.45, 2);
    const avgOfSamples = m.samples.reduce((a, b) => a + b, 0) / m.samples.length;
    expect(Math.abs(avgOfSamples - 3.45)).toBeLessThanOrEqual(0.05);
  });
});

describe('photo.fixtures', () => {
  it('createFixturePhoto1 carries a small, recognizable JPEG BLOB', () => {
    const photo = createFixturePhoto1();
    expect(photo).toBeInstanceOf(AuditPhoto);
    expect(photo.foto).not.toBeNull();
    expect(photo.foto!.length).toBeLessThan(100);
    // Cabecera JPEG (SOI) y cola (EOI)
    expect(photo.foto![0]).toBe(0xff);
    expect(photo.foto![1]).toBe(0xd8);
    expect(photo.foto![photo.foto!.length - 2]).toBe(0xff);
    expect(photo.foto![photo.foto!.length - 1]).toBe(0xd9);
  });

  it('createFixturePhoto1 can be linked to an object via overrides', () => {
    const wall = createFixtureWall1();
    const linked = createFixturePhoto1({ linkedObjectId: wall.id });
    expect(linked.linkedObjectId).toBe(wall.id);
  });
});

describe('command.fixtures', () => {
  it('createFixtureCommandSequence returns exactly 3 commands: CreateWall, MoveWall, UpdateThickness', () => {
    const { wall, commands } = createFixtureCommandSequence();
    expect(commands).toHaveLength(3);
    expect(commands[0].type).toBe('CreateWall');
    expect(commands[1].type).toBe('MoveObject');
    expect(commands[2].type).toBe('UpdateObjectProperty');
    expect(wall).toBeInstanceOf(Wall);
  });
});

describe('room-scenarios.fixtures', () => {
  it('room-square: 4 walls + 1 floor, area 12 m²', () => {
    const fx = createRoomFixtureSquare();
    expect(fx.objects).toHaveLength(fx.expectedObjectCount);
    expect(fx.expectedObjectCount).toBe(5);
    expect(fx.expectedArea as unknown as number).toBe(12);
  });

  it('room-L: 6 walls + 1 floor, area matches real CDT triangulation (27 m²)', () => {
    const fx = createRoomFixtureLShape();
    expect(fx.objects).toHaveLength(7);
    const cdt = new CDT();
    const result = cdt.triangulate({ vertices: fx.room.geometry, isClosed: true });
    expect(result.totalArea as unknown as number).toBeCloseTo(fx.expectedArea as unknown as number, 6);
  });

  it('room-with-column: 4 walls + 1 column + 1 floor', () => {
    const fx = createRoomFixtureWithColumn();
    expect(fx.objects.filter((o) => o instanceof Wall)).toHaveLength(4);
    expect(fx.objects.filter((o) => o instanceof Column)).toHaveLength(1);
    expect(fx.objects.filter((o) => o instanceof Floor)).toHaveLength(1);
    expect(fx.objects).toHaveLength(fx.expectedObjectCount);
  });

  it('room-with-doors: both doors reference a wall that exists in objects[]', () => {
    const fx = createRoomFixtureWithDoors();
    const wallIds = new Set(fx.objects.filter((o) => o instanceof Wall).map((o) => o.id as unknown as string));
    const doors = fx.objects.filter((o): o is Door => o instanceof Door);
    expect(doors).toHaveLength(2);
    for (const door of doors) {
      expect(wallIds.has(door.parentWallId as unknown as string)).toBe(true);
    }
  });

  it('bad-room: wall-c crosses wall-a at a non-endpoint location, never closes', () => {
    const fx = createRoomFixtureBad();
    expect(fx.objects).toHaveLength(3);
    expect(fx.expectedArea).toBeNull();
    expect(fx.room.isOpen).toBe(true);

    // wall-a va de (0,0) a (5,0); wall-c cruza en x=2 sin compartir extremos.
    const wallA = fx.objects[0] as Wall;
    const wallC = fx.objects[2] as Wall;
    expect(wallA.startPoint).toEqual({ x: 0, y: 0 });
    expect(wallC.startPoint.x).toBe(2);
    expect(wallC.startPoint.y).toBeLessThan(wallA.startPoint.y); // cruza "por debajo" del eje de wall-a
    expect(wallC.endPoint.y).toBeGreaterThan(wallA.startPoint.y); // y "por arriba" — confirma el cruce
  });

  it('room-with-photos: 2 audit photos link to the first two walls, 1 context photo is unlinked', () => {
    const fx = createRoomFixtureWithPhotos();
    expect(fx.photos).toHaveLength(3);
    const walls = fx.objects.filter((o): o is Wall => o instanceof Wall);
    const [audit1, audit2, context] = fx.photos!;
    expect(audit1.linkedObjectId).toBe(walls[0].id);
    expect(audit2.linkedObjectId).toBe(walls[1].id);
    expect(context.linkedObjectId).toBeUndefined();
  });

  it('room-with-ble-measurements: each wall has exactly one BLE measurement', () => {
    const fx = createRoomFixtureWithBleMeasurements();
    const walls = fx.objects.filter((o): o is Wall => o instanceof Wall);
    expect(walls).toHaveLength(4);
    expect(fx.measurements).toHaveLength(4);
    for (const m of fx.measurements!) {
      expect(m.capture_method).toBe('ble');
      expect(walls.some((w) => (w.id as unknown as string) === (m.wallId as unknown as string))).toBe(true);
    }
  });
});
