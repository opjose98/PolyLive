// =============================================================================
// theme.ts — La interfaz entera toma el color del MODO y el tono del TEMA
// =============================================================================
//
// Dos ejes, 12 combinaciones, todas precalculadas:
//   · modo  → acento: Levantamiento ámbar, Topografía verde, Avance azul,
//             Revisión morado (los colores de sus íconos). Saber en qué modo se
//             está sin leer nada es lo que más ayuda con una mano y al sol.
//   · tema  → superficies y texto: claro, oscuro (noche, interiores) y alto
//             contraste (sol directo: negro sobre blanco, bordes duros).
// El lienzo usa la MISMA combinación (`canvasPaletteFor`): trazo en curso,
// selección y snap van en el color del modo.
//
// Uso en componentes:
//   const useStyles = themedStyles((colors) => ({ ... }));   // a nivel de módulo
//   const styles = useStyles();                               // en el componente
//   const colors = useTheme();                                // colores sueltos
// Los estilos se crean una vez por combinación y se reutilizan: cambiar de
// modo o de tema no cuesta más que un render.
// =============================================================================

import { useStore } from 'zustand';
import { StyleSheet } from 'react-native';
import type { CanvasThemeId, WorkModeId } from '../../application/workspace/catalog';
import { workspaceStore } from '../../state/workspaceStore';
import { CANVAS_PALETTES, CanvasPalette } from './canvasThemes';

export interface ChromeColors {
  /** Relleno de acento (FAB, botón principal, chip activo). */
  readonly accent: string;
  /** Acento para texto, íconos y bordes sobre superficie (más contraste que `accent`). */
  readonly accentText: string;
  /** Fondo teñido del acento (seleccionado, activo suave). */
  readonly accentSoft: string;
  /** Texto e íconos SOBRE el acento. */
  readonly textOnAccent: string;
  /** Lado B del muro en alzado (nunca igual al acento). */
  readonly sideB: string;

  readonly surface: string;
  readonly background: string;
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textDisabled: string;
  /** Etiquetas oscuras flotantes: rótulos del FAB, toasts. */
  readonly tooltip: string;
  readonly tooltipText: string;
  readonly scrim: string;
  /** Superficie translúcida para rótulos que flotan sobre el lienzo. */
  readonly glass: string;

  readonly error: string;
  readonly warning: string;
  readonly success: string;
  readonly info: string;

  readonly isDark: boolean;
  /** Grosor de bordes del cromo (más grueso en alto contraste). */
  readonly hairline: number;
}

type Tone = { fill: string; text: string; soft: string; onFill: string };

/** Acento de cada modo en cada tema. Oscuro: tonos claros; contraste: los más oscuros. */
const ACCENTS: Record<WorkModeId, Record<CanvasThemeId, Tone>> = {
  levantamiento: {
    claro: { fill: '#FF8F00', text: '#E65100', soft: 'rgba(255, 143, 0, 0.12)', onFill: '#FFFFFF' },
    oscuro: { fill: '#FFA726', text: '#FFB74D', soft: 'rgba(255, 167, 38, 0.18)', onFill: '#1A1A1A' },
    contraste: { fill: '#E65100', text: '#B33F00', soft: 'rgba(230, 81, 0, 0.16)', onFill: '#FFFFFF' },
  },
  topografia: {
    claro: { fill: '#2E7D32', text: '#1B5E20', soft: 'rgba(46, 125, 50, 0.12)', onFill: '#FFFFFF' },
    oscuro: { fill: '#66BB6A', text: '#81C784', soft: 'rgba(102, 187, 106, 0.18)', onFill: '#0F1F10' },
    contraste: { fill: '#1B5E20', text: '#0B3D0F', soft: 'rgba(27, 94, 32, 0.16)', onFill: '#FFFFFF' },
  },
  avance: {
    claro: { fill: '#1E88E5', text: '#1565C0', soft: 'rgba(30, 136, 229, 0.12)', onFill: '#FFFFFF' },
    oscuro: { fill: '#64B5F6', text: '#90CAF9', soft: 'rgba(100, 181, 246, 0.18)', onFill: '#0D1A26' },
    contraste: { fill: '#0D47A1', text: '#0A2F6B', soft: 'rgba(13, 71, 161, 0.16)', onFill: '#FFFFFF' },
  },
  revision: {
    claro: { fill: '#8E24AA', text: '#6A1B9A', soft: 'rgba(142, 36, 170, 0.12)', onFill: '#FFFFFF' },
    oscuro: { fill: '#BA68C8', text: '#CE93D8', soft: 'rgba(186, 104, 200, 0.18)', onFill: '#1E0F22' },
    contraste: { fill: '#6A1B9A', text: '#4A0E6B', soft: 'rgba(106, 27, 154, 0.16)', onFill: '#FFFFFF' },
  },
};

