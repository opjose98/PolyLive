// =============================================================================
// ConstraintSelector — Base y tope del muro o la columna (lateral izquierdo)
// =============================================================================
//
// Selector APARTE del de Niveles de la vista (ese decide qué se ve; este, a qué
// niveles se atan la base y el tope de lo que se crea o se edita). Anatomía:
//
//    [A][B][🔗]  extremo que se edita (muros); ligados = muro rectangular
//        ∞       tope sin restricción: altura desconectada
//        ●T      tope
//        │
//        ■B      base
//       [⚙]      desfases y altura desconectada
//
// Mientras se arrastra solo cambia la vista previa; al soltar se confirma
// (`commit = true`): así editar un muro existente es UN paso de deshacer.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  ConstraintEdit,
  ConstraintEnd,
  ConstraintLevel,
  applyToEdit,
  baseIndex,
  currentExtent,
  infinityIndex,
  moveBase,
  moveTop,
  topIndex,
} from '../../application/workspace/constraintModel';
import { VerticalExtent } from '../../domain/objects/vertical';
import { workspaceStore } from '../../state/workspaceStore';
import { FloatWindow, Icon, IconButton, Tappable } from '../primitives';
import { colors, elevation, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { spring } from '../design/motion';
import { haptic } from '../design/haptics';

export const CONSTRAINT_WINDOW_ID = 'constraintCfg';

export interface ConstraintSelectorProps {
  /** Niveles del proyecto, de menor a mayor cota. */
  readonly levels: readonly ConstraintLevel[];
  readonly edit: ConstraintEdit;
  /** `wall` muestra los extremos A/B; `column` tiene una sola restricción. */
  readonly kind: 'wall' | 'column';
  /** Se pueden editar los extremos por separado (punto a punto, muro existente). */
  readonly canUnlink: boolean;
  /** Rótulo corto sobre el riel ("Muro", "P1", "Col."). */
  readonly caption: string;
  /** Nombre de cada extremo para la ventana de desfases. */
  readonly endNames?: Readonly<Record<ConstraintEnd, string>>;
  readonly onChange: (edit: ConstraintEdit, commit: boolean) => void;
}

const WIDTH = 52;
const THUMB = 22;

export const ConstraintSelector = React.memo(function ConstraintSelector(props: ConstraintSelectorProps) {
  const { levels, edit, kind, canUnlink, caption, onChange } = props;
  const [trackH, setTrackH] = useState(0);
  // Estado vivo durante el arrastre: los gestos leen de aquí, no de props
  // (que solo cambian cuando el padre re-renderiza).
  const live = useRef(edit);
  live.current = edit;

  const slots = infinityIndex(levels) + 1;
  const fractionOf = (idx: number) => (slots <= 1 ? 0 : 1 - idx / (slots - 1));
  const indexOf = (f: number) => Math.round((1 - Math.max(0, Math.min(1, f))) * (slots - 1));

  const showEnds = kind === 'wall' && canUnlink;
  const ext = currentExtent(edit);

  const setEnd = (end: ConstraintEnd) => {
    haptic.select();
    onChange({ ...live.current, editing: end }, false);
  };
  const toggleLink = () => {
    haptic.select();
    const cur = live.current;
    // Al ligar, el extremo que se ve manda sobre el otro.
    const next = cur.linked ? { ...cur, linked: false } : applyToEdit({ ...cur, linked: true }, currentExtent(cur));
    onChange(next, !cur.linked);
  };

  return (
    <>
      <Animated.View entering={ZoomIn.springify().damping(18).stiffness(260)} exiting={FadeOut.duration(100)} style={styles.panel}>
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
        {showEnds ? (
          <View style={styles.ends}>
            {(['a', 'b'] as const).map((end) => (
              <Tappable
                key={end}
                onPress={() => setEnd(end)}
                style={[styles.end, !edit.linked && edit.editing === end && styles.endOn, edit.linked && styles.endLinked]}
                accessibilityLabel={`Editar extremo ${end.toUpperCase()}`}
                accessibilityState={{ selected: edit.editing === end }}
              >
                <Text style={[styles.endText, !edit.linked && edit.editing === end && styles.endTextOn]}>{end.toUpperCase()}</Text>
              </Tappable>
            ))}
            <Tappable
              onPress={toggleLink}
              style={[styles.end, edit.linked && styles.endOn]}
              accessibilityLabel={edit.linked ? 'Separar extremos' : 'Ligar extremos'}
            >
              <Icon name={edit.linked ? 'link-variant' : 'link-variant-off'} size={14} color={edit.linked ? colors.textOnAccent : colors.textSecondary} />
            </Tappable>
          </View>
        ) : null}

        <Text style={styles.inf}>∞</Text>
        <View style={styles.track} onLayout={(e) => setTrackH(e.nativeEvent.layout.height)}>
          <View style={styles.rail} />
          {trackH > 0 &&
            levels.map((l, i) => <View key={l.id} style={[styles.tick, { top: fractionOf(i) * trackH - 1 }]} />)}
          {trackH > 0 ? (
            <>
              <RailSpan from={fractionOf(topIndex(levels, ext)) * trackH} to={fractionOf(baseIndex(levels, ext)) * trackH} />
              <Thumb
                which="top"
                levels={levels}
                live={live}
                trackH={trackH}
                y={fractionOf(topIndex(levels, ext)) * trackH}
                indexOf={indexOf}
                fractionOf={fractionOf}
                onChange={onChange}
              />
              <Thumb
                which="base"
                levels={levels}
                live={live}
                trackH={trackH}
                y={fractionOf(baseIndex(levels, ext)) * trackH}
                indexOf={indexOf}
                fractionOf={fractionOf}
                onChange={onChange}
              />
            </>
          ) : null}
        </View>

        <IconButton
          icon="cog-outline"
          label="Desfases y altura"
          size={32}
          raised={false}
          onPress={() => workspaceStore.getState().toggleWindow({ id: CONSTRAINT_WINDOW_ID })}
          haptic="select"
        />
      </Animated.View>
      <OffsetsWindow {...props} />
    </>
  );
});

/** Tramo del riel ocupado por el elemento, entre base y tope. */
function RailSpan({ from, to }: { from: number; to: number }) {
  const top = useSharedValue(from);
  const bottom = useSharedValue(to);
  useEffect(() => {
    top.value = withSpring(from, spring.snappy);
    bottom.value = withSpring(to, spring.snappy);
  }, [from, to, top, bottom]);
  const style = useAnimatedStyle(() => ({ top: top.value, height: Math.max(0, bottom.value - top.value) }));
  return <Animated.View style={[styles.span, style]} />;
}

function Thumb({
  which,
  levels,
  live,
  trackH,
  y: targetY,
  indexOf,
  fractionOf,
  onChange,
}: {
  which: 'base' | 'top';
  levels: readonly ConstraintLevel[];
  live: React.MutableRefObject<ConstraintEdit>;
  trackH: number;
  y: number;
  indexOf: (f: number) => number;
  fractionOf: (idx: number) => number;
  onChange: (edit: ConstraintEdit, commit: boolean) => void;
}) {
  const y = useSharedValue(targetY);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    y.value = withSpring(targetY, spring.snappy);
  }, [targetY, y]);

  const idxOf = (e: VerticalExtent) => (which === 'base' ? baseIndex(levels, e) : topIndex(levels, e));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {
      startY.current = fractionOf(idxOf(currentExtent(live.current))) * trackH;
      moved.current = false;
      setDragging(true);
      haptic.grab();
    })
    .onChange((e) => {
      const cur = currentExtent(live.current);
      const want = indexOf((startY.current + e.translationY) / trackH);
      const next = which === 'base' ? moveBase(levels, cur, want) : moveTop(levels, cur, want);
      if (next.baseLevelId !== cur.baseLevelId || next.topLevelId !== cur.topLevelId) {
        haptic.snap();
        moved.current = true;
        const edit = applyToEdit(live.current, next);
        live.current = edit;
        onChange(edit, false);
      }
    })
    .onFinalize(() => {
      setDragging(false);
      if (moved.current) {
        haptic.commit();
        onChange(live.current, true);
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - THUMB / 2 }] }));
  const ext = currentExtent(live.current);
  const i = idxOf(ext);
  const label =
    which === 'top' && i >= infinityIndex(levels)
      ? `T · ∞ ${Number(ext.unconnectedHeight.toFixed(2))} m`
      : `${which === 'base' ? 'B' : 'T'} · ${levels[i]?.name ?? '?'}`;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.thumbWrap, style]} hitSlop={12}>
        <View
          style={[which === 'base' ? styles.thumbBase : styles.thumbTop, dragging && styles.thumbDrag]}
          accessibilityRole="adjustable"
          accessibilityLabel={which === 'base' ? `Base: ${label}` : `Tope: ${label}`}
        >
          <Text style={[styles.thumbLetter, which === 'top' && styles.thumbLetterTop]}>{which === 'base' ? 'B' : 'T'}</Text>
        </View>
        <Animated.View entering={FadeIn.duration(100)} style={[styles.tip, dragging && styles.tipDrag]}>
          <Text style={styles.tipText} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Ventana de desfases (⚙)
