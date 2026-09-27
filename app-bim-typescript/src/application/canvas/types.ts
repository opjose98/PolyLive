// =============================================================================
// types.ts — Tipos de Canvas e Interacción
// Basado en: Canvas2D-interacción.md, gestión-estado-Zustand.md
// =============================================================================

// ---------------------------------------------------------------------------
// CanvasPoint — Coordenada en píxeles de pantalla (NO mundo)
// ---------------------------------------------------------------------------

/**
 * Coordenada en el espacio de pantalla (píxeles).
 * Se distingue de Point2D (metros en espacio mundo) por branded type.
 *
 * INVARIANTE: x >= 0, y >= 0 (dentro del viewport visible)
 */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
  readonly __brand: 'CanvasPoint';
}

/** Constructor de CanvasPoint con validación. */
export function canvasPoint(x: number, y: number): CanvasPoint {
  return { x, y, __brand: 'CanvasPoint' as const };
}

// ---------------------------------------------------------------------------
// Gestos
// ---------------------------------------------------------------------------
//
// AQUÍ VIVÍA una jerarquía de tipos de gesto (TapGesture, LongPressGesture,
// DragGesture, PinchGesture, CanvasEvent...) junto con un `GestureHandler` que
// los emitía a unos listeners. Se eliminó porque ninguna pantalla la usó nunca:
// el canvas real traduce los toques con gesture-handler dentro de
// `ui/canvas/PlanCanvas.tsx` y llama directamente a EditorController.
//
// Mantener las dos cosas significaba tener una tubería de eventos con sus
// propios tests verificando un camino que la app no recorre, mientras el camino
// que sí recorre no tenía ninguno. La decisión fue quedarse con el real.
//
// ---------------------------------------------------------------------------
// Constantes de Canvas
// ---------------------------------------------------------------------------

/**
 * Escala mínima (zoom out máximo): 1 px/m deja ver ~400 m en un teléfono, lo
 * suficiente para un conjunto o una sede entera. Con 5 px/m (el valor
 * anterior) un levantamiento de más de ~80 m no cabía en pantalla.
 */
export const MIN_SCALE = 1;  // 1 px/m

/** Escala máxima (zoom in máximo). */
export const MAX_SCALE = 500; // 500 px/m

/** Escala por defecto (100 px/m = 1cm = 1px). */
export const DEFAULT_SCALE = 100;
