import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ProgressStore } from '../../src/infrastructure/sqlite/ProgressStore';
import { ProgressController } from '../../src/application/progress/ProgressController';
import { DEFAULT_ACTIVITIES, Support, targetKey, ProgressTarget } from '../../src/domain/progress/progress';

const floor: ProgressTarget = { kind: 'floor', zoneId: 'z1' };
const square: Support = { outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], holes: [] };

describe('ProgressController', () => {
  let dbPath: string;
  let db: Database;
  let store: ProgressStore;
  let ctl: ProgressController;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `progress-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    store = new ProgressStore(db);
    ctl = new ProgressController(store, 'P1', 'S1', 'Ana');
    await ctl.load();
    ctl.setSupports(new Map([[targetKey(floor), square]]));
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('siembra el catálogo una vez y elige la primera actividad', async () => {
    expect(ctl.getState().activities.map((a) => a.name)).toEqual(DEFAULT_ACTIVITIES.map((a) => a.name));
    expect(ctl.activeActivity?.name).toBe('Mampostería');
    const again = new ProgressController(store, 'P1', 'S1');
    await again.load();
    expect(again.getState().activities).toHaveLength(DEFAULT_ACTIVITIES.length);
  });

  it('sin corte no se pinta y avisa', async () => {
    ctl.setTool('fill');
    await ctl.fill(floor);
    expect(ctl.getState().marks).toHaveLength(0);
    expect(ctl.getState().notice?.message).toMatch(/corte/);
  });

  it('pincel, relleno, cantidades, deshacer y rehacer (persistidos)', async () => {
    await ctl.addCut('2026-10-03');
    ctl.setTool('brush');
    ctl.setBrushWidth(1);
    ctl.begin(floor, { x: 0, y: 1.5 });
    ctl.move({ x: 2, y: 1.5 });
    await ctl.end({ x: 4, y: 1.5 });
    const q = ctl.quantities();
    expect(q).toHaveLength(1);
    expect(q[0].inCut).toBeCloseTo(4, 1);
    expect(ctl.layers()[0].runs.length).toBeGreaterThan(0);

    ctl.setTool('fill');
    const pintura = ctl.getState().activities.find((a) => a.name === 'Pintura')!;
    ctl.setActivity(pintura.id);
    await ctl.fill(floor);
    expect(ctl.quantities().find((r) => r.activityId === pintura.id)!.inCut).toBeCloseTo(12, 1);

    await ctl.undo();
    expect(ctl.quantities().find((r) => r.activityId === pintura.id)).toBeUndefined();
    await ctl.redo();
    expect(ctl.quantities().find((r) => r.activityId === pintura.id)!.inCut).toBeCloseTo(12, 1);

    // Persistido: otro controlador lee lo mismo.
    const other = new ProgressController(store, 'P1', 'S1');
    await other.load();
    other.setSupports(new Map([[targetKey(floor), square]]));
    expect(other.getState().marks).toHaveLength(2);
    expect(other.getState().marks[0].operator).toBe('Ana');
  });

  it('rectángulo degenerado no crea marca; borrador resta', async () => {
    await ctl.addCut('2026-10-03');
    ctl.setTool('rect');
    ctl.begin(floor, { x: 1, y: 1 });
    await ctl.end({ x: 1, y: 2 });
    expect(ctl.getState().marks).toHaveLength(0);

    ctl.setTool('fill');
    await ctl.fill(floor);
    ctl.setTool('eraser');
    ctl.setBrushWidth(1);
    ctl.begin(floor, { x: 0, y: 0.5 });
    await ctl.end({ x: 4, y: 0.5 });
    expect(ctl.quantities()[0].inCut).toBeCloseTo(12 - 4 * 1, 0);
  });

  it('los cortes anteriores se dibujan tenues', async () => {
    await ctl.addCut('2026-09-01');
    ctl.setTool('fill');
    await ctl.fill(floor);
    await ctl.addCut('2026-10-01');
    const layers = ctl.layers(true);
    expect(layers).toHaveLength(1);
    expect(layers[0].opacity).toBeLessThan(1);
    expect(ctl.layers(false)).toHaveLength(0);
  });

  it('catálogo editable: agregar, renombrar, quitar', async () => {
    await ctl.addActivity('Impermeabilización');
    expect(ctl.activeActivity?.name).toBe('Impermeabilización');
    await ctl.editActivity(ctl.activeActivity!.id, { name: 'Impermeabilizar', color: '#000000' });
    expect(ctl.activeActivity).toMatchObject({ name: 'Impermeabilizar', color: '#000000' });
    const id = ctl.activeActivity!.id;
    await ctl.removeActivity(id);
    expect(ctl.getState().activities.some((a) => a.id === id)).toBe(false);
    expect(ctl.getState().allActivities.some((a) => a.id === id)).toBe(true);
  });
});