// ---------------------------------------------------------------------------

function OffsetsWindow({ levels, edit, kind, endNames, onChange }: ConstraintSelectorProps) {
  const ends: ConstraintEnd[] = kind === 'wall' && !edit.linked ? ['a', 'b'] : ['a'];
  const set = (end: ConstraintEnd, patch: Partial<VerticalExtent>) => {
    const target = { ...edit, editing: end };
    onChange(applyToEdit(target, { ...currentExtent(target), ...patch }), true);
  };
  return (
    <FloatWindow id={CONSTRAINT_WINDOW_ID} title={kind === 'wall' ? 'Restricciones del muro' : 'Restricciones de la columna'} style={styles.cfgWindow}>
      {ends.map((end) => {
        const e = end === 'a' ? edit.a : edit.b;
        const unconnected = topIndex(levels, e) >= infinityIndex(levels);
        return (
          <View key={end} style={styles.cfgBlock}>
            {ends.length > 1 ? <Text style={styles.cfgEnd}>{endNames?.[end] ?? end.toUpperCase()}</Text> : null}
            <NumberRow label="Desfase de base" value={e.baseOffset} onCommit={(v) => set(end, { baseOffset: v })} />
            {unconnected ? (
              <NumberRow
                label="Altura desconectada"
                value={e.unconnectedHeight}
                min={0.1}
                onCommit={(v) => set(end, { unconnectedHeight: v })}
              />
            ) : (
              <NumberRow label="Desfase de tope" value={e.topOffset} onCommit={(v) => set(end, { topOffset: v })} />
            )}
          </View>
        );
      })}
      <Text style={styles.cfgHint}>Metros. Como en Revit: el desfase se suma a la cota del nivel.</Text>
    </FloatWindow>
  );
}

