// =============================================================================
// FabView — FAB de vista + ventanas de Filtros y Capas (superior derecha)
// Portado de: polylive-mockup/js/components/fab-view.js
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { workspaceStore } from '../../state/workspaceStore';
import {
  FILTERS_ELEVATION,
  FILTERS_PLAN,
  LAYERS,
  OptionDef,
  VIEWS_ELEVATION,
  VIEWS_PLAN,
} from '../../application/workspace/catalog';
import { FloatWindow, IconButton, Tappable, Icon } from '../primitives';
import { colors, radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { STAGGER_MS } from '../design/motion';

export const FabView = React.memo(function FabView({ top }: { top: number }) {
  const { open, view, mode, windowId } = useStore(
    workspaceStore,
    useShallow((s) => ({ open: s.currentPanel === 'fabView', view: s.view, mode: s.mode, windowId: s.currentWindow?.id })),
  );
  const ws = workspaceStore.getState;
  const views = mode === 'plan' ? VIEWS_PLAN : VIEWS_ELEVATION;

  return (
    <>
      <View style={[styles.wrap, { top }]} pointerEvents="box-none">
        <IconButton
          icon="eye-outline"
          label="Tipo de vista"
          size={sizes.fabView}
          on={open}
          onPress={() => ws().togglePanel('fabView')}
          haptic="select"
          style={styles.mainBorder}
        />
        {open ? (
          <View style={styles.minis}>
            {views.map((v, i) => (
              <Animated.View key={v.id} entering={ZoomIn.delay(i * STAGGER_MS).springify().damping(15)} exiting={FadeOut.duration(80)}>
                <Tappable style={styles.miniRow} onPress={() => ws().setView(v.id)} haptic="select" accessibilityLabel={v.label}>
                  <View style={styles.tip}>
                    <Text style={styles.tipText}>{v.label}</Text>
                  </View>
                  <View style={[styles.miniBtn, view === v.id && styles.miniOn]}>
                    <Icon name={v.icon!} size={18} color={view === v.id ? colors.textOnAccent : colors.text} />
                  </View>
                </Tappable>
              </Animated.View>
            ))}
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(140)} style={styles.extra}>
            <IconButton
              icon="filter-variant"
              label="Filtros"
              size={34}
              on={windowId === 'filters'}
              onPress={() => ws().toggleWindow({ id: 'filters' })}
            />
            <IconButton
              icon="layers-outline"
              label="Capas"
              size={34}
              on={windowId === 'layers'}
              onPress={() => ws().toggleWindow({ id: 'layers' })}
            />
          </Animated.View>
        )}
      </View>

      <FloatWindow id="filters" title="Filtros" style={[styles.window, { top: top + 8 }]}>
        <Checks items={mode === 'plan' ? FILTERS_PLAN : FILTERS_ELEVATION} kind="filters" />
      </FloatWindow>
      <FloatWindow id="layers" title="Capas" style={[styles.window, { top: top + 8 }]}>
        <Checks items={LAYERS} kind="layers" />
      </FloatWindow>
    </>
  );
});

function Checks({ items, kind }: { items: readonly OptionDef[]; kind: 'filters' | 'layers' }) {
  const values = useStore(workspaceStore, (s) => (kind === 'filters' ? s.filters : s.layers)) as Record<string, boolean>;
  const ws = workspaceStore.getState;
  return (
    <>
      {items.map((it) => {
        const on = !!values[it.id];
        return (
          <Tappable
            key={it.id}
            style={styles.checkRow}
            pressScale={1}
            haptic="select"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => (kind === 'filters' ? ws().toggleFilter(it.id as never) : ws().toggleLayer(it.id as never))}
          >
            <Text style={styles.checkLabel}>{it.label}</Text>
            <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color={colors.textOnAccent} /> : null}</View>
          </Tappable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: spacing.lg, alignItems: 'flex-end' },
  mainBorder: {},
  minis: { marginTop: spacing.sm, gap: spacing.sm, alignItems: 'flex-end' },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tip: { backgroundColor: colors.tooltip, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  tipText: { ...type.caption, color: colors.textOnAccent },
  miniBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  extra: { marginTop: spacing.md, gap: spacing.sm, alignItems: 'center', width: sizes.fabView },
  window: { right: 64, width: 210 },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  checkLabel: { ...type.body, color: colors.text },
  check: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.amber, borderColor: colors.amber },
});
