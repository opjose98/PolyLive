// =============================================================================
// Minimap — La planta en miniatura, con el muro del alzado y su lado
// Portado de: polylive-mockup/js/components/minimap.js
// =============================================================================
//
// Expandido: los muros del nivel, el activo en el color de su lado (A ámbar,
// B azul) y un triángulo que apunta a la cara que se está viendo. Tocarlo lo
// colapsa a un botón; el botón lo vuelve a abrir.
// =============================================================================

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useStore } from 'zustand';
import type { Point2D } from '../../domain/geometry/types';
import { workspaceStore } from '../../state/workspaceStore';
import { IconButton, Tappable } from '../primitives';
import { elevation, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { ChromeColors, themedStyles, useTheme } from '../design/theme';

/** Color de cada lado del muro: A en el acento del modo, B en el suyo propio. */
export function sideColors(colors: ChromeColors): Record<'A' | 'B', string> {
  return { A: colors.accentText, B: colors.sideB };
}

const W = 104;
const H = 72;
const PAD = 8;

export interface MinimapWall {
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
}

export const Minimap = React.memo(function Minimap({
  walls,
  activeId,
  top,
}: {
  walls: readonly MinimapWall[];
  activeId: string;
  top: number;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const expanded = useStore(workspaceStore, (s) => s.minimapExpanded);
  const side = useStore(workspaceStore, (s) => s.elevationSide);
  const toggle = () => workspaceStore.getState().toggleMinimap();

  const paths = useMemo(() => {
    const pts = walls.flatMap((w) => [w.start, w.end]);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 0.5);
    const k = Math.min((W - PAD * 2) / span, (H - PAD * 2) / span);
    const ox = (W - (Math.max(...xs) - minX) * k) / 2;
    const oy = (H - (Math.max(...ys) - minY) * k) / 2;
    const map = (p: Point2D) => ({ x: ox + (p.x - minX) * k, y: oy + (p.y - minY) * k });

    const others = Skia.Path.Make();
    const active = Skia.Path.Make();
    const marker = Skia.Path.Make();
    for (const w of walls) {
      const a = map(w.start);
      const b = map(w.end);
      const path = w.id === activeId ? active : others;
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      if (w.id !== activeId) continue;
      // Triángulo con el vértice en el muro, la base hacia la cara vista.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const s = side === 'A' ? 1 : -1;
      const nx = -uy * s;
      const ny = ux * s;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      marker.moveTo(mx + nx * 3, my + ny * 3);
      marker.lineTo(mx + nx * 11 - ux * 5, my + ny * 11 - uy * 5);
      marker.lineTo(mx + nx * 11 + ux * 5, my + ny * 11 + uy * 5);
      marker.close();
    }
    return { others, active, marker };
  }, [walls, activeId, side]);

  if (!expanded) {
    return (
      <Animated.View entering={FadeIn.duration(120)} style={[styles.collapsed, { top }]}>
        <IconButton icon="map-outline" label="Mostrar mini-mapa" size={40} onPress={toggle} haptic="select" />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={ZoomIn.springify().damping(18)} exiting={FadeOut.duration(100)} style={[styles.box, { top }]}>
      <Tappable onPress={toggle} pressScale={0.97} accessibilityLabel="Ocultar mini-mapa" haptic="select">
        <Canvas style={styles.canvas}>
          {paths ? (
            <>
              <Path path={paths.others} color={colors.textDisabled} style="stroke" strokeWidth={2.5} strokeCap="round" />
              <Path path={paths.active} color={sideColors(colors)[side]} style="stroke" strokeWidth={4} strokeCap="round" />
              <Path path={paths.marker} color={sideColors(colors)[side]} opacity={0.85} />
            </>
          ) : null}
        </Canvas>
        <View style={styles.sides}>
          {(['A', 'B'] as const).map((s) => (
            <Text key={s} style={[styles.side, { color: sideColors(colors)[s] }, side !== s && styles.sideOff]}>
              {s}
            </Text>
          ))}
        </View>
      </Tappable>
    </Animated.View>
  );
});

const useStyles = themedStyles((colors) => ({
  box: {
    position: 'absolute',
    left: spacing.lg,
    width: W + spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xs,
    alignItems: 'center',
    ...elevation[2],
  },
  collapsed: { position: 'absolute', left: spacing.lg },
  canvas: { width: W, height: H },
  sides: { flexDirection: 'row', justifyContent: 'space-between', width: W - 16, marginTop: -4 },
  side: { ...type.label, fontWeight: '700' },
  sideOff: { opacity: 0.3 },
}));
