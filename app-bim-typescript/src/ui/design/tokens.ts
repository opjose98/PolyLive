// =============================================================================
// tokens.ts — Sistema de diseño de PolyLive (identidad ámbar)
// Fuente: polylive-mockup/css/styles.css (:root)
// =============================================================================
//
// ÚNICA fuente de colores, espacios, radios y tamaños del cromo. El antiguo
// `ui/theme/tokens.ts` (navy + amarillo de LevON) se eliminó en la auditoría
// post-M2: todas las pantallas usan estos tokens y `typography.ts`.
//
// Estos tokens son del CROMO (barras, FABs, paneles). Los colores del lienzo
// dependen del tema y viven en `canvasThemes.ts`.
// =============================================================================

export const colors = {
  amber: '#FF8F00',
  /** Acento sobre blanco (texto, borde del FAB de vista). */
  amberDark: '#E65100',
  amberSoft: 'rgba(255, 143, 0, 0.12)',
  /** Lado B del muro en alzado. */
  sideB: '#1E88E5',

  surface: '#FFFFFF',
  background: '#FAFAFA',
  border: '#E0E0E0',
  text: '#212121',
  textSecondary: '#757575',
  textDisabled: '#BDBDBD',
  textOnAccent: '#FFFFFF',
  /** Etiquetas oscuras: tooltips, rótulos de FAB, toasts. */
  tooltip: '#424242',
  scrim: 'rgba(0, 0, 0, 0.38)',

  error: '#D32F2F',
  warning: '#F9A825',
  success: '#2E7D32',
  info: '#1976D2',
} as const;

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
