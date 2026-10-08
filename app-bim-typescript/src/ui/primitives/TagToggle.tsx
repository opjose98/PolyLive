// =============================================================================
// TagToggle — Etiqueta que se enciende y apaga (filtros, capas, snaps)
// =============================================================================
//
// Pastilla con su texto; encendida toma el acento del modo. La transición de
// color corre en el hilo UI (reanimated) para que alternar varias seguidas no
// tropiece con el render.
// =============================================================================

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { duration } from '../design/motion';
import { Tappable } from './Tappable';
import { Icon } from './Icon';
import { useTheme } from '../design/theme';

interface TagToggleProps {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: string;
  /** 'radio' anuncia el rol correcto a lectores de pantalla. */
  role?: 'checkbox' | 'radio';
}

/** Etiqueta encendible (drawer de configuración, grupos de opciones). */
export function TagToggle({ label, on, onPress, icon, role = 'checkbox' }: TagToggleProps) {
  const colors = useTheme();
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(on ? 1 : 0, { duration: duration.fast });
  }, [on, t]);

  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [colors.background, colors.accent]),
    borderColor: interpolateColor(t.value, [0, 1], [colors.border, colors.accent]),
  }));

  const fg = on ? colors.textOnAccent : colors.text;
  return (
    <Tappable
      onPress={onPress}
      haptic="select"
      accessibilityRole={role}
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.tag, bg]}>
        {icon && <Icon name={icon} size={14} color={fg} />}
        <Text style={[styles.text, { color: fg }]}>{label}</Text>
      </Animated.View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 32,
  },
  text: { ...type.label },
});
