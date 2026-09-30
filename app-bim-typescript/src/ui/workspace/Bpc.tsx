// =============================================================================
// Bpc — Barra de Propiedades Contextual (arriba del lienzo)
// Portado de: polylive-mockup/js/components/bpc.js
// =============================================================================
//
// Contexto con prioridad herramienta > selección > lienzo (`resolveBpcContext`).
// Las propiedades numéricas se editan arrastrando la píldora a izquierda o
// derecha: sin teclado, con guantes, sin tapar el plano. Cada paso vibra; el
// valor se entrega al soltar.
// =============================================================================

import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { BpcContext } from '../../application/workspace/bpcContext';
import { PROPS, PropKey } from '../../application/workspace/catalog';
import { nudgeProp, valueFromDrag } from '../../application/workspace/propDrag';
import { Icon, Tappable } from '../primitives';
import { colors, elevation, radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { haptic } from '../design/haptics';

export interface BpcPill {
  readonly key: PropKey;
  readonly value: number;
  readonly onCommit: (value: number) => void;
}

export interface BpcAction {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface BpcProps {
  context: BpcContext;
  pills: readonly BpcPill[];
  actions?: readonly BpcAction[];
  onExitTool?: () => void;
  /** Dato extra de la herramienta (p. ej. restricción de altura del nivel). */
  toolDetail?: string;
  top: number;
  right: number;
}

export const Bpc = React.memo(function Bpc({ context, pills, actions = [], onExitTool, toolDetail, top, right }: BpcProps) {
  const key = context.kind === 'tool' ? `t-${context.tool.toolId}` : context.kind === 'selection' ? 's' : 'c';
  return (
    <Animated.View style={[styles.bar, { top, right }]} layout={LinearTransition.springify().damping(22)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Animated.View key={key} entering={FadeIn.duration(160)} exiting={FadeOut.duration(80)} style={styles.segs}>
          {context.kind === 'tool' ? (
            <>
              <Text style={styles.strong}>{context.tool.label}</Text>
              <Text style={styles.muted}>{context.tool.methodLabel ?? context.tool.categoryLabel}</Text>
              {toolDetail ? <Text style={styles.value}>{toolDetail}</Text> : null}
            </>
          ) : context.kind === 'selection' ? (
            <>
              <Text style={styles.strong}>{context.selection.typeLabel}</Text>
              {context.selection.detail ? <Text style={styles.muted}>{context.selection.detail}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.strong}>{context.title ?? 'Lienzo'}</Text>
              {context.items?.map((it) => (
                <Text key={it} style={styles.muted}>
                  {it}
                </Text>
              ))}
              <Text style={styles.muted}>{context.viewLabel}</Text>
              <Text style={styles.muted}>
                Escala <Text style={styles.value}>{context.scaleLabel}</Text>
              </Text>
              <Text style={styles.muted}>
                Zoom <Text style={styles.value}>{context.zoomLabel}</Text>
              </Text>
            </>
          )}
          {pills.map((p) => (
            <DragPill key={p.key} pill={p} />
          ))}
          {actions.map((a) => (
            <Tappable key={a.label} onPress={a.onPress} style={styles.action} accessibilityLabel={a.label} haptic="tap">
              <Icon name={a.icon} size={16} color={colors.amberDark} />
              <Text style={styles.actionText}>{a.label}</Text>
            </Tappable>
          ))}
        </Animated.View>
      </ScrollView>
      {context.kind === 'tool' && onExitTool ? (
        <Tappable onPress={onExitTool} style={styles.exit} accessibilityLabel="Soltar herramienta" haptic="select" hitSlop={8}>
          <Icon name="close" size={18} color={colors.textSecondary} />
        </Tappable>
      ) : null}
    </Animated.View>
  );
});

/** Píldora ↔: arrastrar horizontalmente cambia el valor paso a paso. */
function DragPill({ pill }: { pill: BpcPill }) {
  const def = PROPS[pill.key];
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState(pill.value);
  const start = useRef(pill.value);
  const shown = dragging ? live : pill.value;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart(() => {
      start.current = pill.value;
      setLive(pill.value);
      setDragging(true);
      haptic.grab();
    })
    .onChange((e) => {
      const next = valueFromDrag(def, start.current, e.translationX);
      setLive((prev) => {
        if (prev !== next) haptic.select();
        return next;
      });
    })
    .onEnd((e) => {
      const next = valueFromDrag(def, start.current, e.translationX);
      setDragging(false);
      if (next !== pill.value) pill.onCommit(next);
    })
    .onFinalize(() => setDragging(false));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.pill, dragging && styles.pillActive]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={def.label}
        accessibilityValue={{ min: def.min, max: def.max, now: shown, text: `${shown} ${def.unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => pill.onCommit(nudgeProp(def, pill.value, e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      >
        <Icon name="arrow-left-right" size={14} color={colors.amber} />
        <Text style={styles.pillLabel}>{def.label}</Text>
        <Text style={styles.value}>
          {shown} {def.unit}
        </Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.md,
    height: sizes.bpcHeight,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...elevation[2],
  },
  content: { alignItems: 'center', paddingHorizontal: spacing.md },
  segs: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  strong: { ...type.bodyStrong, color: colors.text },
  muted: { ...type.label, color: colors.textSecondary },
  value: { ...type.value, color: colors.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    height: 30,
  },
  pillActive: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
  pillLabel: { ...type.label, color: colors.textSecondary },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: spacing.xs },
  actionText: { ...type.label, color: colors.amberDark },
  exit: { paddingHorizontal: spacing.sm, height: '100%', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
});