const BASES: Record<CanvasThemeId, Omit<ChromeColors, 'accent' | 'accentText' | 'accentSoft' | 'textOnAccent' | 'sideB'>> = {
  claro: {
    surface: '#FFFFFF',
    background: '#FAFAFA',
    border: '#E0E0E0',
    text: '#212121',
    textSecondary: '#757575',
    textDisabled: '#BDBDBD',
    tooltip: '#424242',
    tooltipText: '#FFFFFF',
    scrim: 'rgba(0, 0, 0, 0.38)',
    glass: 'rgba(255, 255, 255, 0.9)',
    error: '#D32F2F',
    warning: '#F9A825',
    success: '#2E7D32',
    info: '#1976D2',
    isDark: false,
    hairline: StyleSheet.hairlineWidth,
  },
  oscuro: {
    surface: '#1E1E1E',
    background: '#141414',
    border: '#333333',
    text: '#EDEDED',
    textSecondary: '#A8A8A8',
    textDisabled: '#5E5E5E',
    tooltip: '#E6E6E6',
    tooltipText: '#121212',
    scrim: 'rgba(0, 0, 0, 0.6)',
    glass: 'rgba(30, 30, 30, 0.9)',
    error: '#EF5350',
    warning: '#FFCA28',
    success: '#66BB6A',
    info: '#64B5F6',
    isDark: true,
    hairline: StyleSheet.hairlineWidth,
  },
  contraste: {
    surface: '#FFFFFF',
    background: '#FFFFFF',
    border: '#000000',
    text: '#000000',
    textSecondary: '#1F1F1F',
    textDisabled: '#6B6B6B',
    tooltip: '#000000',
    tooltipText: '#FFFFFF',
    scrim: 'rgba(0, 0, 0, 0.6)',
    glass: '#FFFFFF',
    error: '#B71C1C',
    warning: '#8A5A00',
    success: '#1B5E20',
    info: '#0D47A1',
    isDark: false,
    hairline: 1.5,
  },
};

const SIDE_B: Record<CanvasThemeId, string> = { claro: '#1E88E5', oscuro: '#64B5F6', contraste: '#0D47A1' };
/** Si el modo ya es azul (Avance), el lado B pasa a verde azulado para no confundirse. */
const SIDE_B_ALT: Record<CanvasThemeId, string> = { claro: '#00897B', oscuro: '#4DB6AC', contraste: '#00574B' };

const chromeCache = new Map<string, ChromeColors>();

export function chromeColors(theme: CanvasThemeId, mode: WorkModeId): ChromeColors {
  const key = `${theme}:${mode}`;
  let c = chromeCache.get(key);
  if (!c) {
    const a = ACCENTS[mode][theme];
    c = {
      ...BASES[theme],
      accent: a.fill,
      accentText: a.text,
      accentSoft: a.soft,
      textOnAccent: a.onFill,
      sideB: mode === 'avance' ? SIDE_B_ALT[theme] : SIDE_B[theme],
    };
    chromeCache.set(key, c);
  }
  return c;
}

const canvasCache = new Map<string, CanvasPalette>();

/** Paleta del lienzo del tema, con el trazo, la selección y el snap en el color del modo. */
export function canvasPaletteFor(theme: CanvasThemeId, mode: WorkModeId): CanvasPalette {
  const key = `${theme}:${mode}`;
  let p = canvasCache.get(key);
  if (!p) {
    const a = ACCENTS[mode][theme];
    const base = CANVAS_PALETTES[theme];
    p = {
      ...base,
      preview: a.fill,
      snapNode: a.fill,
      selection: theme === 'oscuro' ? a.text : a.fill,
      selectionFill: a.soft,
      roomFill: withAlpha(a.fill, theme === 'contraste' ? 0.07 : 0.06),
      roomStroke: withAlpha(a.text, 0.35),
    };
    canvasCache.set(key, p);
  }
  return p;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Colores del cromo según el modo y el tema activos. */
export function useTheme(): ChromeColors {
  const theme = useStore(workspaceStore, (s) => s.canvasTheme);
  const mode = useStore(workspaceStore, (s) => s.workMode);
  return chromeColors(theme, mode);
}

/** Paleta del lienzo según el modo y el tema activos. */
export function useCanvasPalette(): CanvasPalette {
  const theme = useStore(workspaceStore, (s) => s.canvasTheme);
  const mode = useStore(workspaceStore, (s) => s.workMode);
  return canvasPaletteFor(theme, mode);
}

/**
 * Hoja de estilos que depende de los colores. Se crea una vez por paleta (hay
 * 12) y se reutiliza; el componente llama al hook que devuelve.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ChromeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const cache = new Map<ChromeColors, T>();
  return function useStyles(): T {
    const colors = useTheme();
    let s = cache.get(colors);
    if (!s) {
      s = StyleSheet.create(factory(colors));
      cache.set(colors, s);
    }
    return s;
  };
}
