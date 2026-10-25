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

    await runBridgeCommand(ctx, 'undo');
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
