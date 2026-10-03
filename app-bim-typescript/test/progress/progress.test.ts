import {
  supportGrid,
  coverage,
  coveredArea,
  coverageRuns,
  quantities,
  faceSupport,
  supportArea,
  targetKey,
  ProgressMark,
  ProgressCut,
  Support,
} from '../../src/domain/progress/progress';

const rectSupport = (w: number, h: number): Support => ({
  outline: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
  holes: [],
});

let seq = 0;
const mark = (over: Partial<ProgressMark>): ProgressMark => ({
  id: `m${++seq}`,
  spaceId: 'S',
  cutId: 'c1',
  activityId: 'pintura',
  target: { kind: 'floor', zoneId: 'z' },
  shape: { kind: 'fill' },
  erase: false,
  operator: 'op',
  createdAt: `2026-10-03T00:00:${String(seq).padStart(2, '0')}Z`,
  ...over,
});

describe('avance — malla y cobertura', () => {
  it('la malla cubre el soporte con el área correcta', () => {
    const g = supportGrid(rectSupport(4, 3));
    const all = coverage(g, [{ shape: { kind: 'fill' }, erase: false }]);
    expect(coveredArea(g, all)).toBeCloseTo(12, 1);
  });

  it('un rectángulo cuenta solo lo que cae dentro del soporte', () => {
    const g = supportGrid(rectSupport(4, 3));
    const on = coverage(g, [{ shape: { kind: 'rect', a: { x: 2, y: 1 }, b: { x: 10, y: 10 } }, erase: false }]);
    expect(coveredArea(g, on)).toBeCloseTo(2 * 2, 1);
  });

  it('dos pasadas sobre el mismo sitio cuentan una vez; el borrador resta', () => {
    const g = supportGrid(rectSupport(4, 3));
    const stroke = { kind: 'stroke' as const, points: [{ x: 0, y: 1.5 }, { x: 4, y: 1.5 }], width: 1 };
    const once = coveredArea(g, coverage(g, [{ shape: stroke, erase: false }]));
    const twice = coveredArea(g, coverage(g, [{ shape: stroke, erase: false }, { shape: stroke, erase: false }]));
    expect(once).toBeCloseTo(4, 1);
    expect(twice).toBeCloseTo(once, 6);
    const erased = coveredArea(
      g,
      coverage(g, [
        { shape: stroke, erase: false },
        { shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } }, erase: true },
      ]),
    );
    expect(erased).toBeCloseTo(2, 1);
  });

  it('los vanos de una cara de muro no se pintan', () => {
    const s = faceSupport(5, { leftBase: 0, rightBase: 0, leftTop: 2.5, rightTop: 2.5 }, [{ xOffset: 1, width: 1, sillHeight: 1, height: 1 }]);
    expect(supportArea(s)).toBeCloseTo(12.5 - 1);
    const g = supportGrid(s);
    expect(coveredArea(g, coverage(g, [{ shape: { kind: 'fill' }, erase: false }]))).toBeCloseTo(11.5, 1);
  });

  it('las corridas por fila reproducen el área', () => {
    const g = supportGrid(rectSupport(2, 1));
    const on = coverage(g, [{ shape: { kind: 'fill' }, erase: false }]);
    const runs = coverageRuns(g, on);
    expect(runs.reduce((a, r) => a + r.w * r.h, 0)).toBeCloseTo(coveredArea(g, on), 9);
  });
});

describe('avance — cantidades por corte', () => {
  const cuts: ProgressCut[] = [
    { id: 'c1', projectId: 'P', date: '2026-09-01', label: 'Sep', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'c2', projectId: 'P', date: '2026-10-01', label: 'Oct', createdAt: '2026-10-01T00:00:00Z' },
  ];
  const supports = new Map([[targetKey({ kind: 'floor', zoneId: 'z' }), rectSupport(4, 3)]]);

  it('en el corte y acumulado', () => {
    seq = 0;
    const marks = [
      mark({ cutId: 'c1', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } }),
      mark({ cutId: 'c2', shape: { kind: 'rect', a: { x: 2, y: 0 }, b: { x: 3, y: 3 } } }),
      mark({ cutId: 'c2', activityId: 'piso', shape: { kind: 'fill' } }),
    ];
    const q1 = quantities(supports, marks, cuts, 'c1');
    expect(q1).toHaveLength(1);
    expect(q1[0].inCut).toBeCloseTo(6, 1);
    expect(q1[0].cumulative).toBeCloseTo(6, 1);

    const q2 = quantities(supports, marks, cuts, 'c2');
    const pintura = q2.find((r) => r.activityId === 'pintura')!;
    expect(pintura.inCut).toBeCloseTo(3, 1);
    expect(pintura.cumulative).toBeCloseTo(9, 1);
    expect(pintura.supportArea).toBeCloseTo(12);
    expect(q2.find((r) => r.activityId === 'piso')!.cumulative).toBeCloseTo(12, 1);
  });

  it('borrar en un corte posterior no cambia el anterior', () => {
    seq = 0;
    const marks = [
      mark({ cutId: 'c1', shape: { kind: 'fill' } }),
      mark({ cutId: 'c2', erase: true, shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } }),
    ];
    expect(quantities(supports, marks, cuts, 'c1')[0].cumulative).toBeCloseTo(12, 1);
    expect(quantities(supports, marks, cuts, 'c2')[0].cumulative).toBeCloseTo(6, 1);
  });
});
