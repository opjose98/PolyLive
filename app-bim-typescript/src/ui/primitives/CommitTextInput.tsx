// =============================================================================
// CommitTextInput — TextInput que SIEMPRE confirma lo tecleado
// =============================================================================
//
// En Android, cerrar el teclado con Atrás no quita el foco del campo, así que
// ni `onBlur` ni `onEndEditing` se disparan; y si después se cierra la hoja o
// la ventana, el campo se desmonta sin avisar. El resultado era que lo
// tecleado se perdía en silencio (la cota de un nivel quedaba en el valor
// anterior). Este campo confirma en cuatro casos:
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

  // Último texto visto y último confirmado (refs: no re-renderizan y el
  // desmontaje los lee aunque el componente ya no exista).
  const current = useRef(value ?? defaultValue ?? '');
  const committed = useRef(current.current);
  const commitRef = useRef(onCommitText);
  commitRef.current = onCommitText;

  // Un valor que llega desde fuera (deshacer, otro objeto) es el nuevo punto de partida.
  useEffect(() => {
    if (value === undefined) return;
    current.current = value;
    committed.current = value;
  }, [value]);

  const commit = () => {
    if (current.current === committed.current) return;
    committed.current = current.current;
    commitRef.current(current.current);
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
        current.current = t;
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
