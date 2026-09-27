// =============================================================================
// FloatWindow — Ventana flotante (BLE, filtros, capas, config de niveles)
// Portado de: polylive-mockup/js/core.js (PL.FloatWindow)
// =============================================================================
//
// Su visibilidad la decide `workspaceStore.currentWindow`, así respeta la
// regla de "un solo panel abierto" sin que cada ventana la reimplemente.
// =============================================================================

import React from 'react';
import { ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { colors, elevation, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { Tappable } from './Tappable';
import { Icon } from './Icon';

export interface FloatWindowProps {
  id: string;
  title: string;
  /** Posición absoluta dentro del lienzo (top/right/bottom/left, width). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function FloatWindow({ id, title, style, children }: FloatWindowProps) {
  const visible = useStore(workspaceStore, (s) => s.currentWindow?.id === id);
  if (!visible) return null;

  return (
    <Animated.View
      entering={ZoomIn.springify().damping(18).stiffness(260)}
      exiting={FadeOut.duration(120)}
      style={[styles.window, style]}
      accessibilityViewIsModal
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Tappable
          onPress={() => workspaceStore.getState().closeWindow()}
          hitSlop={10}
          accessibilityLabel={`Cerrar ${title}`}
        >
          <Icon name="close" size={18} color={colors.textSecondary} />
        </Tappable>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  window: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '70%',
    minWidth: 200,
    ...elevation[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...type.heading, color: colors.text },
  body: { flexGrow: 0 },
  bodyContent: { padding: spacing.md, gap: spacing.sm },
});
