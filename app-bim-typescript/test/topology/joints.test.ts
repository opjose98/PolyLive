import { endsAt, planEndMove, planWallTranslate, degenerateInPlan, JointWall } from '../../src/domain/topology/joints';

const w = (id: string, ax: number, ay: number, bx: number, by: number): JointWall => ({
  id,
  start: { x: ax, y: ay },
  end: { x: bx, y: by },
});

// Cuadrado 4×3 con esquinas unidas, y un tabique en T apoyado en el muro inferior.
const square = [w('S', 0, 0, 4, 0), w('E', 4, 0, 4, 3), w('N', 4, 3, 0, 3), w('W', 0, 3, 0, 0)];
const withTee = [...square, w('T', 2, 0, 2, 3)];

const byId = (changes: ReturnType<typeof planEndMove>) => new Map(changes.map((c) => [c.id, c]));

describe('joints — uniones de muros', () => {
  it('endsAt encuentra los extremos que coinciden con un punto', () => {
    expect(endsAt(square, { x: 4, y: 0 })).toEqual([
      { id: 'S', end: 'end' },
      { id: 'E', end: 'start' },
    ]);
    expect(endsAt(square, { x: 4, y: 0 }, new Set(['S']))).toEqual([{ id: 'E', end: 'start' }]);
    expect(endsAt(square, { x: 2, y: 2 })).toEqual([]);
  });

  it('mover un extremo arrastra el extremo unido del vecino', () => {
    const plan = byId(planEndMove(square, 'S', 'end', { x: 5, y: 0 }));
    expect(plan.get('S')).toEqual({ id: 'S', end: { x: 5, y: 0 } });
    expect(plan.get('E')).toEqual({ id: 'E', start: { x: 5, y: 0 } });
    expect(plan.has('N')).toBe(false);
  });

  it('detach mueve solo el muro arrastrado', () => {
    const plan = planEndMove(square, 'S', 'end', { x: 5, y: 0 }, { detach: true });
    expect(plan).toEqual([{ id: 'S', end: { x: 5, y: 0 } }]);
  });

  it('un encuentro en T sigue al muro anfitrión que cambia de forma (mismo parámetro)', () => {
    // El muro S pasa de 0..4 a 0..6: el tabique T, apoyado a la mitad, va a x=3.
    const plan = byId(planEndMove(withTee, 'S', 'end', { x: 6, y: 0 }));
    expect(plan.get('T')!.start).toEqual({ x: 3, y: 0 });
    expect(plan.get('T')!.end).toBeUndefined();
  });

  it('trasladar un muro estira a los unidos y arrastra las T', () => {
    const plan = byId(planWallTranslate(withTee, 'S', 0, -1));
    expect(plan.get('S')).toEqual({ id: 'S', start: { x: 0, y: -1 }, end: { x: 4, y: -1 } });
    expect(plan.get('E')).toEqual({ id: 'E', start: { x: 4, y: -1 } });
    expect(plan.get('W')).toEqual({ id: 'W', end: { x: 0, y: -1 } });
    expect(plan.get('T')).toEqual({ id: 'T', start: { x: 2, y: -1 } });
    expect(plan.has('N')).toBe(false);
  });

  it('un extremo sobre la punta de otro es unión, no T', () => {
    const walls = [w('A', 0, 0, 4, 0), w('B', 4, 0, 4, 3)];
    const plan = byId(planWallTranslate(walls, 'A', 1, 0));
    expect(plan.get('B')).toEqual({ id: 'B', start: { x: 5, y: 0 } });
  });

  it('degenerateInPlan detecta muros que quedarían sin longitud', () => {
    const plan = planEndMove(square, 'S', 'end', { x: 4, y: 3 });
    // E iría de (4,3) a (4,3).
    expect(degenerateInPlan(square, plan, 0.05)).toEqual(['E']);
  });

  it('un muro desconocido no produce plan', () => {
    expect(planEndMove(square, 'X', 'end', { x: 0, y: 0 })).toEqual([]);
    expect(planWallTranslate(square, 'X', 1, 1)).toEqual([]);
  });
});
