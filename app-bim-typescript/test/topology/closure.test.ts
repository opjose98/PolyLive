import { checkClosure, closureTolerance, controlDiagonal } from '../../src/domain/topology/closure';

describe('Control de cierre', () => {
  it('la diagonal de un rectángulo 3,8 × 2,8 y su tolerancia', () => {
    const d = controlDiagonal([{ x: 0, y: 0 }, { x: 3.8, y: 0 }, { x: 3.8, y: 2.8 }, { x: 0, y: 2.8 }])!;
    expect(d.length).toBeCloseTo(Math.hypot(3.8, 2.8));
    expect(closureTolerance(d.length)).toBeCloseTo(0.01 + 0.001 * d.length);
  });

  it('cierra si el error está dentro de la tolerancia; si no, hay que revisar', () => {
    expect(checkClosure(4.72, 4.725).ok).toBe(true);
    const bad = checkClosure(4.72, 4.76);
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeCloseTo(0.04);
  });

  it('un triángulo no tiene diagonal', () => {
    expect(controlDiagonal([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBeNull();
  });
});
