// =============================================================================
// rangeModel.ts — Modelo de los selectores de rango (Nivel y Fase)
// Portado de: polylive-mockup/js/components/range-selector.js
// =============================================================================
//
// Un mismo modelo sirve para Niveles (cota en metros) y Fases (orden). Es
// inmutable: cada operación devuelve un estado nuevo.
//
// INVARIANTES
// - `items` siempre ordenados por valor ascendente.
// - Existen siempre −∞ (índice 0), la base (valor 0) y +∞ (último índice).
//   Los extremos no se editan ni se borran; la base se puede renombrar pero no
//   cambia de valor ni se borra.
// - Posiciones: inferior < nivel < superior. El deslizador central nunca ocupa
//   los extremos ±∞.
// - No hay dos elementos con el mismo valor.
// =============================================================================

export type RangeSlot = 'superior' | 'nivel' | 'inferior';
export const RANGE_SLOTS: readonly RangeSlot[] = ['superior', 'nivel', 'inferior'];

export interface RangeItem {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly base?: boolean;
  readonly fixed?: boolean;
}

export interface RangeState {
  readonly items: readonly RangeItem[];
  readonly pos: Readonly<Record<RangeSlot, number>>;
  readonly active: Readonly<Record<RangeSlot, boolean>>;
  readonly seq: number;
}

export const NEG_INF_ID = 'inf-';
export const POS_INF_ID = 'inf+';
export const BASE_ID = 'base';

export function createRangeState(baseName: string): RangeState {
  return {
    items: [
      { id: NEG_INF_ID, name: '−∞', value: -Infinity, fixed: true },
      { id: BASE_ID, name: baseName, value: 0, base: true },
      { id: POS_INF_ID, name: '+∞', value: Infinity, fixed: true },
    ],
    pos: { superior: 2, nivel: 1, inferior: 0 },
    active: { superior: false, nivel: true, inferior: false },
    seq: 0,
  };
}

export function isFiniteItem(item: RangeItem): boolean {
  return Number.isFinite(item.value);
}

export function itemAt(state: RangeState, slot: RangeSlot): RangeItem {
  return state.items[state.pos[slot]];
}

/** Elementos editables ordenados de mayor a menor, como los muestra la lista. */
export function editableItems(state: RangeState): RangeItem[] {
  return state.items.filter(isFiniteItem).sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Deslizadores
// ---------------------------------------------------------------------------

/** Índice que ocuparía `slot` si se intenta moverlo a `idx`, aplicando restricciones. */
export function constrainIndex(state: RangeState, slot: RangeSlot, idx: number): number {
  const { pos } = state;
  const last = state.items.length - 1;
  let i = Math.max(0, Math.min(last, Math.round(idx)));
  if (slot === 'superior') i = Math.max(i, pos.nivel + 1);
  else if (slot === 'inferior') i = Math.min(i, pos.nivel - 1);
  else i = Math.max(pos.inferior + 1, Math.min(pos.superior - 1, i));
  return i;
}

export function moveThumb(state: RangeState, slot: RangeSlot, idx: number): RangeState {
  const i = constrainIndex(state, slot, idx);
  if (i === state.pos[slot]) return state;
  return { ...state, pos: { ...state.pos, [slot]: i } };
}

export function toggleSlotActive(state: RangeState, slot: RangeSlot): RangeState {
  return { ...state, active: { ...state.active, [slot]: !state.active[slot] } };
}

/**
 * Convierte una fracción vertical del riel (0 = arriba, 1 = abajo) a índice.
 * Valores altos van ARRIBA.
 */
export function indexFromTrackFraction(state: RangeState, fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return Math.round((1 - f) * (state.items.length - 1));
}

/** Inversa de `indexFromTrackFraction`: dónde se dibuja el deslizador. */
export function trackFractionOf(state: RangeState, idx: number): number {
  const n = state.items.length;
  return n <= 1 ? 0 : 1 - idx / (n - 1);
}

// ---------------------------------------------------------------------------
// Configuración (lista editable)
// ---------------------------------------------------------------------------

type Selection = Readonly<Record<RangeSlot, string>>;

function selectionOf(state: RangeState): Selection {
  return {
    superior: itemAt(state, 'superior').id,
    nivel: itemAt(state, 'nivel').id,
    inferior: itemAt(state, 'inferior').id,
  };
}

/**
 * Reordena y recalcula posiciones conservando lo que cada deslizador tenía
 * seleccionado mientras siga siendo válido.
 */
function reorder(state: RangeState, items: RangeItem[], prev: Selection): RangeState {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const idxOf = (id: string) => sorted.findIndex((it) => it.id === id);
  const last = sorted.length - 1;

  let nivel = idxOf(prev.nivel);
  if (nivel < 0) nivel = idxOf(BASE_ID);
  let superior = idxOf(prev.superior);
  if (superior <= nivel) superior = last;
  let inferior = idxOf(prev.inferior);
  if (inferior < 0 || inferior >= nivel) inferior = 0;

  return { ...state, items: sorted, pos: { superior, nivel, inferior } };
}

export function addItem(state: RangeState, itemLabel: string, idPrefix: string): RangeState {
  const max = Math.max(...state.items.filter(isFiniteItem).map((it) => it.value));
  const value = max + 1;
  const seq = state.seq + 1;
  const item: RangeItem = { id: `${idPrefix}-${seq}`, name: `${itemLabel} ${value}`, value };
  return reorder({ ...state, seq }, [...state.items, item], selectionOf(state));
}

export function removeItem(state: RangeState, id: string): RangeState {
  const it = state.items.find((i) => i.id === id);
  if (!it || it.base || it.fixed) return state;
  return reorder(state, state.items.filter((i) => i.id !== id), selectionOf(state));
}

export function renameItem(state: RangeState, id: string, name: string): RangeState {
  const trimmed = name.trim();
  const it = state.items.find((i) => i.id === id);
  if (!it || it.fixed || !trimmed) return state;
  return { ...state, items: state.items.map((i) => (i.id === id ? { ...i, name: trimmed } : i)) };
}

export type SetValueResult =
  | { readonly ok: true; readonly state: RangeState }
  | { readonly ok: false; readonly reason: 'not-found' | 'base' | 'invalid' | 'duplicate' };

export function setItemValue(state: RangeState, id: string, value: number): SetValueResult {
  const it = state.items.find((i) => i.id === id);
  if (!it || it.fixed) return { ok: false, reason: 'not-found' };
  if (it.base) return { ok: false, reason: 'base' };
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
  if (state.items.some((o) => o.id !== id && o.value === value)) return { ok: false, reason: 'duplicate' };
  const items = state.items.map((i) => (i.id === id ? { ...i, value } : i));
  return { ok: true, state: reorder(state, items, selectionOf(state)) };
}
