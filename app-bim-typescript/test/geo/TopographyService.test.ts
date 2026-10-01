import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { GeoStore } from '../../src/infrastructure/sqlite/GeoStore';
import { TopographyService } from '../../src/application/geo/TopographyService';
import { latLonToGrid } from '../../src/domain/geo/crs';
import { modelToGrid } from '../../src/domain/geo/georeference';

const deg = (d: number) => (d * Math.PI) / 180;
const BASE = { crs: 'EPSG:3116' as const, z0: 2600 };

describe('TopographyService', () => {
  let dbPath: string;
  let db: Database;
  let topo: TopographyService;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `topo-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    topo = new TopographyService(new GeoStore(db));
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('(a) origen conocido + azimut: el 0,0 del dibujo cae en sus coordenadas', async () => {
    const geo = await topo.defineByPoint('p', 's1', BASE, {
      modelPoint: { x: 0, y: 0 },
      known: { e: 1_000_500, n: 1_000_800 },
      azimuth: deg(90),
    });
    const c = topo.coordinatesOf(geo, 's1', { x: 0, y: -10 }, 3)!; // 10 m "arriba" en pantalla
    expect(c.grid.e).toBeCloseTo(1_000_510); // +Y local apunta al este
    expect(c.grid.n).toBeCloseTo(1_000_800);
    expect(c.h).toBe(2603);
  });

  it('(b) GPS: el punto donde está parado el operador toma la posición promediada', async () => {
    const gps = { lat: 4.6, lon: -74.08, alt: 2610, samples: 30, spread: 1.2, meanAccuracy: 3 };
    const geo = await topo.defineByGps('p', 's1', BASE, { modelPoint: { x: 2, y: -3 }, gps, azimuth: 0 });
    expect(geo.method).toBe('gps');
    const at = modelToGrid(geo, 's1', { x: 2, y: -3 });
    const expected = latLonToGrid('EPSG:3116', { lat: 4.6, lon: -74.08 });
    expect(at.e).toBeCloseTo(expected.e, 6);
    expect(at.n).toBeCloseTo(expected.n, 6);
  });

  it('(c) mojones: ajuste con residuales; y ubicar un segundo espacio', async () => {
    const truth = await topo.defineByPoint('ref', 's1', BASE, { modelPoint: { x: 0, y: 0 }, known: { e: 1_000_000, n: 1_000_000 }, azimuth: deg(25) });
    // Mojones medidos en el dibujo de s1 con sus coordenadas reales.
    const spots = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: -8 },
    ];
    for (const [i, m] of spots.entries()) {
      const g = modelToGrid(truth, 's1', m);
      await topo.benchmarkFromReal('p', 's1', null, { name: `M${i}`, known: g, crs: 'EPSG:3116', h: null, source: 'typed' });
      const b = (await topo.listBenchmarks('p')).find((x) => x.name === `M${i}`)!;
      await topo.placeBenchmark('p', b.id, 's1', m);
    }
    const geo = await topo.defineByControl('p', BASE);
    expect(geo.method).toBe('control');
    expect(geo.rmse!).toBeLessThan(0.01);
    const probe = modelToGrid(geo, 's1', { x: 5, y: -5 });
    const ref = modelToGrid(truth, 's1', { x: 5, y: -5 });
    expect(probe.e).toBeCloseTo(ref.e, 2);
    expect(probe.n).toBeCloseTo(ref.n, 2);

    // Espacio s2 dibujado desde SU 0,0, desplazado 20 m (x) en el proyecto.
    for (const [i, m] of [{ x: 0, y: 0 }, { x: 4, y: -6 }].entries()) {
      const g = modelToGrid(truth, 's1', { x: m.x + 20, y: m.y });
      const b = await topo.benchmarkFromReal('p', 's2', null, { name: `S2-${i}`, known: g, crs: 'EPSG:3116', h: null, source: 'typed' });
      await topo.placeBenchmark('p', b.id, 's2', m);
    }
    const placed = await topo.placeSpaceByControl('p', 's2');
    expect(placed.placements.s2.x).toBeCloseTo(20, 2);
    expect(placed.placements.s2.y).toBeCloseTo(0, 2);
    expect(placed.placements.s2.rotation).toBeCloseTo(0, 4);
  });

  it('mojón tocado en la planta toma coordenadas del amarre; sin amarre queda solo local', async () => {
    const local = await topo.benchmarkFromTap('p', 's1', null, 'T1', { x: 1, y: 1 }, 0);
    expect(local.latLon).toBeNull();
    const geo = await topo.defineByPoint('p', 's1', BASE, { modelPoint: { x: 0, y: 0 }, known: { e: 1_000_000, n: 1_000_000 }, azimuth: 0 });
    const t = await topo.benchmarkFromTap('p', 's1', geo, 'T2', { x: 1, y: -1 }, 3);
    expect(t.latLon).not.toBeNull();
    expect(t.h).toBe(2603);
    const c = topo.benchmarkCoordinates(geo, t)!;
    expect(c.grid.e).toBeCloseTo(1_000_001, 4);
    expect(c.grid.n).toBeCloseTo(1_000_001, 4);
  });
});
