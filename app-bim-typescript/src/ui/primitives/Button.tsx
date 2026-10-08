// =============================================================================
// Button / ActionButton / Chip — Botones del sistema ámbar
// =============================================================================
//
// Reemplazan a los de la antigua ToolPalette (navy/amarillo). Mismo contrato
// (`label`, `onPress`, `variant`, `disabled`) para que las pantallas migren sin
// tocar su lógica; ahora con escala al tocar, háptica y Roboto.
// =============================================================================

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Tappable } from './Tappable';
import { Icon } from './Icon';
import { radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useTheme } from '../design/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: string;
  loading?: boolean;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const off = disabled && !loading;
  // Deshabilitado: colores propios en vez de transparentar el botón. Con opacidad, el
  // naranja sobre blanco del alto contraste quedaba durazno y el texto casi ilegible.
  const fg = off
    ? colors.textSecondary
    : variant === 'primary' || variant === 'danger'
      ? colors.textOnAccent
      : variant === 'text'
        ? colors.accentText
        : colors.text;
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled || loading}
      haptic={variant === 'danger' ? 'destroy' : 'tap'}
      style={[styles.button, styles[variant], off ? variant !== 'text' && styles.disabled : loading && styles.loading]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={18} color={fg} />
      ) : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Tappable>
  );
}

/** Interruptor en forma de píldora (filtros, opciones). */
export function Chip({
  label,
  active,
  hint,
  onPress,
}: {
  label: string;
  active: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Tappable
      onPress={onPress}
      haptic="select"
      style={[styles.chip, active && styles.chipOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      {active ? <Icon name="check" size={14} color={colors.accentText} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Tappable>
  );
}

/** Tarjeta de contenido: agrupa un tema dentro de una pantalla. */
export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  button: {
    // Como el botón anterior (ToolPalette): `flex: 1` reparte el ancho en una
    // fila de botones; `stretch` lo lleva al ancho de su columna.
    flex: 1,
    alignSelf: 'stretch',
    minHeight: sizes.touchMin,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.error },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  text: { backgroundColor: 'transparent', paddingHorizontal: spacing.sm },
  disabled: { backgroundColor: colors.border, borderWidth: 1.5, borderColor: colors.border },
  loading: { opacity: 0.7 },
  label: { ...type.bodyStrong },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { ...type.label, color: colors.textSecondary },
  chipTextOn: { color: colors.accentText },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...type.title, color: colors.text },
}));
