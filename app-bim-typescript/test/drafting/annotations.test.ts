import { annotativeTextScale, draftShapes } from '../../src/ui/canvas/draftShapes';
import { mergeSketches, SketchShape, SketchSource } from '../../src/ui/canvas/sketch';
import type { DraftItem } from '../../src/domain/drafting/drafting';

const text: DraftItem = {
  id: 't1',
  spaceId: 's',
  view: { kind: 'plan' },
  levelId: 'l',
  kind: 'text',
  points: [{ x: 0, y: 0 }],
  text: 'Hola',
  props: { size: 12 },
  createdAt: '2026-10-05T00:00:00Z',
};
const ctx = { color: '#000', accent: '#f00', selectedId: null, mPerPx: 0.01, up: -1 as const, coordText: () => [] };

describe('escala anotativa', () => {
  it('un texto de N pt mide N pt en el papel: crece con el zoom y se acota', () => {
    // 1:50, 1 px = 1 cm del modelo → 1 pt = 0,3528 mm × 50 = 1,764 cm = 1,764 px
    expect(annotativeTextScale(50, 0.01)).toBeCloseTo(1.764, 3);
    expect(annotativeTextScale(50, 0.001)).toBe(6);
    expect(annotativeTextScale(50, 10)).toBe(0.4);
    expect(annotativeTextScale(0, 0.01)).toBe(1);
  });

  it('textScale multiplica el tamaño de textos y rótulos; sin él, tamaño fijo', () => {
    const fixed = draftShapes([text], ctx).find((s) => s.kind === 'text') as Extract<SketchShape, { kind: 'text' }>;
    const scaled = draftShapes([text], { ...ctx, textScale: 2 }).find((s) => s.kind === 'text') as Extract<SketchShape, { kind: 'text' }>;
    expect(fixed.size).toBe(12);
    expect(scaled.size).toBe(24);
  });
});

describe('mergeSketches', () => {
  function source(initial: SketchShape[]) {
    let shapes = initial;
    const subs = new Set<() => void>();
    const s: SketchSource = { subscribe: (cb) => (subs.add(cb), () => subs.delete(cb)), get: () => shapes };
    return { s, set: (v: SketchShape[]) => ((shapes = v), subs.forEach((cb) => cb())), count: () => subs.size };
  }
  const ring = (r: number): SketchShape => ({ kind: 'ring', at: { x: 0, y: 0 }, radius: r, color: '#000' });

  it('une las capas, conserva la identidad sin cambios y avisa de cualquiera', () => {
    const a = source([ring(1)]);
    const b = source([]);
    const m = mergeSketches(a.s, b.s);
    const first = m.get();
    expect(first).toHaveLength(1);
    expect(m.get()).toBe(first);
    const cb = jest.fn();
    const unsub = m.subscribe(cb);
    b.set([ring(2)]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(m.get()).toHaveLength(2);
    unsub();
    expect(a.count() + b.count()).toBe(0);
  });
});
