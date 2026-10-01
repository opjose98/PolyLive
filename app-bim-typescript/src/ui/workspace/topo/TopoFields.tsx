// =============================================================================
// TopoFields — Campos de texto/número de los formularios de Topografía
// =============================================================================

import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { radius, spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles, useTheme } from '../../design/theme';

/** Campo controlado (texto). `numeric` abre el teclado numérico y acepta coma. */
export function Field({
  label,
  value,
  onChange,
  numeric,
  placeholder,
  unit,
  flex,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  unit?: string;
  flex?: boolean;
  /** Al salir del campo: para guardar una vez, no en cada tecla. */
  onBlur?: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={[styles.field, flex && styles.flex]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
          placeholder={placeholder}
          placeholderTextColor={colors.textDisabled}
          selectTextOnFocus
          onBlur={onBlur}
          accessibilityLabel={label}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Número de un campo (acepta coma decimal y separadores de miles con punto). */
export function parseNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  // "1.000.512,31" → 1000512.31 ; "1000512.31" → igual.
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function Row({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

export function Kv({ k, v }: { k: string; v: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v} selectable>
        {v}
      </Text>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  field: { gap: 4 },
  flex: { flex: 1 },
  label: { ...type.label, color: colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    ...type.body,
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  unit: { ...type.label, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.md },
  k: { ...type.label, color: colors.textSecondary },
  v: { ...type.bodyStrong, color: colors.text, flexShrink: 1, textAlign: 'right' },
}));
