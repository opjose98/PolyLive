import { interiorPoint, netGeometry, insetPolygon, edgeThicknesses, zoneCode, Zone } from '../../src/domain/objects/zone';
import { reconcileZones, DetectedContour } from '../../src/application/topology/reconcileZones';
import { isPointInPolygon } from '../../src/domain/geometry/polygon-utils';

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const contour = (poly: { x: number; y: number }[]): DetectedContour => {
  const area = Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0) / 2);
  return { polygon: poly, area, netPolygon: poly, netArea: area, perimeter: 0 };
};

describe('zone — geometría del recinto', () => {
  it('interiorPoint cae dentro de una L (donde el centroide cae afuera)', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isPointInPolygon(interiorPoint(L), L)).toBe(true);
  });

  it('el contorno neto descuenta medio espesor por lado', () => {
    const poly = rect(0, 0, 4, 3);
    const walls = [
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.15 },
      { start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, thickness: 0.15 },
      { start: { x: 4, y: 3 }, end: { x: 0, y: 3 }, thickness: 0.15 },
      { start: { x: 0, y: 3 }, end: { x: 0, y: 0 }, thickness: 0.15 },
    ];
    const net = netGeometry(poly, walls);
    expect(net.netArea).toBeCloseTo(3.85 * 2.85, 6);
    expect(net.perimeter).toBeCloseTo(2 * (3.85 + 2.85), 6);
  });

  it('espesores distintos por lado, y un lado partido por una T usa el muro que lo contiene', () => {
    const poly = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const walls = [
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.3 },
      { start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, thickness: 0.1 },
      { start: { x: 4, y: 3 }, end: { x: 0, y: 3 }, thickness: 0.1 },
      { start: { x: 0, y: 3 }, end: { x: 0, y: 0 }, thickness: 0.1 },
    ];
    expect(edgeThicknesses(poly, walls)).toEqual([0.3, 0.3, 0.1, 0.1, 0.1]);
    const net = netGeometry(poly, walls);
    expect(net.netArea).toBeCloseTo((4 - 0.1) * (3 - 0.15 - 0.05), 6);
  });

  it('un recinto más estrecho que sus muros no produce contorno neto', () => {
    expect(insetPolygon(rect(0, 0, 0.1, 3), [0.2, 0.2, 0.2, 0.2])).toBeNull();
  });

  it('zoneCode', () => {
    expect(zoneCode({ number: 3 })).toBe('R-03');
  });
});

describe('reconcileZones — identidad de recintos', () => {
  let n = 0;
  const base = { spaceId: 'S', levelId: 'L', newId: () => `z${++n}`, now: '2026-10-03T00:00:00Z' };
  const zone = (id: string, number: number, poly: { x: number; y: number }[], createdAt = '2026-01-01', bound = true): Zone => ({
    id,
    spaceId: 'S',
    levelId: 'L',
    number,
    name: `Recinto ${number}`,
    use: '',
    notes: '',
    polygon: poly,
    netPolygon: poly,
    seed: interiorPoint(poly),
    area: 0,
    netArea: 0,
    perimeter: 0,
    bound,
    createdAt,
  });

  beforeEach(() => {
    n = 0;
  });

  it('crea recintos nuevos con números correlativos', () => {
    const r = reconcileZones({ ...base, zones: [], detected: [contour(rect(0, 0, 4, 3)), contour(rect(4, 0, 8, 3))], nextNumber: 1 });
    expect(r.assigned.map((z) => [z.id, z.number, z.name])).toEqual([
      ['z1', 1, 'Recinto 1'],
      ['z2', 2, 'Recinto 2'],
    ]);
    expect(r.changed).toHaveLength(2);
  });

  it('conserva la identidad cuando el contorno se mueve (semilla dentro)', () => {
    const z = zone('A', 1, rect(0, 0, 4, 3));
    const r = reconcileZones({ ...base, zones: [z], detected: [contour(rect(0, 0, 5, 3))], nextNumber: 2 });
    expect(r.assigned[0].id).toBe('A');
    expect(r.assigned[0].seed).toBe(z.seed);
    expect(r.changed).toHaveLength(1);
  });

  it('sin cambios no hay nada que persistir', () => {
    const z = zone('A', 1, rect(0, 0, 4, 3));
    const r = reconcileZones({ ...base, zones: [z], detected: [contour(rect(0, 0, 4, 3))], nextNumber: 2 });
    expect(r.changed).toHaveLength(0);
  });

  it('dividir: el lado con la semilla conserva el id, el otro nace nuevo', () => {
    const z = { ...zone('A', 1, rect(0, 0, 8, 3)), seed: { x: 1, y: 1 } };
    const r = reconcileZones({ ...base, zones: [z], detected: [contour(rect(4, 0, 8, 3)), contour(rect(0, 0, 4, 3))], nextNumber: 2 });
    expect(r.assigned[1].id).toBe('A');
    expect(r.assigned[0].id).toBe('z1');
    expect(r.assigned[0].number).toBe(2);
  });

  it('unir: gana el más antiguo y el otro queda desligado', () => {
    const a = zone('A', 1, rect(0, 0, 4, 3), '2026-01-01');
    const b = zone('B', 2, rect(4, 0, 8, 3), '2026-02-01');
    const r = reconcileZones({ ...base, zones: [b, a], detected: [contour(rect(0, 0, 8, 3))], nextNumber: 3 });
    expect(r.assigned[0].id).toBe('A');
    expect(r.changed.find((z) => z.id === 'B')!.bound).toBe(false);
  });

  it('un recinto desligado recupera su identidad cuando su contorno vuelve', () => {
    const b = zone('B', 2, rect(4, 0, 8, 3), '2026-02-01', false);
    const r = reconcileZones({ ...base, zones: [b], detected: [contour(rect(4, 0, 8, 3))], nextNumber: 3 });
    expect(r.assigned[0].id).toBe('B');
    expect(r.assigned[0].bound).toBe(true);
  });

  it('si la semilla quedó afuera, se reconoce por su último contorno', () => {
    const z = { ...zone('A', 1, rect(0, 0, 8, 3)), seed: { x: 7, y: 1 } };
    const r = reconcileZones({ ...base, zones: [z], detected: [contour(rect(0, 0, 4, 3))], nextNumber: 2 });
    expect(r.assigned[0].id).toBe('A');
    expect(isPointInPolygon(r.assigned[0].seed, rect(0, 0, 4, 3))).toBe(true);
  });

  it('un recinto de nivel "" (antes de cargar niveles) pasa al nivel activo', () => {
    const z = { ...zone('A', 1, rect(0, 0, 4, 3)), levelId: '' };
    const r = reconcileZones({ ...base, zones: [z], detected: [contour(rect(0, 0, 4, 3))], nextNumber: 2 });
    expect(r.assigned[0].levelId).toBe('L');
    expect(r.changed).toHaveLength(1);
  });
});
