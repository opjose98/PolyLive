// =============================================================================
// WorkspaceStatusBar — Barra superior del espacio de trabajo
// Portado de: polylive-mockup/js/components/statusbar.js
// =============================================================================
//
// Fila 1: "Proyecto · Espacio". Fila 2: ☰ | deshacer · rehacer · ⋮.
// El ⋮ se convierte en ✕ (ámbar) mientras el drawer de configuración está abierto.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { IconButton } from '../primitives';
import { sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

export interface WorkspaceStatusBarProps {
  project: string;
  space: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const WorkspaceStatusBar = React.memo(function WorkspaceStatusBar({ project, space, canUndo, canRedo, onUndo, onRedo }: WorkspaceStatusBarProps) {
  const styles = useStyles();
  const panel = useStore(workspaceStore, (s) => s.currentPanel);
  const ws = workspaceStore.getState;
  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1}>
        <Text style={styles.titleStrong}>{project}</Text> · {space}
      </Text>
      <View style={styles.row}>
        <IconButton
          icon="menu"
          label="Menú principal"
          variant="plain"
          size={sizes.iconButton}
          on={panel === 'mainMenu'}
          onPress={() => ws().togglePanel('mainMenu')}
          haptic="select"
        />
        <View style={styles.right}>
          <IconButton icon="undo" label="Deshacer" variant="plain" size={sizes.iconButton} disabled={!canUndo} onPress={onUndo} />
          <IconButton icon="redo" label="Rehacer" variant="plain" size={sizes.iconButton} disabled={!canRedo} onPress={onRedo} />
          <IconButton
            icon={panel === 'configDrawer' ? 'close' : 'dots-vertical'}
            label="Configuración"
            variant="plain"
            size={sizes.iconButton}
            on={panel === 'configDrawer'}
            onPress={() => ws().togglePanel('configDrawer')}
            haptic="select"
          />
        </View>
      </View>
    </View>
  );
});

export const STATUS_BAR_HEIGHT = 24 + sizes.statusBarRow + spacing.xs;

const useStyles = themedStyles((colors) => ({
  bar: {
    height: STATUS_BAR_HEIGHT,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.sm,
    zIndex: 20,
  },
  title: { ...type.label, color: colors.textSecondary, textAlign: 'center', height: 24, lineHeight: 24 },
  titleStrong: { ...type.bodyStrong, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: sizes.statusBarRow },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
