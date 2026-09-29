import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { Icon, SideDrawer, Tappable } from '../primitives';
import { colors, spacing } from '../design/tokens';
import { type } from '../design/typography';

export interface MainMenuItem {
  icon: string;
  label: string;
  onPress: () => void;
}

/** Menú principal (☰): navegación fuera del lienzo. */
export const MainMenu = React.memo(function MainMenu({ top, title, subtitle, items }: { top: number; title: string; subtitle: string; items: MainMenuItem[] }) {
  const open = useStore(workspaceStore, (s) => s.currentPanel === 'mainMenu');
  const close = () => workspaceStore.getState().closePanels();
  return (
    <SideDrawer open={open} onClose={close} side="left" top={top}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {items.map((it) => (
        <Tappable
          key={it.label}
          style={styles.item}
          pressScale={0.98}
          onPress={() => {
            close();
            it.onPress();
          }}
          accessibilityLabel={it.label}
        >
          <Icon name={it.icon} size={22} color={colors.textSecondary} />
          <Text style={styles.label}>{it.label}</Text>
        </Tappable>
      ))}
    </SideDrawer>
  );
});

const styles = StyleSheet.create({
  header: { padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.label, color: colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52 },
  label: { ...type.body, color: colors.text },
});
