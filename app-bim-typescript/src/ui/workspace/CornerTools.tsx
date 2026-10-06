// =============================================================================
// CornerTools — Herramientas de lienzo (inferior izquierda)
// Portado de: polylive-mockup/js/components/corner-tools.js
// =============================================================================
//
// Botón madre → 5 filas hacia arriba (Zoom, Snap, Tema, Cuadrícula, Escala);
// cada fila abre su menú horizontal. Solo un menú de fila abierto a la vez.
// =============================================================================

import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeOut, SlideInLeft, ZoomIn } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { workspaceStore } from '../../state/workspaceStore';
import { CORNER_TOOLS, CornerItem, CornerRow, ZoomAction } from '../../application/workspace/catalog';
import { IconButton } from '../primitives';
import { radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { STAGGER_MS } from '../design/motion';
import { themedStyles } from '../design/theme';

/** Opciones que el motor todavía no implementa: se muestran y lo explican. */

export interface CornerToolsProps {
  onZoom: (action: ZoomAction) => void;
}

export const CornerTools = React.memo(function CornerTools({ onZoom }: CornerToolsProps) {
  const styles = useStyles();
  const { open, snap, grid, theme, scale } = useStore(
    workspaceStore,
    useShallow((s) => ({
      open: s.currentPanel === 'cornerTools',
      snap: s.snap,
      grid: s.grid,
      theme: s.canvasTheme,
      scale: s.scale,
    })),
  );
  const [row, setRow] = useState<CornerRow['id'] | null>(null);
  const ws = workspaceStore.getState;

  const isOn = (it: CornerItem): boolean => {
    switch (it.type) {
      case 'snap':
        return snap[it.id];
      case 'grid':
        return grid[it.id];
      case 'theme':
        return theme === it.id;
      case 'scaleToggle':
        return scale[it.id];
      default:
        return false;
    }
  };

  const press = (it: CornerItem) => {
    switch (it.type) {
      case 'action':
        onZoom(it.action);
        return;
      case 'snap':
        ws().toggleSnap(it.id);
        return;
      case 'grid':
        ws().toggleGrid(it.id);
        return;
      case 'theme':
        ws().setCanvasTheme(it.id);
        return;
      case 'scaleToggle':
        ws().toggleScale(it.id);
        return;
    }
  };

  const rowIndicator = (r: CornerRow) =>
    r.id === 'snap' ? snap.node || snap.angle || snap.vertex || snap.midpoint : r.id === 'grid' ? grid.lines || grid.dots : false;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <View style={styles.rows} pointerEvents="box-none">
          {CORNER_TOOLS.map((r, i) => (
            <Animated.View
              key={r.id}
              entering={ZoomIn.delay(i * STAGGER_MS).springify().damping(15)}
              exiting={FadeOut.duration(80)}
              style={styles.row}
            >
              <IconButton
                icon={r.icon}
                label={r.label}
                size={40}
                on={row === r.id || rowIndicator(r)}
                onPress={() => setRow((cur) => (cur === r.id ? null : r.id))}
                haptic="select"
              />
              {row === r.id ? (
                <Animated.View entering={SlideInLeft.springify().damping(18)} exiting={FadeOut.duration(80)} style={styles.menu}>
                  {r.items.map((it, j) =>
                    it.type === 'scaleInput' ? (
                      <TextInput
                        key={`in-${j}`}
                        style={styles.input}
                        value={scale.denominator ? `1:${scale.denominator}` : ''}
                        placeholder="1:__"
                        keyboardType="number-pad"
                        accessibilityLabel={it.title}
                        onChangeText={(t) => ws().setScaleDenominator(t.replace(/^1:/, ''))}
                      />
                    ) : (
                      <IconButton
                        key={'id' in it ? it.id : it.action}
                        icon={it.icon}
                        label={it.title}
                        size={34}
                        raised={false}
                        on={isOn(it)}
                        onPress={() => press(it)}
                        haptic={it.type === 'action' ? 'tap' : 'select'}
                      />
                    ),
                  )}
                </Animated.View>
              ) : null}
            </Animated.View>
          ))}
        </View>
      ) : null}
      <IconButton
        icon={open ? 'minus' : 'tools'}
        label="Herramientas de lienzo"
        variant="filled"
        size={sizes.fabCorner}
        onPress={() => {
          setRow(null);
          ws().togglePanel('cornerTools');
        }}
        haptic="select"
      />
    </View>
  );
});

const useStyles = themedStyles((colors) => ({
  wrap: { position: 'absolute', left: spacing.lg, bottom: spacing.xl },
  rows: {
    position: 'absolute',
    left: (sizes.fabCorner - 40) / 2,
    bottom: sizes.fabCorner + spacing.md,
    flexDirection: 'column-reverse',
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  menu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    ...type.value,
    width: 64,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    textAlign: 'center',
    color: colors.text,
    paddingVertical: 0,
  },
}));
