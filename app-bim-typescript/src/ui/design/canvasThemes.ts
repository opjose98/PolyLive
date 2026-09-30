// =============================================================================
// canvasThemes.ts — Paletas del lienzo (Claro / Oscuro / Alto contraste)
// Fuente: polylive-mockup/css/styles.css (.canvas[data-tema])
// =============================================================================
//
// El tema cambia SOLO el lienzo, nunca el cromo. Alto contraste está pensado
// para trabajar bajo sol directo: tinta negra, grilla azul saturada, selección
// magenta y trazos más gruesos (`lineScale`).
// =============================================================================

import type { CanvasThemeId } from '../../application/workspace/catalog';

export interface CanvasPalette {
  readonly background: string;
  readonly grid: string;
  readonly gridMajor: string;
  readonly gridDot: string;
  readonly ink: string;
  readonly partition: string;
  /** Relleno (poché) de muros portantes cortados por el plano. */
  readonly wallFill: string;
  /** Relleno de tabiques / particiones: más claro, la jerarquía se lee de un vistazo. */
  readonly partitionFill: string;
  readonly preview: string;
  readonly opening: string;
  readonly columnFill: string;
  readonly snapNode: string;
  readonly selection: string;
  readonly selectionFill: string;
  readonly handleFill: string;
  readonly roomFill: string;
  readonly roomStroke: string;
  readonly photoMarker: string;
  readonly label: string;
  /** Calco del nivel inferior (underlay). */
  readonly underlay: string;
  /**
   * Elementos de una fase ANTERIOR a la activa ("existente", como en Revit):
   * relleno en medio tono y trazo gris. Lo nuevo de la fase se lee encima.
   */
  readonly existingFill: string;
  readonly existingInk: string;
  /** Multiplicador de grosor de trazo (1 = normal). */
  readonly lineScale: number;
  /** Radio de los puntos de la rejilla, en px. */
  readonly dotRadius: number;
}

export const CANVAS_PALETTES: Readonly<Record<CanvasThemeId, CanvasPalette>> = {
  claro: {
    background: '#FFFFFF',
    grid: '#EEEEEE',
    gridMajor: '#D6D6D6',
    gridDot: '#BDBDBD',
    ink: '#212121',
    partition: '#757575',
    wallFill: '#616161',
    partitionFill: '#BDBDBD',
    preview: '#FF8F00',
    opening: '#1E88E5',
    columnFill: '#424242',
    snapNode: '#FF8F00',
    selection: '#FF8F00',
    selectionFill: 'rgba(255, 143, 0, 0.16)',
    handleFill: '#FFFFFF',
    roomFill: 'rgba(255, 143, 0, 0.06)',
    roomStroke: 'rgba(230, 81, 0, 0.35)',
    photoMarker: '#8E24AA',
    label: '#424242',
    underlay: 'rgba(33, 33, 33, 0.18)',
    existingFill: '#E0E0E0',
    existingInk: '#9E9E9E',
    lineScale: 1,
    dotRadius: 1.4,
  },
  oscuro: {
    background: '#121212',
    grid: '#2A2A2A',
    gridMajor: '#3A3A3A',
    gridDot: '#4A4A4A',
    ink: '#EDEDED',
    partition: '#9E9E9E',
    wallFill: '#9E9E9E',
    partitionFill: '#5A5A5A',
    preview: '#FFB74D',
    opening: '#64B5F6',
    columnFill: '#BDBDBD',
    snapNode: '#FFB74D',
    selection: '#FFB74D',
    selectionFill: 'rgba(255, 183, 77, 0.18)',
    handleFill: '#121212',
    roomFill: 'rgba(255, 183, 77, 0.07)',
    roomStroke: 'rgba(255, 183, 77, 0.35)',
    photoMarker: '#CE93D8',
    label: '#E0E0E0',
    underlay: 'rgba(237, 237, 237, 0.16)',
    existingFill: '#2E2E2E',
    existingInk: '#757575',
    lineScale: 1,
    dotRadius: 1.4,
  },
  contraste: {
    background: '#FFFFFF',
    grid: '#0B5ED7',
    gridMajor: '#0B5ED7',
    gridDot: '#0B5ED7',
    ink: '#000000',
    partition: '#000000',
    wallFill: '#000000',
    partitionFill: '#6E6E6E',
    preview: '#D500F9',
    opening: '#0B5ED7',
    columnFill: '#000000',
    snapNode: '#D500F9',
    selection: '#D500F9',
    selectionFill: 'rgba(213, 0, 249, 0.18)',
    handleFill: '#FFFFFF',
    roomFill: 'rgba(11, 94, 215, 0.06)',
    roomStroke: '#0B5ED7',
    photoMarker: '#D500F9',
    label: '#000000',
    underlay: 'rgba(0, 0, 0, 0.25)',
    existingFill: '#D0D0D0',
    existingInk: '#5A5A5A',
    lineScale: 2,
    dotRadius: 2.6,
  },
};
