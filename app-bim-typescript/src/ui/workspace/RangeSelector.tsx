// =============================================================================
// RangeSelector — Selectores de Nivel y Fase (lateral izquierdo)
// Portado de: polylive-mockup/js/components/range-selector.js
// =============================================================================
//
// Un mismo componente para Niveles (cota, m) y Fases (orden). Anatomía:
//   [S][N][I]  habilitan el arrastre de cada deslizador
//      ∞       extremo superior
//      │● S    superior: tope de altura y techo de lo visible
//      │● N    nivel activo: donde nace lo que se crea (siempre ámbar)
//      │● I    inferior: piso de lo visible
//      ∞
//     [⚙]      configuración (la lista editable), sin cerrar el panel
//     [←]      cierra y vuelve a mostrar los FABs
// Restricción: inferior < nivel < superior. Cada salto de elemento vibra.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { PanelKey, RangeKey, workspaceStore } from '../../state/workspaceStore';
import {
  RANGE_SLOTS,
  RangeSlot,
  RangeState,
  constrainIndex,
  editableItems,
  indexFromTrackFraction,
  itemAt,
  trackFractionOf,
} from '../../application/workspace/rangeModel';
import { FloatWindow, Icon, IconButton, Tappable, toast } from '../primitives';
import { elevation, radius, sizes, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { spring } from '../design/motion';
import { haptic } from '../design/haptics';
import { themedStyles, useTheme } from '../design/theme';

export interface RangeEditHandlers {
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** Devuelve un motivo si el valor no se aceptó. */
  onSetValue: (id: string, value: number) => Promise<'duplicate' | 'base' | 'invalid' | null>;
}

interface Config {
  key: RangeKey;
  title: string;
  icon: string;
  unit: string;
  valueLabel: string;
}

const CONFIGS: Readonly<Record<RangeKey, Config>> = {
  levels: { key: 'levels', title: 'Niveles', icon: 'layers-triple-outline', unit: ' m', valueLabel: 'Cota' },
  phases: { key: 'phases', title: 'Fases', icon: 'timeline-clock-outline', unit: '', valueLabel: 'Orden' },
};

const LETTER: Readonly<Record<RangeSlot, string>> = { superior: 'S', nivel: 'N', inferior: 'I' };
const THUMB = 22;

const fmt = (v: number, unit: string) => `${v > 0 ? '+' : ''}${Number(v.toFixed(2))}${unit}`;

// ---------------------------------------------------------------------------
// Grupo: dos FABs + los dos paneles
// ---------------------------------------------------------------------------

export const RangeSelectors = React.memo(function RangeSelectors({
  levels,
  phases,
  extra,
  only,
}: {
  levels: RangeEditHandlers;
  phases: RangeEditHandlers;
  /** Solo uno de los selectores (en alzado los niveles son líneas, no selector). */
  only?: RangeKey;
  /** Se muestra bajo los FABs mientras ningún selector está abierto (base/tope del elemento). */
  extra?: React.ReactNode;
}) {
  const styles = useStyles();
  const panel = useStore(workspaceStore, (s) => s.currentPanel);
  const open: RangeKey | null = panel === 'range:levels' ? 'levels' : panel === 'range:phases' ? 'phases' : null;
  const ws = workspaceStore.getState;

  return (
    <>
    <View style={styles.side} pointerEvents="box-none">
      {open ? (
        <RangePanel key={open} cfg={CONFIGS[open]} handlers={open === 'levels' ? levels : phases} />
      ) : (
        <Animated.View entering={FadeIn.duration(140)} style={styles.fabs}>
          {(only ? [only] : (['levels', 'phases'] as const)).map((k) => (
            <IconButton
              key={k}
              icon={CONFIGS[k].icon}
              label={CONFIGS[k].title}
              size={sizes.fabRange}
              onPress={() => ws().openPanel(`range:${k}` as PanelKey)}
              haptic="select"
            />
          ))}
          {extra}
        </Animated.View>
      )}
    </View>
    {/* Fuera de la columna lateral: se posicionan respecto del lienzo. */}
    {only !== 'phases' ? <ConfigWindow cfg={CONFIGS.levels} handlers={levels} /> : null}
    {only !== 'levels' ? <ConfigWindow cfg={CONFIGS.phases} handlers={phases} /> : null}
    </>
  );
});

// ---------------------------------------------------------------------------
// Panel con el riel y los tres deslizadores
// ---------------------------------------------------------------------------

function RangePanel({ cfg }: { cfg: Config; handlers: RangeEditHandlers }) {
  const styles = useStyles();
  const state = useStore(workspaceStore, (s) => s[cfg.key]);
  const ws = workspaceStore.getState;
  const [trackH, setTrackH] = useState(0);

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)} style={styles.panel}>
      <View style={styles.letters}>
        {RANGE_SLOTS.map((slot) => (
          <Tappable
            key={slot}
            onPress={() => ws().toggleRangeSlot(cfg.key, slot)}
            haptic="select"
            style={[styles.letter, state.active[slot] && styles.letterOn]}
            accessibilityLabel={`Mover ${slot}`}
            accessibilityState={{ checked: state.active[slot] }}
          >
            <Text style={[styles.letterText, state.active[slot] && styles.letterTextOn]}>{LETTER[slot]}</Text>
          </Tappable>
        ))}
      </View>

      <Text style={styles.inf}>∞</Text>
      <View style={styles.track} onLayout={(e) => setTrackH(e.nativeEvent.layout.height)}>
        <View style={styles.rail} />
        {trackH > 0 &&
          state.items.map((it, i) => (
            <View key={it.id} style={[styles.tick, { top: trackFractionOf(state, i) * trackH - 1 }]} />
          ))}
        {trackH > 0 &&
          RANGE_SLOTS.map((slot) => (
            <Thumb key={slot} cfg={cfg} slot={slot} state={state} trackH={trackH} />
          ))}
      </View>
      <Text style={styles.inf}>∞</Text>

      <View style={styles.actions}>
        <IconButton
          icon="cog-outline"
          label={`Configurar ${cfg.title}`}
          size={34}
          raised={false}
          onPress={() => ws().toggleWindow({ id: `${cfg.key}Cfg`, owner: `range:${cfg.key}` as PanelKey })}
          haptic="select"
        />
        <IconButton icon="arrow-left" label="Cerrar selector" variant="filled" size={34} onPress={() => ws().closePanels()} />
      </View>
    </Animated.View>
  );
}