function NumberRow({ label, value, min, onCommit }: { label: string; value: number; min?: number; onCommit: (v: number) => void }) {
  return (
    <View style={styles.cfgRow}>
      <Text style={styles.cfgLabel}>{label}</Text>
      <TextInput
        key={value}
        style={styles.cfgInput}
        defaultValue={String(Number(value.toFixed(3)))}
        keyboardType="numbers-and-punctuation"
        selectTextOnFocus
        onEndEditing={(e) => {
          const v = parseFloat(e.nativeEvent.text.replace(',', '.'));
          if (!Number.isFinite(v) || v === value || (min !== undefined && v < min)) return;
          onCommit(v);
        }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    height: 300,
    width: WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.amber,
    ...elevation[2],
  },
  caption: { ...type.caption, color: colors.amberDark, maxWidth: WIDTH - 6 },
  ends: { gap: 3, marginTop: 2 },
  end: {
    width: 30,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  endLinked: { opacity: 0.45 },
  endText: { ...type.label, color: colors.textSecondary },
  endTextOn: { color: colors.textOnAccent },
  inf: { ...type.bodyStrong, color: colors.textSecondary, marginTop: 2, marginBottom: THUMB / 2 },
  track: { flex: 1, width: '100%', alignItems: 'center', marginBottom: THUMB / 2 },
  rail: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: colors.border },
  span: { position: 'absolute', width: 6, borderRadius: 3, backgroundColor: colors.amber },
  tick: { position: 'absolute', width: 14, height: 2, borderRadius: 1, backgroundColor: colors.textDisabled },
  thumbWrap: { position: 'absolute', top: 0, left: (WIDTH - THUMB) / 2, flexDirection: 'row', alignItems: 'center' },
  thumbBase: {
    width: THUMB,
    height: THUMB,
    borderRadius: 5,
    backgroundColor: colors.amberDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbTop: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: { fontSize: 10, fontWeight: '700', color: colors.textOnAccent },
  thumbLetterTop: { color: colors.amberDark },
  thumbDrag: { transform: [{ scale: 1.25 }] },
  tip: {
    position: 'absolute',
    left: THUMB + spacing.md,
    backgroundColor: colors.tooltip,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: 190,
  },
  tipDrag: { backgroundColor: colors.amberDark },
  tipText: { ...type.caption, color: colors.textOnAccent },
  cfgWindow: { left: spacing.lg + WIDTH + spacing.md, bottom: 96, width: 250 },
  cfgBlock: { gap: spacing.xs, marginBottom: spacing.sm },
  cfgEnd: { ...type.label, color: colors.amberDark },
  cfgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cfgLabel: { ...type.body, color: colors.text, flex: 1 },
  cfgInput: {
    ...type.body,
    width: 72,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    color: colors.text,
    textAlign: 'right',
  },
  cfgHint: { ...type.caption, color: colors.textSecondary },
});
