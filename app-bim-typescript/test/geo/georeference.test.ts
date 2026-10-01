// Topografía: sistemas colombianos, amarres y promedio GPS.
import {
  CRS_LIST,
  gridToLatLon,
  latLonToGrid,
  meridianConvergence,
  suggestGaussKruger,
  formatDms,
} from '../../src/domain/geo/crs';
import {
  Georeference,
  amarreByPointAndAzimuth,
  azimuthDegrees,
  fitControlPoints,
  gridToLocal,
  gridToModel,
  localToGrid,
  modelToGrid,
  northFromLocalY,
  northUpViewRotation,
} from '../../src/domain/geo/georeference';
import { averageFixes } from '../../src/domain/geo/gpsAverage';

const deg = (d: number) => (d * Math.PI) / 180;

const geo = (over: Partial<Georeference> = {}): Georeference => ({
  crs: 'EPSG:9377',
  method: 'origin',
  origin: { e: 4_900_000, n: 2_070_000 },
  rotation: 0,
  scale: 1,
  z0: 2600,
  gpsSeconds: 30,
  placements: {},
  definedAt: '2026-09-29',
  ...over,
});

describe('CRS colombianos (proj4 embebido)', () => {
  it('el origen de cada proyección cae en su falso este/norte', () => {
    expect(latLonToGrid('EPSG:9377', { lat: 4, lon: -73 })).toEqual({ e: expect.closeTo(5_000_000, 3), n: expect.closeTo(2_000_000, 3) });
    const bog = latLonToGrid('EPSG:3116', { lat: 4.596200416666666, lon: -74.07750791666666 });
    expect(bog.e).toBeCloseTo(1_000_000, 3);
    expect(bog.n).toBeCloseTo(1_000_000, 3);
  });

  it('ida y vuelta lat/long ↔ plano en todos los sistemas', () => {
    for (const c of CRS_LIST) {
      const g = latLonToGrid(c.id, { lat: 6.2442, lon: -75.5812 }); // Medellín
      const back = gridToLatLon(c.id, g);
      expect(back.lat).toBeCloseTo(6.2442, 7);
      expect(back.lon).toBeCloseTo(-75.5812, 7);
    }
  });

  it('sugiere el origen Gauss-Krüger por longitud', () => {
    expect(suggestGaussKruger(-74.1)).toBe('EPSG:3116'); // Bogotá
    expect(suggestGaussKruger(-75.58)).toBe('EPSG:3115'); // Medellín → Oeste
    expect(suggestGaussKruger(-76.5)).toBe('EPSG:3115'); // Cali
    expect(suggestGaussKruger(-72.5)).toBe('EPSG:3117'); // Cúcuta → Este
  });

  it('la convergencia de meridianos es ~0 sobre el meridiano central', () => {
    const g = latLonToGrid('EPSG:3116', { lat: 5, lon: -74.07750791666666 });
    expect(Math.abs(meridianConvergence('EPSG:3116', g))).toBeLessThan(0.001);
    const off = latLonToGrid('EPSG:3116', { lat: 5, lon: -73 });
    expect(Math.abs(meridianConvergence('EPSG:3116', off))).toBeGreaterThan(0.05);
  });

  it('formatea grados, minutos y segundos', () => {
    expect(formatDms(4.596200416666666, 'N', 'S')).toBe(`4°35'46.321"N`);
  });
});

