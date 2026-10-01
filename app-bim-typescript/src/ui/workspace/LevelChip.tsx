import React from 'react';
import { Text } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import { itemAt } from '../../application/workspace/rangeModel';
import { spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

/** Rótulo discreto bajo la BPC: el nivel activo, donde nace lo que se crea. */
export const LevelChip = React.memo(function LevelChip({ top, wallName }: { top: number; wallName?: string }) {
  const styles = useStyles();
  const level = useStore(workspaceStore, (s) => itemAt(s.levels, 'nivel').name);
  const phase = useStore(workspaceStore, (s) => itemAt(s.phases, 'nivel').name);
  // En alzado el chip nombra el muro que se detalla (el mockup lo llama así).
  return (
    <Text style={[styles.chip, { top }]}>
      {wallName ? 'Muro: ' : 'Nivel: '}
      <Text style={styles.strong}>{wallName ?? level}</Text> · Fase: <Text style={styles.strong}>{phase}</Text>
    </Text>
  );
});

const useStyles = themedStyles((colors) => ({
  // Fondo propio: el chip flota sobre el lienzo, que puede ser oscuro.
  chip: {
    position: 'absolute',
    left: spacing.md,
    ...type.caption,
    color: colors.textSecondary,
    backgroundColor: colors.glass,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  strong: { ...type.label, color: colors.text },
}));
