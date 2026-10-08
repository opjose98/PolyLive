// =============================================================================
// typography.ts — Roboto
// =============================================================================
//
// En Android/iOS `fontWeight` no elige la variante de una fuente cargada con
// expo-font: cada peso es una familia distinta. Por eso los estilos fijan
// `fontFamily` y nunca `fontWeight`.
// =============================================================================

import type { TextStyle } from 'react-native';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';

export const fontAssets = {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
};

const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
} as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  heading: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  caption: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 14 },
  /** Valores numéricos que cambian en vivo: dígitos de ancho fijo, sin saltos. */
  value: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
} as const;
