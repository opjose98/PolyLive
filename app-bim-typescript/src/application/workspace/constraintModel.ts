// =============================================================================
// constraintModel.ts — Selector de base y tope de un elemento con altura
// =============================================================================
//
// Es un selector APARTE del de Niveles de la vista: aquel decide qué se ve,
// este decide a qué niveles se atan la base y el tope del muro o la columna
// que se crea (o se edita). Solo tiene dos deslizadores:
//
//      ∞   ← tope sin restricción: altura desconectada
//      ●T  tope
//      │
//      ●B  base
//
// El riel son los niveles del proyecto de menor a mayor cota, más ∞ arriba,
// que solo acepta el tope. Siempre base < tope.
// =============================================================================

import { VerticalExtent, extent } from '../../domain/objects/vertical';

export interface ConstraintLevel {
  readonly id: string;
  readonly name: string;
  /** Cota, m. */
  readonly value: number;
}

/** Extremo del muro que se edita: inicio (A) o fin (B). */
export type ConstraintEnd = 'a' | 'b';

export interface ConstraintEdit {
  readonly a: VerticalExtent;
  readonly b: VerticalExtent;
  /** Los dos extremos se mueven juntos (muro rectangular). */
  readonly linked: boolean;
  readonly editing: ConstraintEnd;
}

export function sortLevels(levels: readonly ConstraintLevel[]): ConstraintLevel[] {
  return [...levels].sort((x, y) => x.value - y.value);
}

/** Índice de ∞ en el riel (uno más que el último nivel). */
export function infinityIndex(levels: readonly ConstraintLevel[]): number {
  return levels.length;
}

/** Índice del nivel de base en el riel. Un id desconocido cae al nivel de cota 0 (o al más bajo). */
export function baseIndex(levels: readonly ConstraintLevel[], e: VerticalExtent): number {
  const i = levels.findIndex((l) => l.id === e.baseLevelId);
  if (i >= 0) return i;
  const zero = levels.findIndex((l) => l.value === 0);
  return zero >= 0 ? zero : 0;
}

/** Índice del tope en el riel; sin nivel (o uno que ya no existe) es ∞. */
export function topIndex(levels: readonly ConstraintLevel[], e: VerticalExtent): number {
  if (e.topLevelId === null) return infinityIndex(levels);
  const i = levels.findIndex((l) => l.id === e.topLevelId);
  return i >= 0 ? i : infinityIndex(levels);
}

/**
 * Restricción por defecto: base en el nivel activo, tope en el nivel
 * inmediatamente superior (o sin restricción si es el último).
 */
export function defaultExtent(
  levels: readonly ConstraintLevel[],
  activeLevelId: string,
  unconnectedHeight: number,
): VerticalExtent {
  const sorted = sortLevels(levels);
  const i = Math.max(0, sorted.findIndex((l) => l.id === activeLevelId));
  const base = sorted[i];
  const above = sorted[i + 1];
  return extent({ baseLevelId: base?.id ?? activeLevelId, topLevelId: above?.id ?? null, unconnectedHeight });
}

/** Mueve la base al índice pedido. Si alcanza al tope, el tope sube un nivel. */
export function moveBase(levels: readonly ConstraintLevel[], e: VerticalExtent, idx: number): VerticalExtent {
  if (levels.length === 0) return e;
  const i = Math.max(0, Math.min(levels.length - 1, Math.round(idx)));
  let t = topIndex(levels, e);
  if (t <= i) t = i + 1;
  return {
    ...e,
    baseLevelId: levels[i].id,
    topLevelId: t >= infinityIndex(levels) ? null : levels[t].id,
  };
}

/** Mueve el tope al índice pedido, siempre por encima de la base. ∞ = sin restricción. */
export function moveTop(levels: readonly ConstraintLevel[], e: VerticalExtent, idx: number): VerticalExtent {
  const b = baseIndex(levels, e);
  const i = Math.max(b + 1, Math.min(infinityIndex(levels), Math.round(idx)));
  return { ...e, topLevelId: i >= infinityIndex(levels) ? null : levels[i].id };
}

const m = (v: number) => `${Number(v.toFixed(2))}`;
const signed = (v: number) => (Math.abs(v) < 1e-6 ? '' : ` ${v > 0 ? '+' : '−'}${m(Math.abs(v))}`);

/** "Nivel 0 → Nivel 1", "Nivel 0 +0.1 → ∞ 2.8 m". */
export function describeExtent(levels: readonly ConstraintLevel[], e: VerticalExtent): string {
  const name = (id: string) => levels.find((l) => l.id === id)?.name ?? '?';
  const base = `${name(levels[baseIndex(levels, e)]?.id ?? e.baseLevelId)}${signed(e.baseOffset)}`;
  const top =
    topIndex(levels, e) >= infinityIndex(levels)
      ? `∞ ${m(e.unconnectedHeight)} m`
      : `${name(e.topLevelId as string)}${signed(e.topOffset)}`;
  return `${base} → ${top}`;
}

/** Aplica un cambio al extremo que se edita (y al otro, si están ligados). */
export function applyToEdit(edit: ConstraintEdit, next: VerticalExtent): ConstraintEdit {
  if (edit.linked) return { ...edit, a: next, b: next };
  return edit.editing === 'a' ? { ...edit, a: next } : { ...edit, b: next };
}

export function currentExtent(edit: ConstraintEdit): VerticalExtent {
  return edit.editing === 'a' ? edit.a : edit.b;
}
