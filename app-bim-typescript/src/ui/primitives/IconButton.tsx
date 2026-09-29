// =============================================================================
// IconButton — Botón circular del cromo (FABs, filas de herramientas)
// =============================================================================
//
// "Encendido" = fondo ámbar con ícono blanco (regla del mockup). Las acciones
// sin estado (zoom, deshacer) nunca quedan encendidas.
// =============================================================================

import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, elevation } from '../design/tokens';
import { duration } from '../design/motion';
import { Tappable, HapticKind } from './Tappable';
import { Icon } from './Icon';

export interface IconButtonProps {
  icon: string;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  on?: boolean;
  size?: number;
  iconSize?: number;
  /** 'filled' = ámbar siempre (FAB principal); 'outline' = blanco con borde. */
  variant?: 'filled' | 'outline' | 'plain';
  disabled?: boolean;
  onDisabledPress?: () => void;
  haptic?: HapticKind;
  style?: StyleProp<ViewStyle>;
  raised?: boolean;
}

export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  on = false,
  size = 44,
  iconSize,
  variant = 'outline',
  disabled,
  onDisabledPress,
  haptic,
  style,
  raised = true,
}: IconButtonProps) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(on ? 1 : 0, { duration: duration.fast });
  }, [on, t]);

  const base = variant === 'filled' ? colors.amber : variant === 'plain' ? 'rgba(255,255,255,0)' : colors.surface;
  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [base, colors.amber]),
    borderColor: interpolateColor(t.value, [0, 1], [variant === 'outline' ? colors.border : base, colors.amber]),
  }));

  const fg = variant === 'filled' || on ? colors.textOnAccent : colors.text;
  return (
    <Tappable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onDisabledPress={onDisabledPress}
      haptic={haptic}
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={6}
      style={style}
    >
      <Animated.View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          variant === 'outline' && styles.outline,
          raised && variant !== 'plain' && elevation[2],
          bg,
        ]}
      >
        <Icon name={icon} size={iconSize ?? Math.round(size * 0.48)} color={fg} />
      </Animated.View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  outline: { borderWidth: 1 },
});
