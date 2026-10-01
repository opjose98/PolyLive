// =============================================================================
// BottomSheet — Hoja inferior animada (propiedades de objeto)
// =============================================================================
//
// Sube con resorte, se cierra arrastrando la manija hacia abajo o tocando el
// velo. El plano sigue visible arriba: el operador ve qué objeto está editando.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, radius, spacing } from '../design/tokens';
import { duration, spring } from '../design/motion';
import { themedStyles } from '../design/theme';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Alto de la hoja como fracción de la pantalla. */
  heightRatio?: number;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, heightRatio = 0.62, children }: BottomSheetProps) {
  const styles = useStyles();
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = Math.round(screenH * heightRatio);

  const offset = useSharedValue(sheetH);
  const scrim = useSharedValue(0);
  // Se mantiene montada mientras anima el cierre.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      offset.value = withSpring(0, spring.gentle);
      scrim.value = withTiming(1, { duration: duration.base });
    } else {
      scrim.value = withTiming(0, { duration: duration.fast });
      offset.value = withTiming(sheetH, { duration: duration.base }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, sheetH, offset, scrim]);

  const drag = Gesture.Pan()
    .onChange((e) => {
      offset.value = Math.max(0, offset.value + e.changeY);
    })
    .onEnd((e) => {
      if (offset.value > sheetH * 0.3 || e.velocityY > 800) runOnJS(onClose)();
      else offset.value = withSpring(0, spring.snappy);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value * (1 - offset.value / sheetH) }));

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <View style={StyleSheet.absoluteFill} onTouchEnd={onClose} accessibilityLabel="Cerrar propiedades" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { height: sheetH, paddingBottom: insets.bottom }, sheetStyle]}
        >
          <GestureDetector gesture={drag}>
            <View style={styles.grabArea} accessibilityLabel="Arrastra hacia abajo para cerrar">
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  scrim: { backgroundColor: colors.scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...elevation[3],
  },
  grabArea: { alignItems: 'center', paddingVertical: spacing.sm },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  content: { flex: 1 },
}));
