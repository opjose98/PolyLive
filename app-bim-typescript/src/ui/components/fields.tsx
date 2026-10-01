// =============================================================================
// fields.tsx — Controles de formulario compartidos
// =============================================================================
//
// POR QUÉ EXISTE: cada pantalla declaraba sus propios TextInput con su propio
// borde, su propio alto y su propia forma de validar números. El panel de
// propiedades del editor necesita una docena de campos numéricos con unidades,
// y repetir ese patrón doce veces garantiza que doce campos se comporten de
// once maneras distintas.
//
// DECISIÓN CLAVE DE UX (NumberField): el valor se edita como TEXTO y solo se
// confirma al perder el foco o al pulsar "hecho". Un `onChangeText` que
// parsease y persistiese en cada pulsación haría imposible escribir "0.15":
// al teclear "0." el parseo da 0, el valor se normaliza a "0" y el punto
// desaparece bajo el dedo. Este es el fallo clásico de los formularios
// numéricos en móvil y en campo, con guantes, es inutilizable.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { spacing, radius, sizes } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useTheme } from '../design/theme';

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

export interface NumberFieldProps {
  label: string;
  value: number;
  /** Sufijo de unidad mostrado a la derecha ('m', 'm²', '°'...). */
  unit?: string;
  /** Decimales con los que se formatea el valor al mostrarlo. */
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Se invoca solo al CONFIRMAR (blur o submit), nunca en cada pulsación. */
  onCommit: (value: number) => void;
  /** Texto de ayuda o de error bajo el campo. */
  hint?: string;
}

export function NumberField({
  label,
  value,
  unit,
  decimals = 2,
  min,
  max,
  disabled,
  onCommit,
  hint,
}: NumberFieldProps) {
  const styles = useStyles();
  const [text, setText] = useState(() => value.toFixed(decimals));
  const [error, setError] = useState<string | null>(null);

  // Si el valor cambia desde fuera (undo, o una edición desde otra vista), el
  // campo tiene que reflejarlo — salvo que el usuario esté escribiendo algo
  // distinto, caso en el que su edición manda.
  useEffect(() => {
    setText(value.toFixed(decimals));
    setError(null);
  }, [value, decimals]);

  const commit = () => {
    // Se acepta coma decimal: el teclado numérico de muchos Android en español
    // ofrece "," y no ".", y rechazar la coma haría el campo intocable.
    const parsed = Number(text.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      setError('Introduce un número válido.');
      setText(value.toFixed(decimals));
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(`El mínimo es ${min}${unit ? ' ' + unit : ''}.`);
      setText(value.toFixed(decimals));
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`El máximo es ${max}${unit ? ' ' + unit : ''}.`);
      setText(value.toFixed(decimals));
      return;
    }

    setError(null);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputWrap}>
        <TextInput
          style={[styles.fieldInput, disabled && styles.fieldInputDisabled, !!error && styles.fieldInputError]}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          editable={!disabled}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={label}
        />
        {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------

export interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  /**
   * Cuándo se informa el cambio. Los dos modos existen porque los dos usos
   * tienen problemas OPUESTOS, y elegir uno solo rompe el otro:
   *
   * - `change` (por defecto) — formularios con botón de guardar. Si esperasen
   *   al blur, el usuario escribiría el nombre, pulsaría "Guardar" y el botón
   *   estaría DESHABILITADO porque el campo aún no perdió el foco y el
   *   formulario cree que sigue vacío.
   *
   * - `blur` — edición en vivo contra el modelo, como el panel de propiedades.
   *   Ahí cada cambio emite un comando al CommandStack: informar en cada
   *   pulsación llenaría el historial de Deshacer con un comando POR CARÁCTER,
   *   y deshacer un nombre exigiría treinta toques.
   */
  commitOn?: 'change' | 'blur';
  onCommit: (value: string) => void;
}

export function TextField({
  label,
  value,
  placeholder,
  multiline,
  disabled,
  commitOn = 'change',
  onCommit,
}: TextFieldProps) {
  const styles = useStyles();
  const colors = useTheme();
  const [draft, setDraft] = useState(value);

  // En modo `blur` el campo mantiene su propio borrador. Se resincroniza cuando
  // el valor cambia desde fuera (un undo, o seleccionar otro objeto).
  useEffect(() => {
    if (commitOn === 'blur') setDraft(value);
  }, [value, commitOn]);

  const controlled = commitOn === 'change';

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, styles.fieldInputBlock, multiline && styles.fieldInputMultiline, disabled && styles.fieldInputDisabled]}
        value={controlled ? value : draft}
        onChangeText={controlled ? onCommit : setDraft}
        onBlur={controlled ? undefined : () => {
          if (draft !== value) onCommit(draft);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        editable={!disabled}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// SegmentedField — elección entre pocas opciones
// ---------------------------------------------------------------------------

export interface SegmentedFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function SegmentedField<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: SegmentedFieldProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, active && styles.segmentActive, disabled && styles.segmentDisabled]}
              onPress={() => !disabled && onChange(option.value)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${option.label}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ToggleRow — interruptor de una línea
// ---------------------------------------------------------------------------

export function ToggleRow({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: boolean;
  description?: string;
  onChange: (value: boolean) => void;
}) {
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={styles.toggleRow}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// ReadonlyRow — dato no editable (id, área calculada, fechas)
// ---------------------------------------------------------------------------

export function ReadonlyRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text style={styles.readonlyValue} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = themedStyles((colors) => ({
  fieldRow: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  /**
   * Un TextInput suelto dentro de una columna NO debe llevar `flex: 1`: con el
   * teclado abierto la columna se achica, el campo se encoge hasta su mínimo y
   * lo que viene debajo se le monta encima.
   */
  fieldInputBlock: {
    flex: 0,
    alignSelf: 'stretch',
  },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldInput: {
    flex: 1,
    minHeight: sizes.touchMin,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: type.body.fontSize,
  },
  fieldInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  fieldInputDisabled: {
    backgroundColor: colors.background,
    color: colors.textSecondary,
  },
  fieldInputError: {
    borderColor: colors.error,
  },
  fieldUnit: {
    ...type.label,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    minWidth: 24,
  },
  fieldError: {
    ...type.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  fieldHint: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: sizes.touchMin,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  segmentActive: {
    backgroundColor: colors.accentText,
  },
  segmentDisabled: {
    opacity: 0.5,
  },
  segmentText: {
    ...type.label,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textOnAccent,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.touchMin,
    paddingVertical: spacing.sm,
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: spacing.md,
  },
  toggleLabel: {
    ...type.bodyStrong,
    color: colors.text,
  },
  toggleDescription: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: radius.round,
    backgroundColor: colors.background,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: colors.accentText,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  readonlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  readonlyLabel: {
    ...type.label,
    color: colors.textSecondary,
  },
  readonlyValue: {
    ...type.value,
    color: colors.text,
    maxWidth: '60%',
  },
}));
