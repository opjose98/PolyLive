import { buildWallOutlines, faceSegments } from '../../src/ui/canvas/wallGeometry';

const T = 0.2;
const wall = (id: string, ax: number, ay: number, bx: number, by: number, t = T) => ({
  id,
  start: { x: ax, y: ay },
  end: { x: bx, y: by },
  thickness: t,
});

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('buildWallOutlines', () => {
  it('un muro suelto es un rectángulo del espesor, con tapas en los dos extremos', () => {
    const o = buildWallOutlines([wall('a', 0, 0, 4, 0)]).get('a')!;
    close(o.polygon[0], 0, 0.1);
    close(o.polygon[1], 4, 0.1);
    close(o.polygon[2], 4, -0.1);
    close(o.polygon[3], 0, -0.1);
    expect(o.startFree).toBe(true);
    expect(o.endFree).toBe(true);
  });

  it('una esquina en L se cierra a inglete: las dos caras de ambos muros se encuentran', () => {
    // a: (0,0)→(4,0); b: (4,0)→(4,3). Normal izquierda de a es +y.
    const outlines = buildWallOutlines([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 4, 3)]);
    const a = outlines.get('a')!;
    const b = outlines.get('b')!;
    // Cara +y de a (interior de la L) termina en (3.9, 0.1); la exterior en (4.1, -0.1).
    close(a.polygon[1], 3.9, 0.1);
    close(a.polygon[2], 4.1, -0.1);
    expect(a.endFree).toBe(false);
    // b comparte exactamente esas esquinas.
    const bStart = [b.polygon[0], b.polygon[3]];
    expect(bStart.some((p) => Math.abs(p.x - 3.9) < 1e-6 && Math.abs(p.y - 0.1) < 1e-6)).toBe(true);
    expect(bStart.some((p) => Math.abs(p.x - 4.1) < 1e-6 && Math.abs(p.y + 0.1) < 1e-6)).toBe(true);
  });

  it('dos muros colineales se continúan sin inglete ni tapa', () => {
    const o = buildWallOutlines([wall('a', 0, 0, 2, 0), wall('b', 2, 0, 5, 0)]).get('a')!;
    close(o.polygon[1], 2, 0.1);
    close(o.polygon[2], 2, -0.1);
    expect(o.endFree).toBe(false);
  });

  it('en una T cada cara del muro que llega se cruza con el vecino de su lado', () => {
    const o = buildWallOutlines([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 8, 0), wall('c', 4, 0, 4, 3)]);
    const a = o.get('a')!;
    // Cara +y de a choca con c (sube): x = 3.9. Cara −y sigue recta contra b.
    close(a.polygon[1], 3.9, 0.1);
    close(a.polygon[2], 4, -0.1);
  });

  it('un ángulo muy agudo no dispara un pico: termina recto', () => {
    const o = buildWallOutlines([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 0, 0.05)]).get('a')!;
    for (const p of o.polygon) expect(Math.abs(p.x)).toBeLessThan(6);
  });
});

describe('faceSegments', () => {
  it('corta la cara por el hueco de un vano', () => {
    const segs = faceSegments({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 0.1 }, { x: 4, y: 0.1 }, [[1, 2]]);
    expect(segs).toHaveLength(2);
    close(segs[0][1], 1, 0.1);
    close(segs[1][0], 2, 0.1);
  });

  it('sin huecos devuelve la cara entera, incluso si sobresale por el inglete', () => {
    const segs = faceSegments({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: -0.1, y: 0.1 }, { x: 4.1, y: 0.1 }, []);
    expect(segs).toHaveLength(1);
    close(segs[0][0], -0.1, 0.1);
  });
});
