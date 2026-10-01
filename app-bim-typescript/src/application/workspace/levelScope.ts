// =============================================================================
// levelScope.ts — De los selectores de nivel/fase al alcance del editor
// =============================================================================
//
// Los selectores de rango (RangeSelector) guardan qué nivel y fase están
// activos y qué ventana [inferior, superior] se ve. El editor necesita eso
// como conjuntos y mapas para decidir qué objetos se ven, se calcan debajo o
// se dibujan como existentes. Es lógica pura: vive aquí, con tests, y no en
// la pantalla.
// =============================================================================

import type { LevelScope, PhaseScope } from '../editor/EditorController';
import { itemAt, RangeItem, RangeState } from './rangeModel';

/** Lo que la vista necesita de los selectores: niveles/fases reales y los activos. */
export interface LevelView {
  /** Niveles con cota (sin los extremos ±∞ del selector), en su orden. */
  readonly levels: readonly RangeItem[];
  readonly active: RangeItem;
  readonly upper: RangeItem;
  readonly lower: RangeItem;
  readonly phases: readonly RangeItem[];
  readonly activePhase: RangeItem;
}

const finite = (st: RangeState) => st.items.filter((it) => Number.isFinite(it.value));

export function levelViewOf(levels: RangeState, phases: RangeState): LevelView {
  return {
    levels: finite(levels),
    active: itemAt(levels, 'nivel'),
    upper: itemAt(levels, 'superior'),
    lower: itemAt(levels, 'inferior'),
    phases: finite(phases),
    activePhase: itemAt(phases, 'nivel'),
  };
}

/**
 * Alcance del editor. El nivel activo es la planta que se ve y se edita; los
 * demás dentro de [inferior, superior] se calcan atenuados. La fase activa es
 * donde nace lo nuevo; las anteriores se ven como "existente".
 */
export function editorScopes(v: LevelView): { level: LevelScope; phase: PhaseScope } {
  return {
    level: {
      active: v.active.id,
      base: v.levels.find((i) => i.base)?.id ?? v.active.id,
      all: new Set(v.levels.map((i) => i.id)),
      underlay: new Set(
        v.levels.filter((i) => i.id !== v.active.id && i.value >= v.lower.value && i.value <= v.upper.value).map((i) => i.id),
      ),
      elevations: new Map(v.levels.map((i) => [i.id, i.value] as [string, number])),
    },
    phase: {
      active: v.activePhase.id,
      base: v.phases.find((i) => i.base)?.id ?? v.activePhase.id,
      all: new Set(v.phases.map((i) => i.id)),
      order: new Map(v.phases.map((i) => [i.id, i.value] as [string, number])),
    },
  };
}
