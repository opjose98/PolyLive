import { editorScopes, levelViewOf } from '../../src/application/workspace/levelScope';
import { createRangeState, moveThumb, toggleSlotActive, withItems } from '../../src/application/workspace/rangeModel';

const levels = withItems(createRangeState('Nivel 0'), [
  { id: 'n0', name: 'Nivel 0', value: 0, base: true },
  { id: 'n1', name: 'Nivel 1', value: 3, base: false },
  { id: 'n2', name: 'Nivel 2', value: 6, base: false },
]);
const phases = withItems(createRangeState('Fase 0'), [
  { id: 'f0', name: 'Existente', value: 0, base: true },
  { id: 'f1', name: 'Nueva', value: 1, base: false },
]);

describe('levelScope — de los selectores al alcance del editor', () => {
  it('la vista ignora los extremos ±∞ y conoce el nivel y la fase activos', () => {
    const v = levelViewOf(levels, phases);
    expect(v.levels.map((l) => l.id)).toEqual(['n0', 'n1', 'n2']);
    expect(v.active.id).toBe('n0');
    expect(v.activePhase.id).toBe('f0');
  });

  it('calca debajo solo los niveles dentro de [inferior, superior], nunca el activo', () => {
    // Por defecto superior = +∞ e inferior = −∞: todo lo demás se calca.
    let st = moveThumb(levels, 'nivel', 2); // Nivel 1
    let { level } = editorScopes(levelViewOf(st, phases));
    expect(level.active).toBe('n1');
    expect([...level.underlay].sort()).toEqual(['n0', 'n2']);

    // Nivel 0 activo y superior en el Nivel 1: el Nivel 2 ya no se calca.
    st = toggleSlotActive(moveThumb(st, 'nivel', 1), 'superior');
    st = moveThumb(st, 'superior', 2);
    ({ level } = editorScopes(levelViewOf(st, phases)));
    expect(level.active).toBe('n0');
    expect([...level.underlay]).toEqual(['n1']);
  });

  it('la base y el orden de fases salen de los datos del proyecto', () => {
    const { level, phase } = editorScopes(levelViewOf(levels, moveThumb(phases, 'nivel', 2)));
    expect(level.base).toBe('n0');
    expect(level.elevations.get('n2')).toBe(6);
    expect(phase.active).toBe('f1');
    expect(phase.base).toBe('f0');
    expect(phase.order.get('f1')).toBe(1);
  });
});
