import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { MarkerStore } from '../../src/infrastructure/sqlite/MarkerStore';
import { LEVEL_TEMPLATE, baseMarkerId } from '../../src/domain/objects/marker';
import { MIGRATIONS, runMigrations } from '../../src/infrastructure/sqlite/migrations';

const A = { projectId: 'p1', spaceId: 'r1' };
const B = { projectId: 'p1', spaceId: 'r2' };

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

  it('cada espacio arranca con su base (valor 0, id determinista), por tipo', async () => {
    const levels = await markers.list(A, 'level');
    const phases = await markers.list(A, 'phase');
    expect(levels).toEqual([
      { id: baseMarkerId('p1', 'level'), projectId: 'p1', spaceId: 'r1', kind: 'level', name: 'Nivel 0', value: 0, isBase: true },
    ]);
    expect(phases[0].name).toBe('Fase 0');
    expect(await markers.list(B, 'level')).toHaveLength(1);
  });

  it('agregar usa el siguiente valor libre y la lista sale ordenada', async () => {
    await markers.add(A, 'level', 'Nivel');
    const second = await markers.add(A, 'level', 'Nivel');
    expect(second.value).toBe(2);
    const ok = await markers.setValue(A, second.id, -3);
    expect(ok).toEqual({ ok: true });
    expect((await markers.list(A, 'level')).map((m) => m.value)).toEqual([-3, 0, 1]);
  });

  it('rechaza valores repetidos y no cambia ni borra la base', async () => {
    const lvl = await markers.add(A, 'level', 'Nivel');
    expect(await markers.setValue(A, lvl.id, 0)).toEqual({ ok: false, reason: 'duplicate' });
    expect(await markers.setValue(A, baseMarkerId('p1', 'level'), 5)).toEqual({ ok: false, reason: 'base' });
    expect(await markers.remove(A, baseMarkerId('p1', 'level'))).toBe(false);
    expect(await markers.remove(A, lvl.id)).toBe(true);
    expect(await markers.list(A, 'level')).toHaveLength(1);
  });

  it('renombrar no admite nombres vacíos', async () => {
    const lvl = await markers.add(A, 'level', 'Nivel');
    await markers.rename(A, lvl.id, '  Planta alta ');
    await markers.rename(A, lvl.id, '   ');
    expect((await markers.list(A, 'level'))[1].name).toBe('Planta alta');
  });

  it('los niveles de un espacio no se ven ni se tocan desde otro (docs/23 § 7)', async () => {
    const lvl = await markers.add(A, 'level', 'Nivel');
    await markers.rename(B, baseMarkerId('p1', 'level'), 'Piso B');
    expect(await markers.list(B, 'level')).toHaveLength(1);
    expect(await markers.setValue(B, lvl.id, 7)).toEqual({ ok: false, reason: 'not-found' });
    expect((await markers.list(A, 'level'))[0].name).toBe('Nivel 0');
  });

  it('la plantilla deja Piso·Muro·Viga·Cubierta con la base renombrada, y se copia a otro espacio', async () => {
    await markers.add(A, 'level', 'Nivel');
    await markers.replaceAll(A, 'level', LEVEL_TEMPLATE);
    const lv = await markers.list(A, 'level');
    expect(lv.map((m) => [m.name, m.value, m.isBase])).toEqual([
      ['Piso', 0, true],
      ['Muro', 2.4, false],
      ['Viga', 2.6, false],
      ['Cubierta', 3.5, false],
    ]);
    await markers.copyFrom(A, B);
    expect((await markers.list(B, 'level')).map((m) => [m.name, m.value])).toEqual(lv.map((m) => [m.name, m.value]));
    expect((await markers.list(B, 'phase')).map((m) => m.name)).toEqual(['Fase 0']);
  });
});

describe('migración v4: niveles y fases por espacio', () => {
  it('copia los del proyecto a cada espacio con los mismos ids', async () => {
    const dbPath = path.join(os.tmpdir(), `markers-v4-${Date.now()}.db`);
    const db = new Database(dbPath);
    await db.open();
    try {
      await runMigrations(db, MIGRATIONS.filter((m) => m.version < 4));
      for (const r of ['r1', 'r2']) {
        await db.run(`INSERT INTO project_spaces (project_id, room_id, bim_code, name) VALUES ('p1', ?, ?, ?)`, [r, r, r]);
      }
      await db.run(`INSERT INTO project_markers (id, project_id, kind, name, value, is_base) VALUES ('n1', 'p1', 'level', 'Cubierta', 3.5, 0)`);
      await runMigrations(db);
      const store = new MarkerStore(db);
      for (const s of [A, B]) {
        expect((await store.list(s, 'level')).map((m) => [m.id, m.value])).toEqual([
          [baseMarkerId('p1', 'level'), 0],
          ['n1', 3.5],
        ]);
      }
      await store.setValue(B, 'n1', 3.2);
      expect((await store.list(A, 'level'))[1].value).toBe(3.5);
    } finally {
      await db.close();
      fs.rmSync(dbPath, { force: true });
    }
  });
});
