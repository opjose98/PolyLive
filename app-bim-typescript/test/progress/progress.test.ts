import {
  supportGrid,
  coverage,
  coveredArea,
  coverageRuns,
  quantities,
  faceSupport,
  supportArea,
  targetKey,
  targetOfKey,
  markGain,
  quantityParts,
  coverageRects,
  columnSupport,
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

  it('borrar en un corte posterior no toca lo reportado en el anterior (H-87)', () => {
    seq = 0;
    const marks = [
      mark({ cutId: 'c1', shape: { kind: 'fill' } }),
      mark({ cutId: 'c2', erase: true, shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } }),
    ];
    expect(quantities(supports, marks, cuts, 'c1')[0].cumulative).toBeCloseTo(12, 1);
    expect(quantities(supports, marks, cuts, 'c2')[0].cumulative).toBeCloseTo(12, 1);
  });

  it('la misma actividad no se cuenta dos veces en cortes distintos; otra actividad sí (H-87)', () => {
    seq = 0;
    const marks = [
      mark({ cutId: 'c1', activityId: 'mamp', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } }),
      // Se vuelve a pintar todo con mampostería en el corte 2: solo cuenta lo nuevo (6 m²).
      mark({ cutId: 'c2', activityId: 'mamp', shape: { kind: 'fill' } }),
      // Pañete encima de la mampostería del corte 1: es otra actividad, cuenta entero.
      mark({ cutId: 'c2', activityId: 'panete', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } }),
    ];
    const q2 = quantities(supports, marks, cuts, 'c2');
    const mamp = q2.find((r) => r.activityId === 'mamp')!;
    expect(mamp.inCut).toBeCloseTo(6, 1);
    expect(mamp.cumulative).toBeCloseTo(12, 1);
    expect(q2.find((r) => r.activityId === 'panete')!.inCut).toBeCloseTo(6, 1);
    // El corte 1 sigue igual.
    expect(quantities(supports, marks, cuts, 'c1').find((r) => r.activityId === 'mamp')!.inCut).toBeCloseTo(6, 1);
  });

  it('markGain dice cuánto agrega una marca y cuánto ya estaba ejecutado', () => {
    seq = 0;
    const prev = mark({ cutId: 'c1', activityId: 'mamp', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } });
    const again = mark({ cutId: 'c2', activityId: 'mamp', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 3 } } });
    const wider = mark({ cutId: 'c2', activityId: 'mamp', shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 3, y: 3 } } });
    const s = rectSupport(4, 3);
    expect(markGain(s, [prev], cuts, again)).toEqual({ added: 0, alreadyDone: expect.closeTo(6, 1) });
    const g = markGain(s, [prev], cuts, wider);
    expect(g.added).toBeCloseTo(3, 1);
    expect(g.alreadyDone).toBeCloseTo(6, 1);
  });
});

describe('avance — partes para la memoria', () => {
  const cuts: ProgressCut[] = [{ id: 'c1', projectId: 'P', date: '2026-09-01', label: '', createdAt: '2026-09-01T00:00:00Z' }];
  const key = targetKey({ kind: 'wallFace', wallId: 'w', side: 'A' });

  it('un rectángulo pintado sale como una parte con sus medidas', () => {
    seq = 0;
    const supports = new Map([[key, rectSupport(5, 3)]]);
    const marks = [mark({ target: { kind: 'wallFace', wallId: 'w', side: 'A' }, shape: { kind: 'rect', a: { x: 1, y: 0 }, b: { x: 3, y: 2.5 } } })];
    const parts = quantityParts(supports, marks, cuts, 'c1');
    expect(parts).toHaveLength(1);
    expect(parts[0].w).toBeCloseTo(2, 1);
    expect(parts[0].h).toBeCloseTo(2.5, 1);
  });

  it('un trazo irregular se resume en una fila equivalente con el área exacta', () => {
    seq = 0;
    const supports = new Map([[key, rectSupport(5, 3)]]);
    const stroke = { kind: 'stroke' as const, points: [{ x: 0.3, y: 0.3 }, { x: 2, y: 2.4 }, { x: 4.6, y: 0.5 }], width: 0.4 };
    const marks = [mark({ target: { kind: 'wallFace', wallId: 'w', side: 'A' }, shape: stroke })];
    const g = supportGrid(rectSupport(5, 3));
    const area = coveredArea(g, coverage(g, [{ shape: stroke, erase: false }]));
    const parts = quantityParts(supports, marks, cuts, 'c1');
    expect(parts).toHaveLength(1);
    expect(parts[0].w * parts[0].h).toBeCloseTo(area, 3);
  });

  it('coverageRects reproduce el área de lo pintado', () => {
    const g = supportGrid(rectSupport(4, 3));
    const on = coverage(g, [
      { shape: { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 1, y: 3 } }, erase: false },
      { shape: { kind: 'rect', a: { x: 2, y: 1 }, b: { x: 4, y: 2 } }, erase: false },
    ]);
    const rects = coverageRects(g, on);
    expect(rects).toHaveLength(2);
    expect(rects.reduce((a, r) => a + r.w * r.h, 0)).toBeCloseTo(coveredArea(g, on), 6);
  });

  it('columnas: clave, soporte desdoblado y clave de vuelta', () => {
    expect(targetKey({ kind: 'column', columnId: 'c9' })).toBe('column:c9');
    expect(targetOfKey('column:c9')).toEqual({ kind: 'column', columnId: 'c9' });
    expect(targetOfKey('wall:w1:B')).toEqual({ kind: 'wallFace', wallId: 'w1', side: 'B' });
    expect(targetOfKey('floor:floor:f1')).toEqual({ kind: 'floor', zoneId: 'floor:f1' });
    expect(supportArea(columnSupport(1.2, 2.5))).toBeCloseTo(3);
  });
});
