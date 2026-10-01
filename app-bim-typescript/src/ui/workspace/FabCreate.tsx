// =============================================================================
// FabCreate — FAB de creación (inferior derecha)
// Portado de: polylive-mockup/js/components/fab-create.js
// =============================================================================
//
// Drill-down de tres niveles: categorías → herramientas → formas de creación.
// El botón principal está anclado y no se mueve; los mini-botones salen hacia
// arriba en abanico. Las herramientas sin objeto de dominio se ven atenuadas y
// explican por qué al tocarlas.
// =============================================================================

import React from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { categoriesFor, isToolEnabled } from '../../application/workspace/catalog';
import { fabMainIcon } from '../../application/workspace/fabMachine';
import type { ActiveTool } from '../../application/workspace/bpcContext';
import { IconButton, Icon, Tappable, toast } from '../primitives';
import { elevation, radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { STAGGER_MS } from '../design/motion';
import { themedStyles, useTheme } from '../design/theme';

interface MiniItem {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  selected?: boolean;
  onPress: () => void;
}

export interface FabCreateProps {
  /** Se llama cuando una herramienta queda activa (con su forma, si tiene). */
  onToolActivated: (tool: ActiveTool) => void;
}

export const FabCreate = React.memo(function FabCreate({ onToolActivated }: FabCreateProps) {
  const styles = useStyles();
  const colors = useTheme();
  const fab = useStore(workspaceStore, (s) => s.fab);
  const mode = useStore(workspaceStore, (s) => s.mode);
  const workMode = useStore(workspaceStore, (s) => s.workMode);
  // Catálogo contextual: depende del modo de trabajo y de la vista.
  const categories = categoriesFor(workMode, mode);
  const ws = workspaceStore.getState;

  const activate = (categoryId: string, toolId: string, methodId?: string) => {
    const r = ws().activateTool(categoryId, toolId, methodId);
    if (r.ok) onToolActivated(r.tool);
  };

  let items: MiniItem[] = [];
  if (fab.level === 'categories') {
    items = categories.map((c) => ({
      key: c.id,
      label: c.label,
      icon: c.icon,
      enabled: true,
      onPress: () => ws().pickFabCategory(c.id),
    }));
  } else if (fab.level === 'tools') {
    const cat = categories.find((c) => c.id === fab.categoryId);
    items = (cat?.tools ?? []).map((t) => ({
      key: t.id,
      label: t.label,
      icon: t.icon,
      enabled: isToolEnabled(t),
      onPress: () => {
        const r = ws().pickFabTool(fab.categoryId, t.id);
        if (r.ok && 'tool' in r) onToolActivated(r.tool);
      },
    }));
  } else if (fab.level === 'methods') {
    const tool = categories.find((c) => c.id === fab.categoryId)?.tools.find((t) => t.id === fab.toolId);
    items = (tool?.methods ?? []).map((m) => ({
      key: m.id,
      label: m.label,
      icon: m.icon,
      enabled: true,
      onPress: () => activate(fab.categoryId, fab.toolId, m.id),
    }));
  }

  const levelTitle =
    fab.level === 'tools'
      ? categories.find((c) => c.id === fab.categoryId)?.label
      : fab.level === 'methods'
        ? categories.find((c) => c.id === fab.categoryId)?.tools.find((t) => t.id === fab.toolId)?.label
        : undefined;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.minis} pointerEvents="box-none">
        {items.map((it, i) => (
          <Animated.View
            key={`${fab.level}-${it.key}`}
            entering={ZoomIn.delay(i * STAGGER_MS).springify().damping(14).stiffness(260)}
            exiting={FadeOut.duration(90)}
            style={styles.mini}
          >
            <Tappable
              onPress={it.onPress}
              disabled={!it.enabled}
              onDisabledPress={() => toast(`${it.label}: disponible próximamente`, { kind: 'info' })}
              haptic="select"
              style={styles.miniRow}
              accessibilityLabel={it.label}
            >
              <View style={styles.tip}>
                <Text style={styles.tipText}>{it.label}</Text>
              </View>
              <View style={[styles.miniBtn, !it.enabled && styles.miniBtnOff]}>
                <Icon name={it.icon} size={20} color={it.enabled ? colors.text : colors.textDisabled} />
              </View>
            </Tappable>
          </Animated.View>
        ))}
        {levelTitle ? (
          <Animated.View entering={ZoomIn.duration(140)} exiting={FadeOut.duration(90)} style={styles.levelTag}>
            <Text style={styles.levelText}>{levelTitle}</Text>
          </Animated.View>
        ) : null}
      </View>
      <IconButton
        icon={fabMainIcon(fab)}
        label={fab.level === 'closed' ? 'Crear' : fab.level === 'categories' ? 'Cerrar' : 'Volver'}
        variant="filled"
        size={sizes.fabCreate}
        onPress={() => ws().pressFabMain()}
        haptic="select"
      />
    </View>
  );
});

const useStyles = themedStyles((colors) => ({
  wrap: { position: 'absolute', right: spacing.lg, bottom: spacing.xl, alignItems: 'flex-end' },
  minis: {
    position: 'absolute',
    right: (sizes.fabCreate - sizes.fabMini) / 2,
    bottom: sizes.fabCreate + spacing.md,
    flexDirection: 'column-reverse',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  mini: {},
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tip: { backgroundColor: colors.tooltip, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  tipText: { ...type.label, color: colors.tooltipText },
  miniBtn: {
    width: sizes.fabMini,
    height: sizes.fabMini,
    borderRadius: sizes.fabMini / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation[2],
  },
  miniBtnOff: { backgroundColor: colors.background },
  levelTag: { paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: colors.surface, borderRadius: radius.sm, ...elevation[1] },
  levelText: { ...type.caption, color: colors.textSecondary, textTransform: 'uppercase' },
}));
