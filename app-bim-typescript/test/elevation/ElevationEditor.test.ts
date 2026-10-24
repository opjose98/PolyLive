// =============================================================================
// ElevationEditor.test.ts — El alzado de un muro, contra SQLite real
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { ElevationEditor } from '../../src/application/elevation/ElevationEditor';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { roomId, revitObjectId, wallId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';
import { ProjectMarker } from '../../src/domain/objects/marker';
import { extent } from '../../src/domain/objects/vertical';
import { drawElevation } from '../../src/ui/canvas/elevationRenderer';
import type { ICanvasRenderer } from '../../src/native/canvas/SkiaCanvasAdapter';

const ROOM = roomId('elev-room');
const LEVELS: ProjectMarker[] = [
  { id: 'n0', projectId: 'p', kind: 'level', name: 'Nivel 0', value: 0, isBase: true },
  { id: 'n1', projectId: 'p', kind: 'level', name: 'Nivel 1', value: 3, isBase: false },
];

describe('ElevationEditor', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;
  let ed: ElevationEditor;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `elev-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
    await services.store.createObject(
      new Wall({
        id: revitObjectId('w1'),
        roomId: ROOM,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 4, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );
    ed = new ElevationEditor({ services, wallId: 'w1', levels: LEVELS });
    ed.setSize(400, 600);
    await ed.load();
    // Vista conocida: 100 px/m, CSL 0 en (0, 500).
    ed.setViewport({ scale: 100, offsetX: 0, offsetY: 500 });
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('carga el muro y las líneas de nivel del proyecto', () => {
    const s = ed.getState();
    expect(s.wall?.id).toBe('w1');
    expect(s.levelLines.map((l) => [l.name, l.y])).toEqual([
      ['Nivel 0', 0],
      ['Nivel 1', 3],
    ]);
  });

  it('el lado B es el espejo del A', () => {
    expect(ed.toCsl(100, 400)).toEqual({ x: 1, y: 1 });
    ed.setSide('B');
    expect(ed.toCsl(100, 400)).toEqual({ x: 3, y: 1 });
    expect(ed.toScreen({ x: 3, y: 1 })).toEqual({ x: 100, y: 400 });
  });

  it('con una herramienta, un toque coloca el hueco centrado y crea su vano en planta', async () => {
    ed.setTool('door');
    await ed.tap(200, 450, 22);
    const e = ed.getState().elevation!;
    expect(e.openings).toHaveLength(1);
    expect(e.openings[0].xOffset).toBeCloseTo(2 - 0.45);
    const doors = (await services.store.listObjects(ROOM)).filter((o) => o instanceof Door);
    expect(doors).toHaveLength(1);
    expect(ed.getState().selectedId).toBe(e.openings[0].id);
  });

  it('arrastrar el hueco seleccionado lo mueve y se engancha al centro del muro', async () => {
    ed.setTool('window');
    await ed.tap(100, 350, 22, { width: 1 }); // centro en x=1 → xOffset 0.5
    ed.setTool('select');
    const o = ed.selected!;
    expect(ed.beginDrag(100, 350, 22)).toBe(true);
    ed.updateDrag(203, 350, 22); // +1.03 m → centro 2.03, se engancha a 2 (centro del muro)
    await ed.endDrag();
    const moved = ed.getState().elevation!.openings.find((x) => x.id === o.id)!;
    expect(moved.xOffset + moved.width / 2).toBeCloseTo(2);
  });

  it('las puertas de la planta aparecen en el alzado; borrarlas en planta las quita', async () => {
    const door = new Door({
      id: revitObjectId('d-plan'),
      roomId: ROOM,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.8),
      height: meters(2),
    });
    await services.store.createObject(door);
    await ed.load(false);
    expect(ed.getState().elevation!.openings).toMatchObject([{ type: 'door', xOffset: 1, width: 0.8, vanoId: 'd-plan' }]);

    await services.store.deleteObject(door.id);
    await ed.load(false);
    expect(ed.getState().elevation!.openings).toHaveLength(0);
  });

  it('con restricciones de nivel dibuja el perfil real', async () => {
    const ok = await ed.saveVertical({
      start: extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 2.8 }),
      end: extent({ baseLevelId: 'n0', unconnectedHeight: 4.5 }),
    });
    expect(ok).toBe(true);
    const lv = ed.getState().elevation!.levels;
    expect(lv.leftHeight).toBeCloseTo(3);
    expect(lv.rightHeight).toBeCloseTo(4.5);
    expect(Number(ed.quantification!.grossArea)).toBeCloseTo(4 * 3.75);
  });

  it('estaciones: se crean con la altura que había, se editan con el selector y se arrastran', async () => {
    const rect = extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 3 });
    expect(await ed.saveVertical({ start: rect, end: rect })).toBe(true);

    ed.setTool('station');
    await ed.tap(200, 450, 22); // x = 2 m, lejos de los vértices
    let w = (await services.store.readObject(revitObjectId('w1'))) as Wall;
    expect(w.vertical?.stations).toEqual([{ at: 2, ext: rect }]);
    expect(ed.getState().selectedPoint).toEqual({ kind: 'station', at: 2 });

    // Deslizador: sin confirmar solo se ve; al confirmar se guarda.
    await ed.setPointExtent({ ...rect, topOffset: 1 }, false);
    expect(Number(ed.quantification!.grossArea)).toBeCloseTo(4 * 3 + (4 * 1) / 2);
    w = (await services.store.readObject(revitObjectId('w1'))) as Wall;
    expect(w.vertical?.stations?.[0].ext.topOffset).toBe(0);
    await ed.setPointExtent({ ...rect, topOffset: 1 }, true);
    w = (await services.store.readObject(revitObjectId('w1'))) as Wall;
    expect(w.vertical?.stations?.[0].ext.topOffset).toBe(1);
    expect(w.height as number).toBeCloseTo(4);

    // Tocar el vértice lo selecciona; arrastrarlo lo mueve a lo largo del muro.
    ed.setTool('select');
    ed.selectPoint(null);
    await ed.tap(200, 100, 22); // tope de la estación: (2, 4)
    expect(ed.getState().selectedPoint).toEqual({ kind: 'station', at: 2 });
    expect(ed.beginDrag(200, 100, 22)).toBe(true);
    ed.updateDrag(300, 100, 22);
    await ed.endDrag();
    w = (await services.store.readObject(revitObjectId('w1'))) as Wall;
    expect(w.vertical?.stations?.map((s) => s.at)).toEqual([3]);

    // Los extremos también se seleccionan y se editan.
    await ed.tap(0, 200, 22);
    expect(ed.getState().selectedPoint).toEqual({ kind: 'start' });

    ed.selectPoint({ kind: 'station', at: 3 });
    expect(await ed.removeSelectedStation()).toBe(true);
    w = (await services.store.readObject(revitObjectId('w1'))) as Wall;
    expect(w.vertical?.stations).toBeUndefined();
  });

  it('el renderer dibuja en espejo el lado B', () => {
    const calls: { op: string; args: unknown[] }[] = [];
    const r = new Proxy({} as ICanvasRenderer, {
      get: (_t, op: string) => (...args: unknown[]) => {
        calls.push({ op, args });
      },
    });
    const s = ed.getState();
    const scene = {
      elevation: { ...s.elevation!, openings: [{ id: 'o' as never, type: 'window' as const, xOffset: 0.5, width: 1, sillHeight: 1, height: 1, isFlipped: false }] },
      wallLength: 4,
      viewport: s.viewport,
      width: 400,
      height: 600,
      selectedOpeningId: null,
      severityByOpening: new Map(),
      showGrid: false,
      showLabels: true,
      levelLines: s.levelLines,
    };
    const firstOpeningX = (mirrored: boolean) => {
      calls.length = 0;
      drawElevation(r, { ...scene, mirrored });
      const polys = calls.filter((c) => c.op === 'fillPolygon');
      return Math.min(...(polys[1].args[0] as { x: number }[]).map((p) => p.x));
    };
    expect(firstOpeningX(false)).toBeCloseTo(50);
    expect(firstOpeningX(true)).toBeCloseTo(250);
    // Rótulos de nivel fijos a la izquierda.
    expect(calls.some((c) => c.op === 'drawText' && c.args[0] === 'Nivel 1' && c.args[1] === 14)).toBe(true);
  });
});

describe('ElevationEditor — deshacer', () => {
  it('crear un hueco desde el alzado es un paso de deshacer (hueco + vano)', async () => {
    const dbPath = path.join(os.tmpdir(), `elevu-${Date.now()}.db`);
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const services = createAppServices(db);
    await services.store.createObject(
      new Wall({ id: revitObjectId('w1'), roomId: ROOM, startPoint: { x: 0, y: 0 }, endPoint: { x: 4, y: 0 }, thickness: meters(0.15), height: meters(2.8) }),
    );
    const ed = new ElevationEditor({ services, wallId: 'w1', levels: LEVELS });
    await ed.load();
    ed.setViewport({ scale: 100, offsetX: 0, offsetY: 500 });
    ed.setTool('door');
    await ed.tap(200, 450, 22);
    const doors = async () => (await services.store.listObjects(ROOM)).filter((o) => o instanceof Door).length;
    expect(await doors()).toBe(1);

    await services.commandStack.undo();
    await ed.load(false);
    expect(await doors()).toBe(0);
    expect(ed.getState().elevation!.openings).toHaveLength(0);

    await services.commandStack.redo();
    await ed.load(false);
    expect(await doors()).toBe(1);
    expect(ed.getState().elevation!.openings).toHaveLength(1);
    await db.close();
    fs.rmSync(dbPath, { force: true });
  });
});
