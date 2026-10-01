import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { MarkerStore } from '../../src/infrastructure/sqlite/MarkerStore';
import { baseMarkerId } from '../../src/domain/objects/marker';

describe('MarkerStore', () => {
  let dbPath: string;
  let db: Database;
  let markers: MarkerStore;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `markers-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    markers = new MarkerStore(db);
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('cada proyecto arranca con su base (valor 0, id determinista), por tipo', async () => {
    const levels = await markers.list('p1', 'level');
    const phases = await markers.list('p1', 'phase');
    expect(levels).toEqual([
      { id: baseMarkerId('p1', 'level'), projectId: 'p1', kind: 'level', name: 'Nivel 0', value: 0, isBase: true },
    ]);
    expect(phases[0].name).toBe('Fase 0');
    expect(await markers.list('p2', 'level')).toHaveLength(1);
  });

  it('agregar usa el siguiente valor libre y la lista sale ordenada', async () => {
    await markers.add('p1', 'level', 'Nivel');
    const second = await markers.add('p1', 'level', 'Nivel');
    expect(second.value).toBe(2);
    const ok = await markers.setValue(second.id, -3);
    expect(ok).toEqual({ ok: true });
    expect((await markers.list('p1', 'level')).map((m) => m.value)).toEqual([-3, 0, 1]);
  });

  it('rechaza valores repetidos y no cambia ni borra la base', async () => {
    const lvl = await markers.add('p1', 'level', 'Nivel');
    expect(await markers.setValue(lvl.id, 0)).toEqual({ ok: false, reason: 'duplicate' });
    expect(await markers.setValue(baseMarkerId('p1', 'level'), 5)).toEqual({ ok: false, reason: 'base' });
    expect(await markers.remove(baseMarkerId('p1', 'level'))).toBe(false);
    expect(await markers.remove(lvl.id)).toBe(true);
    expect(await markers.list('p1', 'level')).toHaveLength(1);
  });

  it('renombrar no admite nombres vacíos', async () => {
    const lvl = await markers.add('p1', 'level', 'Nivel');
    await markers.rename(lvl.id, '  Planta alta ');
    await markers.rename(lvl.id, '   ');
    expect((await markers.list('p1', 'level'))[1].name).toBe('Planta alta');
  });
});
