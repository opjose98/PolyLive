// =============================================================================
// spaceSetup.ts — Lo que se configura al crear un espacio (docs/23 § 7)
// =============================================================================
//
// Niveles y fases son de cada espacio. Al crearlo se proponen los niveles de la
// plantilla (editables) o los de otro espacio, y sus fases; todo se puede
// cambiar después desde los selectores del lienzo.
// =============================================================================

import { BASE_MARKER_NAME, LEVEL_TEMPLATE, type MarkerKind, type MarkerScope, type ProjectMarker } from '../../domain/objects/marker';

export interface SpaceSetup {
  /** El primero es la base (cota 0). */
  readonly levels: readonly { readonly name: string; readonly value: number }[];
  /** En orden; la primera es la base. */
  readonly phases: readonly string[];
}

interface MarkerWriter {
  list(scope: MarkerScope, kind: MarkerKind): Promise<ProjectMarker[]>;
  replaceAll(scope: MarkerScope, kind: MarkerKind, items: readonly { name: string; value: number }[]): Promise<void>;
}

export const defaultSpaceSetup = (): SpaceSetup => ({ levels: [...LEVEL_TEMPLATE], phases: [BASE_MARKER_NAME.phase] });

/** La configuración de un espacio existente, para copiarla a uno nuevo. */
export async function readSpaceSetup(markers: MarkerWriter, scope: MarkerScope): Promise<SpaceSetup> {
  const [levels, phases] = await Promise.all([markers.list(scope, 'level'), markers.list(scope, 'phase')]);
  return { levels: levels.map((m) => ({ name: m.name, value: m.value })), phases: phases.map((m) => m.name) };
}

/** Escribe niveles y fases en el espacio. Los niveles se ordenan por cota y la base queda en 0. */
export async function applySpaceSetup(markers: MarkerWriter, scope: MarkerScope, setup: SpaceSetup): Promise<void> {
  const [base, ...rest] = setup.levels;
  const levels = [
    { name: base?.name.trim() || BASE_MARKER_NAME.level, value: 0 },
    ...rest.filter((l) => l.name.trim() && l.value !== 0).sort((a, b) => a.value - b.value),
  ];
  const phases = setup.phases.map((name) => name.trim()).filter(Boolean);
  await markers.replaceAll(scope, 'level', levels);
  await markers.replaceAll(
    scope,
    'phase',
    (phases.length ? phases : [BASE_MARKER_NAME.phase]).map((name, i) => ({ name, value: i })),
  );
}
