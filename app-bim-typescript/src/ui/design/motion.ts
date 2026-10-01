// =============================================================================
// motion.ts — Duraciones, curvas y resortes compartidos
// =============================================================================
//
// Un solo lugar para el "ritmo" de la app: si cada componente elige sus
// propios tiempos, la interfaz se siente inconsistente aunque cada animación
// por separado esté bien.
// =============================================================================

import { Easing, WithSpringConfig } from 'react-native-reanimated';

// En obra la interfaz tiene que responder YA: transiciones cortas, nada que
// haga esperar para seguir dibujando.
export const duration = {
  instant: 80,
  fast: 140,
  base: 200,
  slow: 300,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.bezier(0, 0, 0, 1),
  exit: Easing.bezier(0.3, 0, 1, 1),
} as const;

export const spring: Readonly<Record<'snappy' | 'gentle' | 'bouncy', WithSpringConfig>> = {
  /** Respuesta directa: presión de botones, deslizadores. */
  snappy: { damping: 22, stiffness: 380, mass: 0.6 },
  /** Paneles y cajones. */
  gentle: { damping: 26, stiffness: 220, mass: 1 },
  /** Mini-botones del FAB saliendo en abanico. */
  bouncy: { damping: 14, stiffness: 260, mass: 0.7 },
};

/** Retraso entre elementos de una lista que aparece escalonada. */
export const STAGGER_MS = 35;

/** Escala de un control mientras se presiona. */
export const PRESS_SCALE = 0.94;

/** Duración del long-press (propiedades de objeto, BLE). */
export const LONG_PRESS_MS = 450;
