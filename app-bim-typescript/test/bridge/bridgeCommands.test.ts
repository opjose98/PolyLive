// =============================================================================
// bridgeCommands.test.ts — Puente de control directo: lo que crea es lo mismo
// que dibujar a mano (casos de uso, niveles por nombre, antepechos, deshacer)
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { EditorController } from '../../src/application/editor/EditorController';
import { BridgeContext, runBridgeCommand } from '../../src/application/bridge/bridgeCommands';
import { revitObjectId } from '../../src/domain/objects/base';
import { Wall } from '../../src/domain/objects/wall';

describe('puente: comandos', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;
  let ctx: BridgeContext;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `bridge-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
    const project = await services.projects.createProject({ name: 'Sede', author: 'QA' });
    const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Aula' });
    const editor = new EditorController({ services, roomId: room.roomId, roomObjectId: room.id, initialTransform: { scale: 100, offsetX: 0, offsetY: 0 } });
    await editor.init();
    ctx = { services, editor, projectId: project.id as string, spaceId: room.roomId as string };
    await runBridgeCommand(ctx, 'setLevels', { levels: [{ name: 'Piso', value: 0 }, { name: 'Muro', value: 2.5 }, { name: 'Cubierta', value: 3.5 }] });
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('crea una culata con estación, una ventana con antepecho y un andén; se lee y se deshace', async () => {
    const [wallId] = (await runBridgeCommand(ctx, 'ops', {
      list: [{ op: 'wall', start: [0, 0], end: [7, 0], thickness: 0.15, v: { base: 'Piso', top: 'Muro' }, stations: [{ at: 3.5, top: 'Cubierta' }] }],
    })) as string[];
    const [winId, floorId] = (await runBridgeCommand(ctx, 'ops', {
      list: [
        { op: 'window', wall: wallId, offset: 1, width: 1.2, height: 1.1, sill: 1.1 },
        { op: 'floor', outline: [[0, -2], [7, -2], [7, -0.2], [0, -0.2]], thickness: 0.1 },
      ],
    })) as string[];

    const w = (await services.store.readObject(revitObjectId(wallId))) as Wall;
    expect(w.vertical?.stations).toHaveLength(1);
    expect(w.height as number).toBeCloseTo(3.5);

    const objs = (await runBridgeCommand(ctx, 'objects')) as {
      walls: { tops: number[]; stations?: { at: number; top: string }[] }[];
      windows: { id: string; sill: number }[];
      floors: { id: string; outline?: unknown[] }[];
    };
    expect(objs.walls[0].tops).toEqual([2.5, 3.5, 2.5]);
    expect(objs.walls[0].stations?.[0]).toMatchObject({ at: 3.5, top: 'Cubierta' });
    expect(objs.windows.find((x) => x.id === winId)?.sill).toBe(1.1);
    expect(objs.floors.find((f) => f.id === floorId)?.outline).toHaveLength(4);

    await runBridgeCommand(ctx, 'ops', { list: [{ op: 'props', id: floorId, set: { name: 'Andén', thickness: 0.12 } }] });
    const named = ((await runBridgeCommand(ctx, 'objects')) as { floors: { id: string; name?: string; thickness: number }[] }).floors.find((f) => f.id === floorId);
    expect(named).toMatchObject({ name: 'Andén', thickness: 0.12 });
    // Un vano sin carpintería por el puente es un paso de deshacer, como en la pantalla.
    await runBridgeCommand(ctx, 'ops', { list: [{ op: 'opening', wall: wallId, offset: 4, width: 0.8, height: 2, sill: 0 }] });
    expect(((await runBridgeCommand(ctx, 'objects')) as { openings: unknown[] }).openings).toHaveLength(1);
    await runBridgeCommand(ctx, 'undo');
    expect(((await runBridgeCommand(ctx, 'objects')) as { openings: unknown[] }).openings).toHaveLength(0);

    // Espesor y nombre son dos pasos; el tercero quita el andén.
    for (let i = 0; i < 3; i++) await runBridgeCommand(ctx, 'undo');

    expect(((await runBridgeCommand(ctx, 'objects')) as { floors: unknown[] }).floors).toHaveLength(0);
  });

  it('un nivel desconocido da un error que lista los niveles', async () => {
    await expect(runBridgeCommand(ctx, 'ops', { list: [{ op: 'wall', start: [0, 0], end: [3, 0], v: { top: 'Techo' } }] })).rejects.toThrow(
      /op 0 \(wall\): No hay nivel "Techo"\. Niveles: Piso, Muro, Cubierta/,
    );
  });

  it('sin espacio abierto pide usar open', async () => {
    await expect(runBridgeCommand({ ...ctx, editor: null, spaceId: null }, 'objects')).rejects.toThrow(/open/);
  });
});

describe('puente: corte y columna', () => {
  it('un corte a través de un muro con ventana y de una columna embebida', async () => {
    const dbPath = path.join(os.tmpdir(), `bridge2-${Date.now()}.db`);
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const services = createAppServices(db);
    const project = await services.projects.createProject({ name: 'Sede', author: 'QA' });
    const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Aula' });
    const editor = new EditorController({ services, roomId: room.roomId, roomObjectId: room.id, initialTransform: { scale: 100, offsetX: 0, offsetY: 0 } });
    await editor.init();
    const ctx: BridgeContext = { services, editor, projectId: project.id as string, spaceId: room.roomId as string };
    await runBridgeCommand(ctx, 'setLevels', { levels: [{ name: 'Piso', value: 0 }, { name: 'Muro', value: 2.5 }] });
    const [wall] = (await runBridgeCommand(ctx, 'ops', { list: [{ op: 'wall', start: [0, 0], end: [6, 0], thickness: 0.2, v: { base: 'Piso', top: 'Muro' } }] })) as string[];
    const [, col] = (await runBridgeCommand(ctx, 'ops', {
      list: [
        { op: 'window', wall, offset: 1, width: 1, height: 1, sill: 1 },
        { op: 'column', at: [4, 0], w: 0.25, d: 0.25, v: { base: 'Piso', top: 'Muro', topOffset: 0.2 } },
      ],
    })) as string[];

    // Corte perpendicular por la ventana: el muro abajo y arriba del hueco.
    const s1 = (await runBridgeCommand(ctx, 'section', { a: [1.5, -1], b: [1.5, 1] })) as { cuts: { kind: string; y0: number; y1: number }[] };
    expect(s1.cuts.filter((c) => c.kind === 'wall').map((c) => [c.y0, c.y1])).toEqual([
      [0, 1],
      [2, 2.5],
    ]);
    // Corte por la columna: la columna sobresale 20 cm del muro.
    const s2 = (await runBridgeCommand(ctx, 'section', { a: [4, -1], b: [4, 1] })) as { cuts: { kind: string; y1: number }[] };
    expect(s2.cuts.find((c) => c.kind === 'column')?.y1).toBeCloseTo(2.7);

    // Alzado de la columna: el muro atraviesa dos de sus caras.
    const cv = (await runBridgeCommand(ctx, 'columnView', { id: col })) as { length: number; cuts: { id: string }[]; dividers: unknown[] };
    expect(cv.length).toBeCloseTo(1);
    expect(cv.dividers).toHaveLength(4);
    expect(cv.cuts.filter((c) => c.id === wall)).toHaveLength(2);
    await db.close();
    fs.rmSync(dbPath, { force: true });
  });
});

describe('puente: proyecto nuevo y cortes guardados', () => {
  it('crea el proyecto con su espacio y niveles, y guarda un corte que se lista y se proyecta', async () => {
    const dbPath = path.join(os.tmpdir(), `bridge3-${Date.now()}.db`);
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const services = createAppServices(db);
    const base: BridgeContext = { services, editor: null, projectId: null, spaceId: null };
    const made = (await runBridgeCommand(base, 'createProject', {
      name: 'NARG29 PRUEBA',
      space: 'B1 Primer piso',
      levels: [{ name: 'Piso', value: 0 }, { name: 'Muro', value: 2.5 }, { name: 'Cubierta', value: 3.4 }],
    })) as { project: string; space: string };
    const editor = new EditorController({ services, roomId: made.space as never, roomObjectId: made.space as never, initialTransform: { scale: 100, offsetX: 0, offsetY: 0 } });
    await editor.init();
    const ctx: BridgeContext = { ...base, editor, projectId: made.project, spaceId: made.space };
    expect(((await runBridgeCommand(ctx, 'levels')) as { levels: { name: string }[] }).levels.map((l) => l.name)).toEqual(['Piso', 'Muro', 'Cubierta']);

    await runBridgeCommand(ctx, 'ops', { list: [{ op: 'wall', start: [0, 0], end: [6, 0], thickness: 0.15, v: { base: 'Piso', top: 'Muro' } }] });
    const [sec] = (await runBridgeCommand(ctx, 'ops', { list: [{ op: 'section', a: [3, -2], b: [3, 2], name: 'Transversal' }] })) as string[];
    const objs = (await runBridgeCommand(ctx, 'objects')) as { sections: { id: string; name: string }[] };
    expect(objs.sections).toEqual([{ id: sec, name: 'Transversal', a: [3, -2], b: [3, 2] }]);
    const cut = (await runBridgeCommand(ctx, 'section', { a: [3, -2], b: [3, 2] })) as { cuts: unknown[] };
    expect(cut.cuts).toHaveLength(1);
    await db.close();
    fs.rmSync(dbPath, { force: true });
  });
});