describe('georreferencia', () => {
  it('sin giro, el +Y local es el norte y el +X el este', () => {
    const g = geo();
    expect(localToGrid(g, { x: 10, y: 5 })).toEqual({ e: 4_900_010, n: 2_070_005 });
  });

  it('con azimut 90° el +Y local apunta al este', () => {
    const g = geo({ rotation: deg(90) });
    const p = localToGrid(g, { x: 0, y: 10 });
    expect(p.e).toBeCloseTo(4_900_010);
    expect(p.n).toBeCloseTo(2_070_000);
  });

  it('local ↔ plano ida y vuelta, con escala y giro', () => {
    const g = geo({ rotation: deg(33), scale: 1.0003 });
    const back = gridToLocal(g, localToGrid(g, { x: 12.3, y: -4.5 }));
    expect(back.x).toBeCloseTo(12.3, 9);
    expect(back.y).toBeCloseTo(-4.5, 9);
  });

  it('el modelo (Y abajo) se convierte a local (Y arriba) y respeta la ubicación del espacio', () => {
    const g = geo({ placements: { s2: { x: 100, y: 0, rotation: 0 } } });
    // Un punto 3 m "arriba" en pantalla (y modelo = −3) queda 3 m al norte.
    expect(modelToGrid(g, 's1', { x: 0, y: -3 })).toEqual({ e: 4_900_000, n: 2_070_003 });
    expect(modelToGrid(g, 's2', { x: 0, y: 0 })).toEqual({ e: 4_900_100, n: 2_070_000 });
    const m = gridToModel(g, 's2', { e: 4_900_105, n: 2_069_998 });
    expect(m.x).toBeCloseTo(5);
    expect(m.y).toBeCloseTo(2);
  });

  it('amarre por punto conocido + azimut', () => {
    const r = amarreByPointAndAzimuth({ x: 2, y: 3 }, { e: 1_000_500, n: 1_000_800 }, deg(30));
    const g = geo({ ...r });
    const p = localToGrid(g, { x: 2, y: 3 });
    expect(p.e).toBeCloseTo(1_000_500);
    expect(p.n).toBeCloseTo(1_000_800);
  });

  it('ajuste por mojones recupera el giro y la traslación, con residuales', () => {
    const truth = geo({ rotation: deg(-20), origin: { e: 1_000_000, n: 1_000_000 } });
    const locals = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 0, y: 20 },
    ];
    const pairs = locals.map((l, i) => {
      const gp = localToGrid(truth, l);
      // Ruido de ±2 cm en un mojón.
      return { id: `M${i}`, local: l, grid: i === 2 ? { e: gp.e + 0.02, n: gp.n - 0.02 } : gp };
    });
    const fit = fitControlPoints(pairs);
    expect(azimuthDegrees(fit.rotation)).toBeCloseTo(340, 1);
    expect(fit.origin.e).toBeCloseTo(1_000_000, 1);
    expect(fit.scale).toBe(1);
    expect(fit.rmse).toBeGreaterThan(0);
    expect(fit.rmse).toBeLessThan(0.03);
  });

  it('el ajuste exige mojones separados', () => {
    expect(() => fitControlPoints([{ id: 'a', local: { x: 0, y: 0 }, grid: { e: 0, n: 0 } }])).toThrow();
  });

  it('la aguja del norte y el giro "norte arriba"', () => {
    const g = geo({ rotation: deg(30) }); // el +Y local apunta a 30° (NE)
    expect(northFromLocalY(g, 's')).toBeCloseTo(deg(-30));
    expect(northUpViewRotation(g, 's')).toBeCloseTo(deg(30));
  });
});

describe('promedio GPS', () => {
  it('pondera por precisión y mide la dispersión', () => {
    const base = { alt: 2600, timestamp: 0 };
    const avg = averageFixes([
      { lat: 4.6, lon: -74.08, accuracy: 3, ...base },
      { lat: 4.60001, lon: -74.08, accuracy: 3, ...base },
      { lat: 4.6005, lon: -74.08, accuracy: 30, ...base }, // lectura mala, pesa poco
    ])!;
    expect(avg.samples).toBe(3);
    expect(avg.lat).toBeLessThan(4.6001);
    expect(avg.spread).toBeGreaterThan(1);
    expect(avg.alt).toBeCloseTo(2600);
  });

  it('sin lecturas válidas no hay promedio', () => {
    expect(averageFixes([])).toBeNull();
  });
});
