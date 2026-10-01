// =============================================================================
// constraintModel.test.ts — Selector de base y tope
// =============================================================================

import {
  ConstraintEdit,
  applyToEdit,
  baseIndex,
  defaultExtent,
  describeExtent,
  moveBase,
  moveTop,
  sortLevels,
  topIndex,
} from '../../src/application/workspace/constraintModel';
import { extent } from '../../src/domain/objects/vertical';

const LEVELS = sortLevels([
  { id: 'n1', name: 'Nivel 1', value: 3 },
  { id: 'n0', name: 'Nivel 0', value: 0 },
  { id: 'n2', name: 'Nivel 2', value: 6 },
]);

describe('constraintModel', () => {
  it('por defecto va del nivel activo al de arriba; en el último, sin restricción', () => {
    expect(defaultExtent(LEVELS, 'n0', 2.8)).toMatchObject({ baseLevelId: 'n0', topLevelId: 'n1' });
    expect(defaultExtent(LEVELS, 'n2', 2.8)).toMatchObject({ baseLevelId: 'n2', topLevelId: null, unconnectedHeight: 2.8 });
  });

  it('el tope nunca queda en o bajo la base; ∞ es sin restricción', () => {
    const e = extent({ baseLevelId: 'n1', topLevelId: 'n2', unconnectedHeight: 2.8 });
    expect(moveTop(LEVELS, e, 0).topLevelId).toBe('n2'); // no baja de base+1
    expect(moveTop(LEVELS, e, 3).topLevelId).toBeNull();
    expect(topIndex(LEVELS, moveTop(LEVELS, e, 99))).toBe(3);
  });

  it('subir la base hasta el tope empuja el tope', () => {
    const e = extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 2.8 });
    const up = moveBase(LEVELS, e, 1);
    expect(up).toMatchObject({ baseLevelId: 'n1', topLevelId: 'n2' });
    const top = moveBase(LEVELS, e, 2);
    expect(top).toMatchObject({ baseLevelId: 'n2', topLevelId: null });
    expect(baseIndex(LEVELS, moveBase(LEVELS, e, -5))).toBe(0);
  });

  it('un nivel borrado se lee como la base de cota 0 y el tope como ∞', () => {
    const e = extent({ baseLevelId: 'x', topLevelId: 'y', unconnectedHeight: 2.8 });
    expect(baseIndex(LEVELS, e)).toBe(0);
    expect(topIndex(LEVELS, e)).toBe(3);
  });

  it('aplica al extremo que se edita, o a los dos si están ligados', () => {
    const a = extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 2.8 });
    const next = extent({ baseLevelId: 'n0', topLevelId: 'n2', unconnectedHeight: 2.8 });
    const free: ConstraintEdit = { a, b: a, linked: false, editing: 'b' };
    expect(applyToEdit(free, next)).toMatchObject({ a, b: next });
    expect(applyToEdit({ ...free, linked: true }, next)).toMatchObject({ a: next, b: next });
  });

  it('describe la restricción para la BPC', () => {
    expect(describeExtent(LEVELS, extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 2.8 }))).toBe('Nivel 0 → Nivel 1');
    expect(describeExtent(LEVELS, extent({ baseLevelId: 'n1', baseOffset: 0.1, unconnectedHeight: 2.5 }))).toBe('Nivel 1 +0.1 → ∞ 2.5 m');
  });
});