function Thumb({ cfg, slot, state, trackH }: { cfg: Config; slot: RangeSlot; state: RangeState; trackH: number }) {
  const styles = useStyles();
  const idx = state.pos[slot];
  const item = itemAt(state, slot);
  const enabled = state.active[slot];
  const y = useSharedValue(trackFractionOf(state, idx) * trackH);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const lastIdx = useRef(idx);

  useEffect(() => {
    y.value = withSpring(trackFractionOf(state, idx) * trackH, spring.snappy);
    lastIdx.current = idx;
  }, [idx, trackH, state, y]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(enabled)
    .onStart(() => {
      startY.current = trackFractionOf(workspaceStore.getState()[cfg.key], workspaceStore.getState()[cfg.key].pos[slot]) * trackH;
      setDragging(true);
      haptic.grab();
    })
    .onChange((e) => {
      const st = workspaceStore.getState()[cfg.key];
      const want = indexFromTrackFraction(st, (startY.current + e.translationY) / trackH);
      const next = constrainIndex(st, slot, want);
      if (next !== lastIdx.current) {
        haptic.snap();
        lastIdx.current = next;
        workspaceStore.getState().moveRangeThumb(cfg.key, slot, next);
      }
    })
    .onFinalize(() => setDragging(false));

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .enabled(slot === 'nivel')
    .onEnd((_e, ok) => {
      if (!ok) return;
      const st = workspaceStore.getState()[cfg.key];
      const base = st.items.findIndex((it) => it.base);
      if (base >= 0) {
        haptic.select();
        workspaceStore.getState().moveRangeThumb(cfg.key, 'nivel', base);
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value - THUMB / 2 }] }));
  const isNivel = slot === 'nivel';
  const label = Number.isFinite(item.value) ? `${item.name} (${fmt(item.value, cfg.unit)})` : item.name;

  return (
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, pan)}>
      <Animated.View style={[styles.thumbWrap, style]} hitSlop={10}>
        <View
          style={[styles.thumb, isNivel && styles.thumbNivel, !isNivel && !enabled && styles.thumbDim, dragging && styles.thumbDrag]}
          accessibilityRole="adjustable"
          accessibilityLabel={`${cfg.title} ${slot}: ${label}`}
        />
        {dragging || isNivel ? (
          <Animated.View entering={FadeIn.duration(100)} style={[styles.tip, dragging && styles.tipDrag]}>
            <Text style={styles.tipText} numberOfLines={1}>
              {label}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Ventana de configuración: lista editable (mayor arriba)
// ---------------------------------------------------------------------------

function ConfigWindow({ cfg, handlers }: { cfg: Config; handlers: RangeEditHandlers }) {
  const styles = useStyles();
  const colors = useTheme();
  const items = useStore(workspaceStore, useShallow((s) => editableItems(s[cfg.key])));
  return (
    <FloatWindow id={`${cfg.key}Cfg`} title={cfg.title} style={styles.cfgWindow}>
      <View style={styles.cfgHead}>
        <Text style={styles.cfgHeadText}>Nombre</Text>
        <Text style={[styles.cfgHeadText, styles.cfgValueCol]}>{cfg.valueLabel}</Text>
        <View style={styles.cfgDel} />
      </View>
      {items.map((it) => (
        <View key={it.id} style={styles.cfgRow}>
          <TextInput
            style={[styles.cfgInput, styles.cfgName]}
            defaultValue={it.name}
            onEndEditing={(e) => {
              const v = e.nativeEvent.text.trim();
              if (v && v !== it.name) handlers.onRename(it.id, v);
            }}
            accessibilityLabel={`Nombre de ${it.name}`}
          />
          <TextInput
            style={[styles.cfgInput, styles.cfgValueCol, it.base && styles.cfgDisabled]}
            defaultValue={String(it.value)}
            editable={!it.base}
            keyboardType="numbers-and-punctuation"
            onEndEditing={async (e) => {
              const v = parseFloat(e.nativeEvent.text.replace(',', '.'));
              if (v === it.value) return;
              const reason = await handlers.onSetValue(it.id, v);
              if (reason === 'duplicate') toast(`Ya existe un elemento con ${cfg.valueLabel.toLowerCase()} ${v}`, { kind: 'warning' });
              else if (reason === 'invalid') toast('Valor no válido', { kind: 'warning' });
            }}
            accessibilityLabel={`${cfg.valueLabel} de ${it.name}`}
          />
          {it.base ? (
            <View style={styles.cfgDel} />
          ) : (
            <Tappable style={styles.cfgDel} onPress={() => handlers.onRemove(it.id)} haptic="destroy" accessibilityLabel={`Eliminar ${it.name}`}>
              <Icon name="close" size={16} color={colors.error} />
            </Tappable>
          )}
        </View>
      ))}
      <Tappable style={styles.cfgAdd} onPress={handlers.onAdd} accessibilityLabel={`Agregar a ${cfg.title}`}>
        <Icon name="plus" size={16} color={colors.accentText} />
        <Text style={styles.cfgAddText}>Agregar</Text>
      </Tappable>
    </FloatWindow>
  );
}

const useStyles = themedStyles((colors) => ({
  side: { position: 'absolute', left: spacing.lg, top: 0, bottom: 0, justifyContent: 'center' },
  fabs: { gap: spacing.md, alignItems: 'flex-start' },
  panel: {
    height: '62%',
    minHeight: 280,
    width: sizes.rangePanelWidth,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    ...elevation[2],
  },
  letters: { gap: 4 },
  letter: {
    width: 28,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  letterText: { ...type.label, color: colors.textSecondary },
  letterTextOn: { color: colors.textOnAccent },
  inf: { ...type.bodyStrong, color: colors.textSecondary, marginVertical: THUMB / 2 },
  track: { flex: 1, width: '100%', alignItems: 'center' },
  rail: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: colors.border },
  tick: { position: 'absolute', width: 12, height: 2, borderRadius: 1, backgroundColor: colors.textDisabled },
  thumbWrap: { position: 'absolute', top: 0, left: (sizes.rangePanelWidth - THUMB) / 2, flexDirection: 'row', alignItems: 'center' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.textSecondary,
  },
  thumbNivel: { borderColor: colors.accent, backgroundColor: colors.accent },
  thumbDim: { opacity: 0.45 },
  thumbDrag: { transform: [{ scale: 1.2 }] },
  tip: {
    position: 'absolute',
    left: THUMB + spacing.md,
    backgroundColor: colors.tooltip,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: 200,
  },
  tipDrag: { backgroundColor: colors.accentText },
  tipText: { ...type.caption, color: colors.textOnAccent },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
  cfgWindow: { right: spacing.lg, bottom: 96, width: 260 },
  cfgHead: { flexDirection: 'row', gap: spacing.sm },
  cfgHeadText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  cfgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cfgInput: {
    ...type.body,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    color: colors.text,
  },
  cfgName: { flex: 1 },
  cfgValueCol: { width: 64, flex: 0 },
  cfgDisabled: { backgroundColor: colors.background, color: colors.textSecondary },
  cfgDel: { width: 24, alignItems: 'center' },
  cfgAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  cfgAddText: { ...type.label, color: colors.accentText },
}));
