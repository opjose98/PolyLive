import { planMeasureMove } from '../../src/domain/topology/joints';
import { FaceWall, axisLengthFor, axisLengthForFace, faceLength, interiorSide } from '../../src/domain/topology/faceMeasure';

const W = (id: string, ax: number, ay: number, bx: number, by: number, t = 0.2): FaceWall => ({
  id,
  start: { x: ax, y: ay },
  end: { x: bx, y: by },
  thickness: t,
});

// Rectángulo 4 × 5 al eje, recorrido antihorario en pantalla (Y abajo): interior a la izquierda (+1).
const rect = (t = 0.2) => [W('b', 0, 5, 4, 5, t), W('r', 4, 5, 4, 0, t), W('t', 4, 0, 0, 0, t), W('l', 0, 0, 0, 5, t)];
const inner = (t = 0.2) => [
  { x: t / 2, y: t / 2 },
  { x: 4 - t / 2, y: t / 2 },
  { x: 4 - t / 2, y: 5 - t / 2 },
  { x: t / 2, y: 5 - t / 2 },
];

describe('Medir de cara a cara', () => {
  it('en una esquina en L la cara interior se acorta y la exterior se alarga medio espesor por extremo', () => {
    const walls = rect();
    const b = walls[0];
    const side = interiorSide(b, [inner()]);
    expect(side).not.toBeNull();
    expect(faceLength(b, side!, walls)).toBeCloseTo(3.8);
    expect(faceLength(b, side === 1 ? -1 : 1, walls)).toBeCloseTo(4.2);
  });

  it('con espesores distintos cada extremo descuenta el medio espesor de SU vecino', () => {
    const walls = [W('b', 0, 5, 4, 5, 0.15), W('r', 4, 5, 4, 0, 0.3), W('t', 4, 0, 0, 0, 0.15), W('l', 0, 0, 0, 5, 0.1)];
    const side = interiorSide(walls[0], [inner(0.15)])!;
    expect(faceLength(walls[0], side, walls)).toBeCloseTo(4 - 0.05 - 0.15);
  });

  it('un muro libre mide lo mismo en cara y eje; una T corta la cara del tabique en la cara del muro', () => {
    const solo = W('s', 0, 0, 3, 0);
    expect(faceLength(solo, 1, [solo])).toBeCloseTo(3);
    // Tabique de (2,0) a (2,3) que nace en el tramo de un muro horizontal de 0 a 4.
    const host = W('h', 0, 0, 4, 0, 0.2);
    const part = W('p', 2, 0, 2, 3, 0.1);
    expect(faceLength(part, 1, [host, part])).toBeCloseTo(2.9);
    expect(faceLength(part, -1, [host, part])).toBeCloseTo(2.9);
  });

  it('la longitud de eje que hace medir la cara interior lo medido (los vecinos acompañan)', () => {
    const walls = rect();
    const b = walls[0];
    const side = interiorSide(b, [inner()])!;
    const axis = axisLengthForFace(3.9, b, side, walls);
    // 3,90 + 2 medios espesores: en la esquina en L el muro derecho se traslada paralelo.
    expect(axis).toBeCloseTo(4.1, 6);
    // Aplicado igual que en la app, la cara interior mide 3,900 m y el recinto sigue rectangular.
    const ch = planMeasureMove(walls, 'b', { x: axis, y: 5 });
    const moved = walls.map((w) => {
      const c = ch.find((x) => x.id === w.id);
      return c ? { ...w, start: c.start ?? w.start, end: c.end ?? w.end } : w;
    });
    expect(Math.abs(faceLength(moved[0], side, moved) - 3.9)).toBeLessThan(1e-5);
    const r = moved.find((w) => w.id === 'r')!;
    expect(r.start.x).toBeCloseTo(r.end.x, 9); // el muro derecho sigue vertical
  });

  it('referencia: interior, exterior y eje; sin recinto, la medida va al eje', () => {
    const walls = rect();
    const b = walls[0];
    expect(Math.abs(axisLengthFor(3.9, 'interior', b, walls, [inner()]).axis - 4.1)).toBeLessThan(0.005);
    expect(Math.abs(axisLengthFor(4.3, 'exterior', b, walls, [inner()]).axis - 4.1)).toBeLessThan(0.005);
    expect(axisLengthFor(4.1, 'axis', b, walls, [inner()]).axis).toBeCloseTo(4.1);
    expect(axisLengthFor(3.9, 'interior', b, walls, [])).toEqual({ axis: 3.9, side: null, reference: 'axis' });
  });
});
