// =============================================================================
// sectionCut.test.ts — Qué corta un plano vertical
// =============================================================================

import { columnFaces, CutWall, sectionCuts } from '../../src/domain/section/sectionCut';

const flatWall = (id: string, start: [number, number], end: [number, number], top = 2.5, openings: CutWall['openings'] = []): CutWall => ({
  id,
  start: { x: start[0], y: start[1] },
  end: { x: end[0], y: end[1] },
  thickness: 0.2,
  profileAt: () => ({ base: 0, top }),
  openings,
});

describe('sectionCuts', () => {
  it('alzado de un muro: el muro que llega en T y la columna embebida se ven cortados', () => {
    const line = { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, length: 6, halfWidth: 0.1 };
    const pieces = sectionCuts(line, {
      walls: [flatWall('t', [3, 0], [3, 4], 2.5)],
      columns: [{ id: 'c', footprint: [{ x: 4.9, y: -0.1 }, { x: 5.1, y: -0.1 }, { x: 5.1, y: 0.1 }, { x: 4.9, y: 0.1 }], base: 0, top: 2.7 }],
    });
    expect(pieces.map((p) => [p.id, Number(p.x0.toFixed(3)), Number(p.x1.toFixed(3)), p.bands])).toEqual([
      ['t', 2.9, 3.1, [[0, 2.5]]],
      ['c', 4.9, 5.1, [[0, 2.7]]],
    ]);
  });

  it('un corte que pasa por una ventana corta el muro abajo y arriba del hueco', () => {
    const line = { origin: { x: 1, y: -1 }, dir: { x: 0, y: 1 }, length: 2, halfWidth: 0.001 };
    const [p] = sectionCuts(line, { walls: [flatWall('w', [0, 0], [4, 0], 2.5, [{ x0: 0.5, x1: 1.5, z0: 1, z1: 2 }])] });
    expect(p.bands).toEqual([
      [0, 1],
      [2, 2.5],
    ]);
  });

  it('una losa con vacío se corta en dos tramos; un muro paralelo lejano no se corta', () => {
    const line = { origin: { x: 0, y: 1 }, dir: { x: 1, y: 0 }, length: 10, halfWidth: 0.001 };
    const pieces = sectionCuts(line, {
      walls: [flatWall('lejos', [0, 3], [10, 3])],
      slabs: [
        {
          id: 's',
          outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 2 }, { x: 0, y: 2 }],
          holes: [[{ x: 4, y: 0.5 }, { x: 6, y: 0.5 }, { x: 6, y: 1.5 }, { x: 4, y: 1.5 }]],
          top: 0,
          thickness: 0.1,
        },
      ],
    });
    expect(pieces.map((p) => [p.id, p.x0, p.x1])).toEqual([
      ['s', 0, 4],
      ['s', 6, 10],
    ]);
  });

  it('un muro en esquina solo roza: no es un corte si no entra en la banda', () => {
    const line = { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, length: 4, halfWidth: 0.1 };
    expect(sectionCuts(line, { walls: [flatWall('lejos', [0, 0.5], [0, 3])] })).toEqual([]);
  });
});

describe('columnFaces', () => {
  it('cuatro caras con el largo de sus lados; un muro que atraviesa la columna corta dos caras', () => {
    const faces = columnFaces({ x: 0, y: 0 }, 0.3, 0.2);
    expect(faces.map((f) => Number(f.line.length.toFixed(3)))).toEqual([0.3, 0.2, 0.3, 0.2]);
    const wall = flatWall('m', [-3, 0], [3, 0]);
    const hits = faces.map((f) => sectionCuts(f.line, { walls: [wall] }).length);
    expect(hits).toEqual([0, 1, 0, 1]);
  });
});
