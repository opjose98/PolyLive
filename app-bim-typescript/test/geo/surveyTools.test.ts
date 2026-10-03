import {
  inverse,
  formatAzimuth,
  bearingOf,
  gridPolygonMetrics,
  stakeout,
  coordinateGrid,
  niceStep,
  parsePointsCsv,
  pointsToCsv,
  toKml,
  mapConversionFor,
} from '../../src/application/geo/surveyTools';
import { Georeference, modelToGrid } from '../../src/domain/geo/georeference';
import { toLocal } from '../../src/domain/geometry/handedness';

const geo = (over: Partial<Georeference> = {}): Georeference => ({
  crs: 'EPSG:9377',
  method: 'origin',
  origin: { e: 4880000, n: 2070000 },
  rotation: 0.3,
  scale: 1.0002,
  z0: 2600,
  gpsSeconds: 30,
  placements: { S1: { x: 12, y: -4, rotation: 0.7 } },
  definedAt: '2026-10-03',
  ...over,
});

describe('surveyTools — inverso', () => {
  it('distancia, azimut y diferencias', () => {
    const r = inverse({ e: 100, n: 100 }, { e: 110, n: 110 }, 10, 12);
    expect(r.distance).toBeCloseTo(Math.SQRT2 * 10);
    expect(r.azimuth).toBeCloseTo(45);
    expect(r.dN).toBe(10);
    expect(r.dE).toBe(10);
    expect(r.dZ).toBe(2);
    expect(r.grade).toBeCloseTo((2 / (Math.SQRT2 * 10)) * 100);
  });

  it('azimut en los cuatro cuadrantes y rumbo', () => {
    expect(inverse({ e: 0, n: 0 }, { e: -1, n: -1 }).azimuth).toBeCloseTo(225);
    expect(inverse({ e: 0, n: 0 }, { e: -1, n: 0 }).azimuth).toBeCloseTo(270);
    expect(bearingOf(135)).toBe("S 45°00' E");
    expect(bearingOf(300.5)).toBe("N 59°30' W");
  });

  it('formatAzimuth redondea a segundos sin dejar 60', () => {
    expect(formatAzimuth(123.7516667)).toBe(`123°45'06"`);
    expect(formatAzimuth(9.99999)).toBe(`10°00'00"`);
  });
});

describe('surveyTools — área, replanteo, cuadrícula', () => {
  it('área y perímetro de un polígono en planas', () => {
    const m = gridPolygonMetrics([{ e: 0, n: 0 }, { e: 20, n: 0 }, { e: 20, n: 10 }, { e: 0, n: 10 }]);
    expect(m.area).toBeCloseTo(200);
    expect(m.perimeter).toBeCloseTo(60);
  });

  it('replanteo indica hacia dónde moverse', () => {
    const r = stakeout({ e: 100, n: 100 }, { e: 101.05, n: 96.8 });
    expect(r.instruction).toBe('3.20 m al Sur · 1.05 m al Este');
    expect(r.arrived).toBe(false);
    expect(stakeout({ e: 0, n: 0 }, { e: 0.1, n: 0 }).arrived).toBe(true);
  });

  it('niceStep elige un paso redondo', () => {
    expect(niceStep(37)).toBe(10);
    expect(niceStep(800)).toBe(200);
  });

  it('la cuadrícula cae en E/N redondos y sus extremos están sobre esas coordenadas', () => {
    const g = geo();
    const { step, lines } = coordinateGrid(g, 'S1', { min: { x: -20, y: -20 }, max: { x: 20, y: 20 } }, 10);
    expect(step).toBe(10);
    expect(lines.length).toBeGreaterThan(4);
    for (const l of lines) {
      const a = modelToGrid(g, 'S1', l.from);
      const v = l.kind === 'E' ? a.e : a.n;
      expect(v / 10).toBeCloseTo(Math.round(v / 10), 6);
    }
  });
});

describe('surveyTools — CSV y KML', () => {
  it('lee PNEZD con encabezado, separador ; y coma decimal', () => {
    const r = parsePointsCsv('Punto;Norte;Este;Cota;Desc\nM1;2070000,5;4880000,25;2600,1;Mojón IGAC\n\nM2;2070010;4880010;;\nX;abc;1;;\n');
    expect(r.separator).toBe(';');
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toMatchObject({ name: 'M1', n: 2070000.5, e: 4880000.25, z: 2600.1, description: 'Mojón IGAC' });
    expect(r.points[1].z).toBeNull();
    expect(r.errors).toEqual([{ line: 5, message: 'Coordenadas no numéricas' }]);
  });

  it('PENZD invierte las columnas', () => {
    const r = parsePointsCsv('P1,4880000,2070000,10', 'PENZD');
    expect(r.points[0]).toMatchObject({ e: 4880000, n: 2070000 });
  });

  it('CSV de salida es PNEZD y se vuelve a leer igual', () => {
    const csv = pointsToCsv([{ name: 'M,1', n: 2.5, e: 1.25, z: null, description: 'a "b"' }]);
    expect(csv).toBe('P,N,E,Z,D\n"M,1",2.500,1.250,,"a ""b"""\n');
  });

  it('KML con puntos y polígono cerrado', () => {
    const k = toKml('Obra <1>', [{ name: 'M1', latLon: { lat: 4.6, lon: -74.08 } }], [
      { name: 'R-01', ring: [{ lat: 4, lon: -74 }, { lat: 4, lon: -74.1 }, { lat: 4.1, lon: -74.1 }] },
    ]);
    expect(k).toContain('<name>Obra &lt;1&gt;</name>');
    expect(k).toContain('<coordinates>-74.08000000,4.60000000,0.000</coordinates>');
    expect(k).toContain('-74.00000000,4.00000000,0.000 -74.10000000,4.00000000,0.000 -74.10000000,4.10000000,0.000 -74.00000000,4.00000000,0.000');
  });
});

describe('surveyTools — IfcMapConversion', () => {
  it('reproduce el amarre (giro del proyecto + ubicación del espacio + escala)', () => {
    const g = geo();
    const mc = mapConversionFor(g, 'S1', 'EPSG:9377', 'Origen Nacional');
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: -3 }, { x: -12.5, y: 7.25 }]) {
      const l = toLocal(p);
      const e = mc.eastings + mc.scale * (mc.xAxisAbscissa * l.x - mc.xAxisOrdinate * l.y);
      const n = mc.northings + mc.scale * (mc.xAxisOrdinate * l.x + mc.xAxisAbscissa * l.y);
      const expected = modelToGrid(g, 'S1', p);
      expect(e).toBeCloseTo(expected.e, 6);
      expect(n).toBeCloseTo(expected.n, 6);
    }
    expect(mc.orthogonalHeight).toBe(2600);
  });
});
