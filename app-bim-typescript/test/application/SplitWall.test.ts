// =============================================================================
// SplitWall.test.ts — Partir un muro en un punto (H-74)
// =============================================================================
//
// Lo que no puede fallar: que ningún vano se pierda ni quede fuera de su muro,
// que el alzado (antepechos) viaje con su vano, que las mediciones sigan en los
// dos tramos y que Deshacer/Rehacer devuelvan todo de una vez.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { Room } from '../../src/domain/objects/room';
import { Measurement } from '../../src/domain/objects/measurement';
import { roomId, revitObjectId, levelId, measurementId, wallId, RoomId, RevitObjectId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';
import { extent, WallVertical } from '../../src/domain/objects/vertical';
import { placeSpan, planWallSplit } from '../../src/domain/objects/wall-split';
import { wallOpeningId } from '../../src/domain/objects/wall-elevation';

const ROOM: RoomId = roomId('split-room');
const LEVELS = new Map([
  ['piso', 0],
  ['muro', 2.5],
  ['cubierta', 3.5],
]);
// Culata a un agua: arranque al nivel Muro, final a Cubierta.
const SLOPED: WallVertical = {
  start: extent({ baseLevelId: 'piso', topLevelId: 'muro', unconnectedHeight: 2.5 }),
  end: extent({ baseLevelId: 'piso', topLevelId: 'cubierta', unconnectedHeight: 3.5 }),
};

describe('planWallSplit / placeSpan', () => {
  it('el punto de corte conserva el alzado: el tope se interpola y se ata al nivel del arranque', () => {
    const plan = planWallSplit({ x: 0, y: 0 }, { x: 6, y: 0 }, SLOPED, LEVELS, 3)!;
    expect(plan.at).toEqual({ x: 3, y: 0 });
    expect(plan.first.start).toBe(SLOPED.start);
    expect(plan.second.end).toBe(SLOPED.end);
    expect(plan.first.end).toEqual(plan.second.start);
    expect(plan.first.end).toMatchObject({ baseLevelId: 'piso', topLevelId: 'muro', topOffset: 0.5, unconnectedHeight: 3 });
  });

  it('un muro rectangular parte en dos tramos con su misma restricción', () => {
    const v = { start: SLOPED.start, end: SLOPED.start };
    const plan = planWallSplit({ x: 0, y: 0 }, { x: 4, y: 0 }, v, LEVELS, 1)!;
    expect(plan.first.end).toBe(SLOPED.start);
    expect(plan.second.start).toBe(SLOPED.start);
  });

  it('rechaza un tramo más corto que el mínimo', () => {
    expect(planWallSplit({ x: 0, y: 0 }, { x: 4, y: 0 }, SLOPED, LEVELS, 0.05)).toBeNull();
    expect(planWallSplit({ x: 0, y: 0 }, { x: 4, y: 0 }, SLOPED, LEVELS, 3.95)).toBeNull();
  });

  it('cada vano va al tramo de su centro y, si no cabe, se arrima dentro', () => {
    expect(placeSpan({ xOffset: 0.5, width: 1 }, 3, 6)).toEqual({ second: false, xOffset: 0.5, clamped: false });
    expect(placeSpan({ xOffset: 3.6, width: 1 }, 3, 6)).toEqual({ second: true, xOffset: 0.6000000000000001, clamped: false });
    expect(placeSpan({ xOffset: 2.0, width: 1.2 }, 3, 6)).toEqual({ second: false, xOffset: 1.8, clamped: true });
    expect(placeSpan({ xOffset: 2.6, width: 1.2 }, 3, 6)).toMatchObject({ second: true, xOffset: 0, clamped: true });
  });
});

describe('SplitWallUseCase', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;
  let wall: Wall;
  let door: Door;
  let win: Window;

  const read = async <T>(id: RevitObjectId) => (await services.store.readObject(id)) as T | null;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `split-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
    await services.store.createObject(new Room({ id: revitObjectId(ROOM as string), roomId: ROOM, levelId: levelId('level-1') }));
    wall = (
      await services.useCases.createWall.execute({
        roomId: ROOM,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 6, y: 0 },
        thickness: meters(0.15),
        height: meters(3.5),
      })
    ).wall;
    door = (
      await services.useCases.createDoor.execute({
        roomId: ROOM,
        parentWallId: wallId(wall.id as string),
        offsetAlongWall: meters(0.5),
        offsetPerpendicular: meters(0),
        width: meters(1),
        height: meters(2),
      })
    ).door;
    win = (
      await services.useCases.createWindow.execute({
        roomId: ROOM,
        parentWallId: wallId(wall.id as string),
        offsetAlongWall: meters(3.6),
        offsetPerpendicular: meters(0),
        width: meters(1),
        height: meters(1),
      })
    ).window;
    // Antepecho de la ventana y un hueco sin carpintería, en el alzado.
    const e = await services.elevations.getElevation(wall);
    await services.elevations.saveElevation({
      ...e,
      openings: [
        ...e.openings.map((o) => (o.vanoId === (win.id as string) ? { ...o, sillHeight: 1.4 } : o)),
        { id: wallOpeningId('hueco'), type: 'opening', xOffset: 4.5, width: 0.5, sillHeight: 0.5, height: 0.5, isFlipped: false },
      ],
    });
    await services.store.createMeasurement(
      new Measurement({ id: measurementId('m1'), roomId: ROOM, wallId: wallId(wall.id as string), capture_method: 'manual', values_json: '[6]', average: meters(6), reference: 'interior', appliedLength: 6.15 }),
    );
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('parte el muro, reparte vanos, alzado y mediciones, y se deshace y rehace en un paso', async () => {
    const { newWallId, clamped } = await services.useCases.splitWall.execute({ wallId: wall.id, distance: 3, vertical: SLOPED, levels: LEVELS });
    expect(clamped).toBe(0);

    const first = (await read<Wall>(wall.id))!;
    const second = (await read<Wall>(newWallId))!;
    expect(first.endPoint).toEqual({ x: 3, y: 0 });
    expect(second.startPoint).toEqual({ x: 3, y: 0 });
    expect(second.endPoint).toEqual({ x: 6, y: 0 });
    expect(first.vertical?.end.topOffset).toBeCloseTo(0.5);
    expect(first.height as number).toBeCloseTo(3);
    expect(second.vertical?.end).toEqual(SLOPED.end);
    expect(second.height as number).toBeCloseTo(3.5);

    expect((await read<Door>(door.id))!.parentWallId).toBe(wall.id);
    const w = (await read<Window>(win.id))!;
    expect(w.parentWallId).toBe(newWallId);
    expect(w.offsetAlongWall as number).toBeCloseTo(0.6);

    const e2 = await services.elevations.getElevation(second);
    expect(e2.openings.find((o) => o.vanoId === (win.id as string))?.sillHeight).toBe(1.4);
    expect(e2.openings.find((o) => o.id === 'hueco')?.xOffset).toBeCloseTo(1.5);
    expect((await services.elevations.getElevation(first)).openings.map((o) => o.vanoId)).toEqual([door.id]);

    const copies = await services.store.listMeasurementsForWall(wallId(newWallId as string));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ average: 6, reference: 'interior', appliedLength: null });
    expect(await services.store.listMeasurementsForWall(wallId(wall.id as string))).toHaveLength(1);

    await services.commandStack.undo();
    const back = (await read<Wall>(wall.id))!;
    expect(back.endPoint).toEqual({ x: 6, y: 0 });
    expect(back.vertical).toEqual(SLOPED);
    expect(await read(newWallId)).toBeNull();
    expect((await read<Window>(win.id))!.parentWallId).toBe(wall.id);
    expect((await read<Window>(win.id))!.offsetAlongWall as number).toBeCloseTo(3.6);
    expect(await read(door.id)).not.toBeNull();
    expect(await services.store.listMeasurementsForWall(wallId(newWallId as string))).toHaveLength(0);
    const restored = await services.elevations.getElevation(back);
    expect(restored.openings.find((o) => o.id === 'hueco')?.xOffset).toBe(4.5);
    expect(restored.openings.find((o) => o.vanoId === (win.id as string))?.sillHeight).toBe(1.4);

    await services.commandStack.redo();
    expect(await read(newWallId)).not.toBeNull();
    expect((await read<Window>(win.id))!.parentWallId).toBe(newWallId);
    expect((await read<Wall>(wall.id))!.endPoint).toEqual({ x: 3, y: 0 });
    expect(await services.store.listMeasurementsForWall(wallId(newWallId as string))).toHaveLength(1);
  });

  it('un vano sobre el corte se arrima a su tramo y se cuenta', async () => {
    const r = await services.useCases.splitWall.execute({ wallId: wall.id, distance: 4.2, vertical: SLOPED, levels: LEVELS });
    expect(r.clamped).toBe(1);
    const w = (await read<Window>(win.id))!;
    expect(w.parentWallId).toBe(wall.id);
    expect(w.offsetAlongWall as number).toBeCloseTo(3.2);
  });

  it('no parte en un punto que deja un tramo sin longitud', async () => {
    await expect(services.useCases.splitWall.execute({ wallId: wall.id, distance: 5.95, vertical: SLOPED, levels: LEVELS })).rejects.toThrow();
    expect((await read<Wall>(wall.id))!.endPoint).toEqual({ x: 6, y: 0 });
  });
});
