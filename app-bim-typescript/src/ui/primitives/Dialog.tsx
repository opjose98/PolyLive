// =============================================================================
// Dialog — Diálogos propios (reemplazan a Alert.alert)
// =============================================================================
//
// `alertDialog(title, message, buttons)` tiene la MISMA firma que
// `Alert.alert`, así que migrar una pantalla es cambiar el nombre de la
// función. `confirm()` es la forma cómoda de preguntar sí/no con un await.
// `DialogHost` se monta una vez en la raíz.
//
// Por qué no el nativo: el de Android es gris, con otra tipografía y sin
// háptica; sacaba al usuario del lenguaje visual de la app en justo el momento
// en que tiene que leer con atención (borrar, restaurar una copia...).
// =============================================================================

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { Tappable } from './Tappable';
import { elevation, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { haptic } from '../design/haptics';
import { themedStyles } from '../design/theme';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogItem {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
}

const dialogStore = createStore<{ queue: DialogItem[] }>(() => ({ queue: [] }));
let nextId = 1;

/** Misma firma que `Alert.alert`. Sin botones, uno "Aceptar". */
export function alertDialog(title: string, message?: string, buttons?: DialogButton[]): void {
  const item: DialogItem = { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'Aceptar' }] };
  if (item.buttons.some((b) => b.style === 'destructive')) haptic.warning();
  dialogStore.setState((s) => ({ queue: [...s.queue, item] }));
}

/** Pregunta sí/no. Resuelve `true` si se confirma. */
export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) =>
    alertDialog(opts.title, opts.message, [
      { text: opts.cancelLabel ?? 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmLabel ?? 'Aceptar', style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

function close(id: number) {
  dialogStore.setState((s) => ({ queue: s.queue.filter((d) => d.id !== id) }));
}

export function DialogHost() {
  const styles = useStyles();
  const current = useStore(dialogStore, (s) => s.queue[0]);
  if (!current) return null;

  const press = (b: DialogButton) => {
    close(current.id);
    b.onPress?.();
  };
  // Atrás / tocar fuera = el botón de cancelar, si lo hay (como Alert en Android).
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const dismiss = () => {
    if (cancel) press(cancel);
    else if (current.buttons.length === 1) press(current.buttons[0]);
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Cerrar diálogo" />
        <Animated.View key={current.id} entering={ZoomIn.springify().damping(18).stiffness(280)} style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={[styles.actions, current.buttons.length > 2 && styles.actionsColumn]}>
            {current.buttons.map((b) => (
              <Tappable
                key={b.text}
                onPress={() => press(b)}
                haptic={b.style === 'destructive' ? 'destroy' : 'tap'}
                style={[styles.btn, b.style !== 'cancel' && b.style !== 'destructive' && styles.btnPrimary, b.style === 'destructive' && styles.btnDanger]}
                accessibilityRole="button"
                accessibilityLabel={b.text}
              >
                <Text
                  style={[
                    styles.btnText,
                    b.style === 'cancel' && styles.btnTextCancel,
                    (b.style === undefined || b.style === 'default' || b.style === 'destructive') && styles.btnTextOn,
                  ]}
                >
                  {b.text}
                </Text>
              </Tappable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const useStyles = themedStyles((colors) => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...elevation[3],
  },
  title: { ...type.title, color: colors.text },
  message: { ...type.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  actionsColumn: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnDanger: { backgroundColor: colors.error },
  btnText: { ...type.bodyStrong, color: colors.text },
  btnTextCancel: { color: colors.textSecondary },
  btnTextOn: { color: colors.textOnAccent },
}));
