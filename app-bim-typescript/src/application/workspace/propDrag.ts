// =============================================================================
// propDrag.ts — Paso de valor para la píldora arrastrable de la BPC
// Portado de: polylive-mockup/js/components/bpc.js (PX_POR_PASO = 6)
// =============================================================================

import type { PropDef } from './catalog';

/**
 * Píxeles de desplazamiento horizontal por cada paso. En el mockup eran 6 px
 * con mouse; con el dedo 6 px es demasiado nervioso (el pulso ya mueve 2–3
 * pasos), por eso el valor táctil es mayor.
 */
export const PX_PER_STEP = 10;

export function clampProp(def: PropDef, value: number): number {
  return Math.max(def.min, Math.min(def.max, value));
}

/**
 * Valor resultante de arrastrar `dxPx` desde que el valor era `startValue`.
 * Se calcula siempre desde el origen del gesto (no acumulando deltas) para que
 * volver el dedo al punto de partida devuelva exactamente el valor inicial.
 */
export function valueFromDrag(def: PropDef, startValue: number, dxPx: number, pxPerStep = PX_PER_STEP): number {
  const steps = Math.round(dxPx / pxPerStep);
  return clampProp(def, startValue + steps * def.step);
}

/** Incremento discreto (flechas de accesibilidad o botones ±). */
export function nudgeProp(def: PropDef, value: number, direction: 1 | -1): number {
  return clampProp(def, value + direction * def.step);
}
