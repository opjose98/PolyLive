// =============================================================================
// CommitTextInput — TextInput que SIEMPRE confirma lo tecleado
// =============================================================================
//
// En Android, cerrar el teclado con Atrás no quita el foco del campo, así que
// ni `onBlur` ni `onEndEditing` se disparan; y si después se cierra la hoja o
// la ventana, el campo se desmonta sin avisar. El resultado era que lo
// tecleado se perdía en silencio (la cota de un nivel quedaba en el valor
// anterior). Este campo confirma en tres casos:
//
//   1. al perder el foco (blur) o pulsar "hecho";
//   2. al ocultarse el teclado mientras el campo tiene el foco;
//   3. al desmontarse con un texto sin confirmar.
//
// `onCommitText` recibe el texto tal cual; cada llamador decide cómo validarlo.
// Solo se llama si el texto cambió desde la última confirmación.
// =============================================================================

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Keyboard, TextInput, TextInputProps } from 'react-native';

/**
 * Qué texto falta confirmar. Un `value` que llega de fuera (deshacer, otro objeto) es el nuevo
 * punto de partida; pero si coincide con lo tecleado es el eco de un campo que se controla con
 * su propio borrador (TextField en modo `blur`): tomarlo como "de fuera" daba por confirmado lo
 * tecleado y nunca se guardaba (H-65).
 */
export function commitTracker(initial: string) {
  let current = initial;
  let committed = initial;
  return {
    typed(t: string): void {
      current = t;
    },
    external(v: string): void {
      if (v === current) return;
      current = v;
      committed = v;
    },
    /** Devuelve el texto a confirmar, o `null` si no cambió desde la última confirmación. */
    take(): string | null {
      if (current === committed) return null;
      committed = current;
      return current;
    },
  };
}

interface CommitTextInputProps extends Omit<TextInputProps, 'onEndEditing' | 'onSubmitEditing'> {
  /** Texto confirmado (blur, "hecho", teclado oculto o desmontaje). */
  onCommitText: (text: string) => void;
}

export const CommitTextInput = forwardRef<TextInput, CommitTextInputProps>(function CommitTextInput(
  { onCommitText, onChangeText, onBlur, value, defaultValue, ...rest },
  ref,
) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);

  // Último texto visto y último confirmado (en una ref: no re-renderiza y el
  // desmontaje lo lee aunque el componente ya no exista).
  const tracker = useRef(commitTracker(value ?? defaultValue ?? '')).current;
  const commitRef = useRef(onCommitText);
  commitRef.current = onCommitText;

  useEffect(() => {
    if (value !== undefined) tracker.external(value);
  }, [value, tracker]);

  const commit = () => {
    const t = tracker.take();
    if (t !== null) commitRef.current(t);
  };
  const commitRefFn = useRef(commit);
  commitRefFn.current = commit;

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (input.current?.isFocused()) input.current.blur(); // dispara onBlur → commit
    });
    return () => {
      sub.remove();
      commitRefFn.current(); // desmontado con texto pendiente
    };
  }, []);

  return (
    <TextInput
      ref={input}
      value={value}
      defaultValue={defaultValue}
      onChangeText={(t) => {
        tracker.typed(t);
        onChangeText?.(t);
      }}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onSubmitEditing={commit}
      {...rest}
    />
  );
});
