// =============================================================================
// layout.ts — Teléfono, tableta, vertical y horizontal
// =============================================================================
//
// Una sola regla para decidir cómo se acomoda la interfaz al tamaño de la
// ventana (que cambia al girar el equipo): las hojas inferiores se centran
// y se limitan de ancho en pantallas anchas, y la galería pone más columnas.
// =============================================================================

import { useWindowDimensions } from 'react-native';

/** Lado corto desde el que se considera tableta (dp, criterio de Android). */
export const TABLET_MIN_SIDE = 600;
/** Ancho máximo de una hoja inferior: más ancha no se lee mejor. */
export const SHEET_MAX_WIDTH = 640;
/** Ancho objetivo de una miniatura de la galería (dp). */
const THUMB_TARGET = 120;

export interface LayoutClass {
  readonly width: number;
  readonly height: number;
  readonly landscape: boolean;
  readonly tablet: boolean;
  /** Ancho de una hoja inferior (centrada si es menor que la pantalla). */
  readonly sheetWidth: number;
  /** Fracción mínima del alto para una hoja inferior (en horizontal el alto es poco). */
  readonly sheetMinRatio: number;
  /** Columnas de la galería de fotos. */
  readonly galleryColumns: number;
}

export function layoutClass(width: number, height: number): LayoutClass {
  const landscape = width > height;
  const tablet = Math.min(width, height) >= TABLET_MIN_SIDE;
  return {
    width,
    height,
    landscape,
    tablet,
    sheetWidth: landscape || tablet ? Math.min(width, SHEET_MAX_WIDTH) : width,
    sheetMinRatio: landscape && !tablet ? 0.85 : 0,
    galleryColumns: Math.max(3, Math.min(8, Math.floor(width / THUMB_TARGET))),
  };
}

export function useLayout(): LayoutClass {
  const { width, height } = useWindowDimensions();
  return layoutClass(width, height);
}
