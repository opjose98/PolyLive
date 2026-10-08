// =============================================================================
// Tappable — Único punto de entrada para cualquier cosa que se toque
// =============================================================================
//
// Da a todos los controles el mismo feedback: se hunde un poco al presionar
// (resorte en el hilo UI), emite háptica al confirmar y se atenúa cuando está
// deshabilitado. Un control deshabilitado sigue recibiendo el toque si tiene
// `onDisabledPress` (para explicar POR QUÉ no se puede, p. ej. "próximamente").
// =============================================================================

import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PRESS_SCALE, LONG_PRESS_MS, spring } from '../design/motion';
import { haptic } from '../design/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticKind = keyof typeof haptic | 'none';

interface TappableProps extends Omit<PressableProps, 'style' | 'children' | 'disabled'> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onDisabledPress?: () => void;
  haptic?: HapticKind;
  /** Escala al presionar; 1 desactiva el efecto (filas de listas, p. ej.). */
  pressScale?: number;
}

export function Tappable({
  children,
  style,
  disabled = false,
  onDisabledPress,
  onPress,
  onLongPress,
  haptic: hapticKind = 'tap',
  pressScale = PRESS_SCALE,
  accessibilityState,
  ...rest
}: TappableProps) {
  const scale = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled }}
      delayLongPress={LONG_PRESS_MS}
      onPressIn={(e) => {
        scale.value = withSpring(pressScale, spring.snappy);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, spring.snappy);
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (disabled) {
          if (onDisabledPress) {
            haptic.warning();
            onDisabledPress();
          }
          return;
        }
        if (hapticKind !== 'none') haptic[hapticKind]();
        onPress?.(e);
      }}
      onLongPress={
        onLongPress && !disabled
          ? (e) => {
              haptic.grab();
              onLongPress(e);
            }
          : undefined
      }
      style={[style, disabled && { opacity: 0.38 }, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
