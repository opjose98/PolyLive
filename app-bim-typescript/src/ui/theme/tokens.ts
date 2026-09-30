// =============================================================================
// tokens.ts — Sistema de diseño de PolyLive
// Portado de LevON: ui/theme/levon_tokens.dart
// =============================================================================
//
// POR QUÉ EXISTE: antes de este archivo, cada pantalla declaraba sus propios
// colores literales en su StyleSheet ('#2C3E50', '#DEE2E6', '#6C757D'…).
// El resultado era que el mismo concepto (una superficie, un borde, un texto
// secundario) tenía valores distintos según la pantalla, y no había ninguna
// forma de tocar la identidad visual sin recorrer las once pantallas a mano.
//
// La paleta viene de LevON (navy + amarillo), que es la identidad de producto
// ya decidida; los grises y las superficies se reconcilian con los que las
// pantallas de PolyLive ya usaban para que la migración no cambie el aspecto
// de nada que ya estaba bien.
//
// Las pantallas NO deben declarar colores literales: si falta un token, se
// añade aquí.
// =============================================================================

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

export const colors = {
  // Marca
  // F5: las pantallas heredadas pasan al sistema ámbar sin tocar su código:
  // `navy` es el acento de texto/fondo (ámbar oscuro) y `yellow`, lo que va
  // encima de él. Ver ui/design/tokens.ts.
  navy: '#E65100',
  navyLight: '#FF8F00',
  yellow: '#FFFFFF',
  yellowDark: '#FFE0B2',

  // Canvas (planta y elevación)
  canvasBg: '#F2F4F7',
  grid: '#E3E7EE',
  gridMajor: '#C6CEDC',
  wallStroke: '#1A1A2E',
  wallStructural: '#1A1A2E',
  /** Partición ligera: mismo trazo, más claro — la jerarquía debe verse. */
  wallPartition: '#7A8296',
  wallPreview: '#0A84FF',
  vanoStroke: '#0A84FF',
  columnFill: '#4A5568',
  snapNode: '#FF9500',
  nodeColor: '#FF6B9D',
  selectStroke: '#0A84FF',
  selectFill: 'rgba(10, 132, 255, 0.18)',
  handleFill: '#FFFFFF',
  handleStroke: '#0A84FF',
  roomFill: 'rgba(0, 47, 108, 0.10)',
  roomStroke: 'rgba(0, 47, 108, 0.40)',
  photoMarker: '#8E44AD',

  // Feedback
  error: '#D32F2F',
  warning: '#F9A825',
  success: '#2E7D32',
  info: '#0A84FF',

  // Superficies y texto
  surface: '#FFFFFF',
  surface2: '#FAFAFA',
  surface3: '#F5F5F5',
  divider: '#E0E0E0',
  textPrimary: '#212121',
  textSecondary: '#757575',
  textDisabled: '#BDBDBD',
  textOnDark: '#FFFFFF',
  overlayScrim: 'rgba(13, 27, 42, 0.55)',
} as const;

// ---------------------------------------------------------------------------
// Espaciado — escala de 4pt
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ---------------------------------------------------------------------------
// Radios
// ---------------------------------------------------------------------------

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Tipografía
// ---------------------------------------------------------------------------

// Roboto por familia (ver ui/design/typography.ts: en Android `fontWeight` no
// elige la variante de una fuente cargada con expo-font).
export const typography = {
  title: { fontSize: 20, fontFamily: 'Roboto_700Bold' },
  heading: { fontSize: 16, fontFamily: 'Roboto_500Medium' },
  body: { fontSize: 14, fontFamily: 'Roboto_400Regular' },
  bodyStrong: { fontSize: 14, fontFamily: 'Roboto_500Medium' },
  label: { fontSize: 12, fontFamily: 'Roboto_500Medium' },
  caption: { fontSize: 11, fontFamily: 'Roboto_400Regular' },
  mono: { fontSize: 12, fontFamily: 'Roboto_500Medium' },
} as const;

// ---------------------------------------------------------------------------
// Alturas de superficies fijas
// ---------------------------------------------------------------------------

export const layout = {
  toolbarHeight: 52,
  ribbonHeight: 56,
  tabBarHeight: 60,
  /**
   * Radio táctil mínimo en píxeles. Es también la tolerancia que se pasa a
   * SelectionService (convertida a metros con `touchToleranceMeters`): si el
   * objetivo visual es de 44px, la tolerancia de acierto debe ser la mitad.
   */
  touchTargetMin: 44,
  touchTolerancePx: 22,
  /** Radio de dibujo de los handles de manipulación. */
  handleRadiusPx: 7,
} as const;

// ---------------------------------------------------------------------------
// Sombras (equivalentes RN de LevonShadow)
// ---------------------------------------------------------------------------

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  float: {
    shadowColor: '#000000',
    shadowOpacity: 0.13,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  panel: {
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;
