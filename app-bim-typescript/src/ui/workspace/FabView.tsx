// =============================================================================
// FabView — FAB de vista + ventanas de Filtros y Capas (superior derecha)
// Portado de: polylive-mockup/js/components/fab-view.js
// =============================================================================

import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { workspaceStore } from '../../state/workspaceStore';
import {
  LAYERS,
  MODE_BLOCK_MESSAGE,
  OptionDef,
  WORK_MODES,
  WorkModeId,
  filtersFor,
  modeBlock,
  workModeDef,
} from '../../application/workspace/catalog';
import { FloatWindow, IconButton, Tappable, Icon, toast } from '../primitives';
import { radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { STAGGER_MS } from '../design/motion';
import { chromeColors, themedStyles, useTheme } from '../design/theme';

/** Entra a un modo si se puede; si no, explica por qué (toast). */
export function selectWorkMode(id: WorkModeId, hasObjects: boolean): boolean {
  const ws = workspaceStore.getState();
  const block = modeBlock(id, { view: ws.mode, hasObjects });
  if (block) {
    toast(MODE_BLOCK_MESSAGE[block], { kind: 'warning' });
    return false;
  }
  if (ws.workMode !== id) {
    ws.setWorkMode(id);
    toast(`${workModeDef(id).label}: ${workModeDef(id).hint}`, { kind: 'info', durationMs: 1400 });
  } else ws.closePanels();
  return true;
}

/**
 * FAB de vista: elige el MODO de trabajo (Levantamiento, Topografía, Avance,
 * Revisión). El botón muestra siempre el modo activo con su ícono y color.
 * Debajo, sin desplegar, quedan Filtros y Capas (contextuales al modo).
 */
export const FabView = React.memo(function FabView({ top, hasObjects = true }: { top: number; hasObjects?: boolean }) {
  const styles = useStyles();
  const colors = useTheme();
  const { open, workMode, mode, windowId, theme } = useStore(
    workspaceStore,
    useShallow((s) => ({ open: s.currentPanel === 'fabView', workMode: s.workMode, mode: s.mode, windowId: s.currentWindow?.id, theme: s.canvasTheme })),
  );
  const ws = workspaceStore.getState;
  const active = workModeDef(workMode);
  const modes = WORK_MODES.filter((m) => !(m.planOnly && mode !== 'plan'));

  return (
    <>
      <View style={[styles.wrap, { top }]} pointerEvents="box-none">
        <Tappable
          onPress={() => ws().togglePanel('fabView')}
          haptic="select"
          style={[styles.main, { borderColor: colors.accent }, open && { backgroundColor: colors.accent }]}
          accessibilityLabel={`Modo: ${active.label}. Cambiar de modo`}
          accessibilityState={{ expanded: open }}
        >
          <Animated.View key={active.id} entering={ZoomIn.duration(180)}>
            <Icon name={active.icon} size={22} color={open ? colors.textOnAccent : colors.accentText} />
          </Animated.View>
        </Tappable>
        {open ? (
          <View style={styles.minis}>
            {modes.map((m, i) => {
              const on = workMode === m.id;
              // Cada modo se ve con SU color en el tema actual.
              const mc = chromeColors(theme, m.id);
              const blocked = modeBlock(m.id, { view: mode, hasObjects }) !== null;
              return (
                <Animated.View key={m.id} entering={ZoomIn.delay(i * STAGGER_MS).springify().damping(15)} exiting={FadeOut.duration(80)}>
                  <Tappable
                    style={[styles.miniRow, blocked && styles.blocked]}
                    onPress={() => selectWorkMode(m.id, hasObjects)}
                    haptic={blocked ? 'none' : 'select'}
                    accessibilityLabel={m.label}
                    accessibilityState={{ selected: on, disabled: blocked }}
                  >
                    <View style={[styles.tip, on && { backgroundColor: mc.accent }]}>
                      <Text style={[styles.tipText, on && { color: mc.textOnAccent }]}>{m.label}</Text>
                    </View>
                    <View style={[styles.miniBtn, on && { backgroundColor: mc.accent, borderColor: mc.accent }]}>
                      <Icon name={m.icon} size={18} color={on ? mc.textOnAccent : mc.accentText} />
                    </View>
                  </Tappable>
                </Animated.View>
              );
            })}
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
        <Checks items={filtersFor(workMode, mode)} kind="filters" />
      </FloatWindow>
      <FloatWindow id="layers" title="Capas" style={[styles.window, { top: top + 8 }]}>
        <Checks items={LAYERS} kind="layers" />
      </FloatWindow>
    </>
  );
});

function Checks({ items, kind }: { items: readonly OptionDef[]; kind: 'filters' | 'layers' }) {
  const styles = useStyles();
  const colors = useTheme();
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

const useStyles = themedStyles((colors) => ({
  wrap: { position: 'absolute', right: spacing.lg, alignItems: 'flex-end' },
  main: {
    width: sizes.fabView,
    height: sizes.fabView,
    borderRadius: sizes.fabView / 2,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  blocked: { opacity: 0.45 },
  minis: { marginTop: spacing.sm, gap: spacing.sm, alignItems: 'flex-end' },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tip: { backgroundColor: colors.tooltip, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  tipText: { ...type.caption, color: colors.tooltipText },
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
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
}));
