import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { GeoStore } from '../../src/infrastructure/sqlite/GeoStore';
import { isControlPoint } from '../../src/domain/geo/benchmark';

describe('GeoStore', () => {
  let dbPath: string;
  let db: Database;
  let geo: GeoStore;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `geo-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    geo = new GeoStore(db);
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('guarda y relee la georreferencia del proyecto', async () => {
    expect(await geo.getGeoreference('p1')).toBeNull();
    const g = {
      crs: 'EPSG:9377' as const,
      method: 'origin' as const,
      origin: { e: 4_900_000, n: 2_070_000 },
      rotation: 0.5,
      scale: 1,
      z0: 2600,
      gpsSeconds: 30,
      placements: { s2: { x: 10, y: 0, rotation: 0 } },
      definedAt: '2026-09-29',
    };
    await geo.saveGeoreference('p1', g);
    expect(await geo.getGeoreference('p1')).toEqual(g);
    await geo.clearGeoreference('p1');
    expect(await geo.getGeoreference('p1')).toBeNull();
  });

  it('mojones: biblioteca común enlazable entre proyectos', async () => {
    const m = await geo.createBenchmark('p1', {
      name: 'M-1',
      latLon: { lat: 4.6, lon: -74.08 },
      h: 2600,
      source: 'gps',
      accuracy: 3.2,
      spaceId: 's1',
      local: { x: 1, y: -2 },
    });
    expect(isControlPoint(m)).toBe(true);
    // Solo local (tocado sin amarre): no es punto de control ni aparece en la biblioteca.
    const t = await geo.createBenchmark('p1', { name: 'T', latLon: null, h: null, source: 'tap', spaceId: 's1', local: { x: 0, y: 0 } });
    expect(isControlPoint(t)).toBe(false);

    expect((await geo.listLibrary('p2')).map((b) => b.name)).toEqual(['M-1']);
    await geo.link('p2', m.id, null, null);
    expect(await geo.listLibrary('p2')).toEqual([]);
    const inP2 = await geo.listProjectBenchmarks('p2');
    expect(inP2[0]).toMatchObject({ name: 'M-1', local: null, spaceId: null });

    await geo.setRealCoordinates(t.id, { lat: 4.61, lon: -74.07 }, null, 'typed');
    expect(isControlPoint((await geo.listProjectBenchmarks('p1')).find((b) => b.id === t.id)!)).toBe(true);
    await geo.unlink('p1', t.id);
    expect((await geo.listProjectBenchmarks('p1')).map((b) => b.name)).toEqual(['M-1']);
  });
});
