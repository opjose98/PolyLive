import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { itemAt } from '../../application/workspace/rangeModel';
import { colors, spacing } from '../design/tokens';
import { type } from '../design/typography';

/** Rótulo discreto bajo la BPC: el nivel activo, donde nace lo que se crea. */
export const LevelChip = React.memo(function LevelChip({ top }: { top: number }) {
  const name = useStore(workspaceStore, (s) => itemAt(s.levels, 'nivel').name);
  return (
    <Text style={[styles.chip, { top }]}>
      Nivel: <Text style={styles.strong}>{name}</Text>
    </Text>
  );
});

const styles = StyleSheet.create({
  // Fondo propio: el chip flota sobre el lienzo, que puede ser oscuro.
  chip: {
    position: 'absolute',
    left: spacing.md,
    ...type.caption,
    color: colors.textSecondary,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  strong: { ...type.label, color: colors.text },
});
