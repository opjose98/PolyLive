// =============================================================================
// OperatorProfileScreen.tsx — Editar el perfil del operador activo
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.2 (OperatorProfileManager)
// =============================================================================
//
// Vive dentro de un ScreenShell (menú ☰ → Operador): el título lo pone él.
// =============================================================================

import React, { useState, useCallback } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { Operator } from '../../domain/objects/operator';
import { ActionButton, Card, confirm, toast } from '../primitives';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useTheme } from '../design/theme';

interface OperatorProfileScreenProps {
  store: ObjectStore;
  operator: Operator;
  onUpdated: (operator: Operator) => void;
  onSwitchOperator: () => void;
}

export function OperatorProfileScreen({ store, operator, onUpdated, onSwitchOperator }: OperatorProfileScreenProps) {
  const styles = useStyles();
  const colors = useTheme();
  const [name, setName] = useState(operator.name);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== operator.name;

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      toast('El nombre no puede estar vacío.', { kind: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await store.updateOperatorName(operator.id, trimmed);
      onUpdated(new Operator({ id: operator.id, name: trimmed, created_at: operator.created_at }));
      toast('Perfil actualizado', { kind: 'success' });
    } catch (err: any) {
      toast(err?.message ?? 'No se pudo guardar el perfil.', { kind: 'error' });
    } finally {
      setSaving(false);
    }
  }, [name, store, operator, onUpdated]);

  const handleSwitch = useCallback(async () => {
    const ok = await confirm({
      title: 'Cambiar de operador',
      message: 'Se cierra el levantamiento abierto y vuelves a la elección de operador. No se pierde nada.',
      confirmLabel: 'Cambiar',
    });
    if (ok) onSwitchOperator();
  }, [onSwitchOperator]);

  return (
    <>
      <Card title="Perfil">
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          editable={!saving}
          placeholder="Nombre del operador"
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel="Nombre del operador"
        />
        <Text style={styles.hint}>Firma los proyectos, las fotos y los archivos exportados.</Text>
        <ActionButton label="Guardar cambios" icon="content-save-outline" onPress={() => void handleSave()} disabled={!dirty} loading={saving} />
      </Card>
      <View style={styles.gap} />
      <ActionButton label="Cambiar de operador" icon="account-switch-outline" variant="secondary" onPress={() => void handleSwitch()} />
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  label: { ...type.label, color: colors.textSecondary },
  input: {
    ...type.body,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  hint: { ...type.caption, color: colors.textSecondary },
  gap: { height: spacing.xs },
}));
