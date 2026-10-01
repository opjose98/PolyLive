// =============================================================================
// Toast — Notificaciones breves que no bloquean (reemplazan a Alert.alert)
// =============================================================================
//
// `toast()` se puede llamar desde cualquier parte de la UI; `ToastHost` se
// monta una vez en la raíz. Un toast con acción ("Deshacer") dura más que uno
// informativo porque exige leer y decidir.
// =============================================================================

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { Icon } from './Icon';
import { Tappable } from './Tappable';
import { haptic } from '../design/haptics';
import { themedStyles, useTheme } from '../design/theme';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  kind?: ToastKind;
  action?: { label: string; onPress: () => void };
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'durationMs'>> {
  id: number;
  message: string;
  action?: ToastOptions['action'];
}

const MAX_VISIBLE = 3;
let nextId = 1;

const toastStore = createStore<{ items: ToastItem[] }>(() => ({ items: [] }));

function dismiss(id: number) {
  toastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
}

export function toast(message: string, options: ToastOptions = {}): void {
  const kind = options.kind ?? 'info';
  const item: ToastItem = {
    id: nextId++,
    message,
    kind,
    action: options.action,
    durationMs: options.durationMs ?? (options.action ? 4000 : 1800),
  };
  if (kind === 'error') haptic.error();
  else if (kind === 'warning') haptic.warning();
  toastStore.setState((s) => ({ items: [...s.items, item].slice(-MAX_VISIBLE) }));
}

const KIND_ICON: Record<ToastKind, { name: string; light: string; dark: string } | null> = {
  info: null,
  success: { name: 'check-circle-outline', light: '#81C784', dark: '#2E7D32' },
  warning: { name: 'alert-circle-outline', light: '#FFD54F', dark: '#8A5A00' },
  error: { name: 'alert-circle-outline', light: '#E57373', dark: '#C62828' },
};

function ToastRow({ item }: { item: ToastItem }) {
  const styles = useStyles();
  const colors = useTheme();
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), item.durationMs);
    return () => clearTimeout(t);
  }, [item.id, item.durationMs]);

  const icon = KIND_ICON[item.kind];
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutDown.duration(160)}
      layout={LinearTransition.springify().damping(20)}
      style={styles.toast}
      accessibilityLiveRegion="polite"
    >
      {icon && <Icon name={icon.name} size={18} color={colors.isDark ? icon.dark : icon.light} />}
      <Text style={styles.message}>{item.message}</Text>
      {item.action && (
        <Tappable
          onPress={() => {
            item.action!.onPress();
            dismiss(item.id);
          }}
          style={styles.action}
          hitSlop={8}
        >
          <Text style={styles.actionText}>{item.action.label}</Text>
        </Tappable>
      )}
    </Animated.View>
  );
}

export function ToastHost() {
  const styles = useStyles();
  const items = useStore(toastStore, (s) => s.items);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 96 }]}>
      {items.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tooltip,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxWidth: 420,
    ...elevation[2],
  },
  message: { ...type.body, color: colors.textOnAccent, flexShrink: 1 },
  action: { paddingHorizontal: spacing.xs },
  actionText: { ...type.label, color: colors.accent, textTransform: 'uppercase' },
}));
