// =============================================================================
// ProjectionView — Corte (sección) y alzado desdoblado de una columna
// =============================================================================
//
// Misma pieza que el alzado de un muro (ElevationCanvas: rejilla, niveles,
// rayado de lo cortado), sin edición: es para mirar lo que atraviesa un plano.
// Vive encima de la planta como el alzado; volver la deja como estaba.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { ElevationCanvas } from '../canvas/ElevationCanvas';
import type { ElevationViewport } from '../../application/elevation/WallElevationService';
import type { Projection } from '../../application/section/projection';
import type { ProjectMarker } from '../../domain/objects/marker';
import { workspaceStore } from '../../state/workspaceStore';
import type { ZoomAction } from '../../application/workspace/catalog';
import { CornerTools } from '../workspace/CornerTools';
import { Icon, Tappable } from '../primitives';
import { elevation as shadow, radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useCanvasPalette, useTheme } from '../design/theme';

interface ProjectionViewProps {
  readonly projection: Projection;
  readonly levels: readonly ProjectMarker[];
  readonly width: number;
  readonly height: number;
  readonly chromeTop: number;
  onClose(): void;
}

const MIN_SCALE = 10;
const MAX_SCALE = 1200;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const noop = () => undefined;

export function ProjectionView({ projection: p, levels, width, height, chromeTop, onClose }: ProjectionViewProps) {
  const styles = useStyles();
  const colors = useTheme();
  const palette = useCanvasPalette();
  const grid = useStore(workspaceStore, (s) => s.grid.lines || s.grid.dots);

  const fit = useCallback((): ElevationViewport => {
    const L = Math.max(p.length, 0.1);
    const H = Math.max(p.height, 0.1);
    const padX = 84;
    const padTop = 150;
    const padBottom = 140;
    const scale = clamp(Math.min((width - padX * 2) / L, (height - padTop - padBottom) / H), MIN_SCALE, MAX_SCALE);
    return { scale, offsetX: (width - L * scale) / 2, offsetY: padTop + (height - padTop - padBottom + H * scale) / 2 };
  }, [p, width, height]);
  const [viewport, setViewport] = useState<ElevationViewport>(fit);
  // Otra proyección o la vista cambió de tamaño: se vuelve a encuadrar.
  const [fitKey, setFitKey] = useState(() => fit);
  if (fitKey !== fit) {
    setFitKey(() => fit);
    setViewport(fit());
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const scene = useMemo(
    () => ({
      elevation: {
        wallId: '',
        roomId: '',
        levels: { base: 0, coronacion: p.silhouette ?? 0 },
        openings: [],
        chainModeEnabled: false,
      },
      wallLength: p.length,
      viewport,
      width,
      height,
      selectedOpeningId: null,
      severityByOpening: new Map(),
      showGrid: grid,
      showLabels: true,
      hideWall: p.silhouette === null,
      cuts: p.cuts,
      dividers: p.dividers,
      levelLines: levels.map((m) => ({ name: m.name, y: m.value - p.yBase, cota: m.value })),
      palette,
    }),
    [p, viewport, width, height, grid, levels, palette],
  );

  const onZoom = useCallback(
    (a: ZoomAction) => {
      if (a === 'zoomIn' || a === 'zoomOut') {
        const k = a === 'zoomIn' ? 1.25 : 0.8;
        setViewport((v) => {
          const scale = clamp(v.scale * k, MIN_SCALE, MAX_SCALE);
          const f = scale / v.scale;
          return { scale, offsetX: width / 2 - (width / 2 - v.offsetX) * f, offsetY: height / 2 - (height / 2 - v.offsetY) * f };
        });
      } else setViewport(fit());
    },
    [fit, width, height],
  );

  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(110)} style={StyleSheet.absoluteFill}>
      <ElevationCanvas
        scene={scene}
        onTap={noop}
        onDoubleTap={() => setViewport(fit())}
        onLongPress={noop}
        onDragStart={() => false}
        onDragMove={noop}
        onDragEnd={noop}
        onDragCancel={noop}
        onViewDelta={(s, dx, dy) =>
          setViewport((v) => {
            const scale = clamp(v.scale * s, MIN_SCALE, MAX_SCALE);
            const k = scale / v.scale;
            return { scale, offsetX: dx + v.offsetX * k, offsetY: dy + v.offsetY * k };
          })
        }
      />
      <View style={[styles.header, { top: chromeTop }]} pointerEvents="none">
        <Text style={styles.title}>{p.title}</Text>
        <Text style={styles.detail}>{`${p.length.toFixed(2)} m · ${p.detail}`}</Text>
      </View>
      <CornerTools onZoom={onZoom} />
      <Tappable style={styles.backBtn} onPress={onClose} haptic="select" accessibilityLabel="Volver a la planta">
        <Icon name="arrow-u-left-top" size={20} color={colors.text} />
      </Tappable>
    </Animated.View>
  );
}

const useStyles = themedStyles((colors) => ({
  header: {
    position: 'absolute',
    left: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow[1],
  },
  title: { ...type.bodyStrong, color: colors.text },
  detail: { ...type.caption, color: colors.textSecondary },
  backBtn: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl + (sizes.fabCreate - 44) / 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow[1],
  },
}));
