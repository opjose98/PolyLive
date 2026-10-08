// =============================================================================
// MainMenu — Menú principal (☰): todo lo que no es el lienzo
// =============================================================================
//
// Sustituye a la barra de pestañas (F5). Agrupado por alcance: lo del espacio,
// lo del proyecto y lo de la app. Cada entrada abre una pantalla que se desliza
// sobre el levantamiento, que queda montado debajo.
// =============================================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { Icon, SideDrawer, Tappable } from '../primitives';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useTheme } from '../design/theme';

export interface MainMenuItem {
  icon: string;
  label: string;
  onPress: () => void;
  /** Encabezado de grupo que se muestra antes de esta entrada. */
  section?: string;
  /** Texto secundario (p. ej. el operador activo). */
  detail?: string;
}

export const MainMenu = React.memo(function MainMenu({
  top,
  title,
  subtitle,
  items,
}: {
  top: number;
  title: string;
  subtitle: string;
  items: MainMenuItem[];
}) {
  const styles = useStyles();
  const colors = useTheme();
  const open = useStore(workspaceStore, (s) => s.currentPanel === 'mainMenu');
  const close = () => workspaceStore.getState().closePanels();
  return (
    <SideDrawer open={open} onClose={close} side="left" top={top}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Icon name="cube-outline" size={22} color={colors.textOnAccent} />
        </View>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      {/* Barra visible: en pantallas bajas no se notaba que la lista continúa. */}
      <ScrollView contentContainerStyle={styles.list} persistentScrollbar>
        {items.map((it) => (
          <React.Fragment key={it.label}>
            {it.section ? <Text style={styles.section}>{it.section}</Text> : null}
            <Tappable
              style={styles.item}
              pressScale={0.98}
              onPress={() => {
                close();
                it.onPress();
              }}
              accessibilityLabel={it.label}
            >
              <Icon name={it.icon} size={22} color={colors.textSecondary} />
              <View style={styles.itemText}>
                <Text style={styles.label}>{it.label}</Text>
                {it.detail ? <Text style={styles.detail}>{it.detail}</Text> : null}
              </View>
              <Icon name="chevron-right" size={18} color={colors.textDisabled} />
            </Tappable>
          </React.Fragment>
        ))}
      </ScrollView>
    </SideDrawer>
  );
});

const useStyles = themedStyles((colors) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.label, color: colors.textSecondary },
  list: { paddingBottom: spacing.xl },
  section: {
    ...type.label,
    color: colors.accentText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52 },
  itemText: { flex: 1 },
  label: { ...type.body, color: colors.text },
  detail: { ...type.caption, color: colors.textSecondary },
}));
