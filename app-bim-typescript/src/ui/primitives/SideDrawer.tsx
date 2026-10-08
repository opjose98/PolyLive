// =============================================================================
// SideDrawer — Cajón lateral (configuración a la derecha, menú a la izquierda)
// =============================================================================
//
// Se mantiene montado mientras anima el cierre (el progreso vive en un shared
// value); se cierra tocando el velo o arrastrándolo hacia su borde.
// =============================================================================

import React, { useEffect } from 'react';
import { AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { elevation, sizes } from '../design/tokens';
import { spring } from '../design/motion';
import { themedStyles } from '../design/theme';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  /** Distancia desde arriba (el cajón no tapa la barra de estado). */
  top?: number;
  children: React.ReactNode;
}

export function SideDrawer({ open, onClose, side, top = 0, children }: SideDrawerProps) {
  const styles = useStyles();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(screenW * sizes.drawerWidthRatio, 420);
  const dir = side === 'right' ? 1 : -1;

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    drag.value = 0;
    progress.value = withSpring(open ? 1 : 0, spring.gentle);
  }, [open, progress, drag]);

  // Una entrada del menú abre otra actividad (el selector de carpetas) mientras el cajón
  // aún se cierra: la animación se queda a medias y, al volver, el cajón se ve abierto
  // aunque ya está cerrado. Al volver a primer plano se fija en su estado real.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      drag.value = 0;
      progress.value = open ? 1 : 0;
    });
    return () => sub.remove();
  }, [open, progress, drag]);

  const pan = Gesture.Pan()
    .enabled(open)
    .activeOffsetX(dir > 0 ? 12 : -12)
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationX * dir);
    })
    .onEnd((e) => {
      if (drag.value > width * 0.3 || e.velocityX * dir > 600) runOnJS(onClose)();
      else drag.value = withSpring(0, spring.snappy);
    });

  const panelStyle = useAnimatedStyle(() => {
    const hidden = (1 - progress.value) * width;
    return { transform: [{ translateX: dir * (hidden + drag.value) }] };
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP) * (1 - drag.value / width),
  }));

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { top }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <View style={StyleSheet.absoluteFill} onTouchEnd={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal={open}
          style={[styles.panel, { width }, side === 'right' ? { right: 0 } : { left: 0 }, panelStyle]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  scrim: { backgroundColor: colors.scrim },
  panel: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.surface, ...elevation[3] },
}));
