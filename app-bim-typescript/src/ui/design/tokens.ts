// =============================================================================
// tokens.ts — Sistema de diseño de PolyLive (identidad ámbar)
// Fuente: polylive-mockup/css/styles.css (:root)
// =============================================================================
//
// Espacios, radios, tamaños y sombras del cromo (los colores: theme.ts). El antiguo
// `ui/theme/tokens.ts` (navy + amarillo de LevON) se eliminó en la auditoría
// post-M2: todas las pantallas usan estos tokens y `typography.ts`.
//
// Estos tokens son del CROMO (barras, FABs, paneles). Los colores del lienzo
// dependen del tema y viven en `canvasThemes.ts`.
// =============================================================================

// Los COLORES no están aquí: dependen del modo y del tema (ver theme.ts,
// `useTheme()` y `themedStyles`). Aquí solo lo que no cambia de color.

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { xs: 4, sm: 6, md: 8, lg: 14, xl: 24, round: 999 } as const;

/** Tamaños fijos del cromo, tomados del mockup y ajustados a mínimos táctiles. */
export const sizes = {
  statusBarRow: 40,
  bpcHeight: 44,
  fabCreate: 56,
  fabMini: 44,
  fabView: 44,
  fabCorner: 48,
  fabRange: 40,
  rangePanelWidth: 44,
  iconButton: 40,
  touchMin: 44,
  /** Tolerancia de acierto sobre el lienzo (mitad del objetivo táctil). */
  canvasTouchTolerance: 22,
  handleRadius: 7,
  drawerWidthRatio: 0.85,
} as const;

export const elevation = {
  1: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  2: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  3: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
} as const;

/** `#rrggbb` con transparencia, como `rgba(...)`; otro formato se devuelve tal cual. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}
