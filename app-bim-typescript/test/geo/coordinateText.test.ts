import { amarreSummary, coordinateLabel, coordinateRows, isGeoreferenced } from '../../src/application/geo/coordinateText';
import type { Georeference } from '../../src/domain/geo/georeference';

const geo: Georeference = {
  crs: 'EPSG:9377',
  method: 'origin',
  origin: { e: 4_880_000, n: 2_070_000 },
  rotation: Math.PI / 2,
  scale: 1,
  z0: 2600,
  gpsSeconds: 30,
  placements: {},
  definedAt: '2026-09-29T00:00:00Z',
};

describe('coordinateText', () => {
  it('sin amarre muestra x/y locales con Y arriba', () => {
    expect(coordinateLabel(null, { x: 2, y: -3 })).toEqual(['x 2.00', 'y 3.00']);
    expect(coordinateRows(null, { x: 2, y: -3 }).map(([k]) => k)).toEqual(['x local', 'y local']);
  });

  it('con amarre: Norte primero, luego Este, y la cota si se conoce', () => {
    const real = { grid: { e: 4_880_001.5, n: 2_070_002.25 }, latLon: { lat: 4.6, lon: -74.08 }, h: 2601.2 };
    const rows = coordinateRows(real, { x: 0, y: 0 });
    expect(rows.map(([k]) => k)).toEqual(['Norte', 'Este', 'Cota']);
    expect(coordinateLabel(real, { x: 0, y: 0 })[0]).toMatch(/^N 2.?070.?002,25$/);
    expect(coordinateRows(real, null, 'latlon')[0][1]).toMatch(/N$/);
    expect(coordinateRows(real, null, 'latlon')[1][1]).toMatch(/W$/);
  });

  it('resume el amarre', () => {
    expect(amarreSummary(null)).toEqual(['Sin configurar']);
    expect(amarreSummary({ ...geo, method: 'none' })).toEqual(['Origen Nacional', 'Coordenadas locales']);
    expect(amarreSummary(geo)).toEqual(['Origen Nacional', 'Amarre: origen conocido', 'Az. 90.00°']);
    expect(amarreSummary({ ...geo, method: 'control', rmse: 0.012 })[2]).toMatch(/^RMSE 0,012 m$/);
    expect(isGeoreferenced({ ...geo, method: 'none' })).toBe(false);
    expect(isGeoreferenced(geo)).toBe(true);
  });
});
