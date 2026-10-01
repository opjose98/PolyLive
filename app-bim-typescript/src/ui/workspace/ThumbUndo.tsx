// =============================================================================
// ThumbUndo — Deshacer al alcance del pulgar
// =============================================================================
//
// En obra el teléfono se usa con una mano: deshacer y rehacer arriba, en la
// barra, quedan fuera del alcance del pulgar justo cuando más se necesitan
// (un muro mal trazado). Este botón vive junto al FAB +, solo cuando hay algo
// que deshacer: toque = deshacer; toque largo = rehacer.
// =============================================================================

import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { IconButton, toast } from '../primitives';
import { sizes, spacing } from '../design/tokens';

export const ThumbUndo = React.memo(function ThumbUndo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  if (!canUndo && !canRedo) return null;
  return (
    <Animated.View entering={ZoomIn.springify().damping(16)} exiting={FadeOut.duration(100)} style={styles.wrap}>
      <IconButton
        icon={canUndo ? 'undo-variant' : 'redo-variant'}
        label={canUndo ? 'Deshacer (mantén para rehacer)' : 'Rehacer'}
        size={sizes.fabMini}
        haptic="tap"
        onPress={canUndo ? onUndo : onRedo}
        onLongPress={() => {
          if (!canRedo) {
            toast('No hay nada que rehacer', { kind: 'info', durationMs: 1200 });
            return;
          }
          onRedo();
        }}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // A la izquierda del FAB +, centrado con él.
  wrap: {
    position: 'absolute',
    right: spacing.lg + sizes.fabCreate + spacing.md,
    bottom: spacing.xl + (sizes.fabCreate - sizes.fabMini) / 2,
  },
});
