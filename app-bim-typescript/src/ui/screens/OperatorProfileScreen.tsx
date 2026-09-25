// =============================================================================
// OperatorProfileScreen.tsx — Editar el perfil del operador activo
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.2 (OperatorProfileManager)
// =============================================================================

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { Operator } from '../../domain/objects/operator';

export interface OperatorProfileScreenProps {
  store: ObjectStore;
  operator: Operator;
  onUpdated: (operator: Operator) => void;
  onSwitchOperator: () => void;
}

export function OperatorProfileScreen({ store, operator, onUpdated, onSwitchOperator }: OperatorProfileScreenProps) {
  const [name, setName] = useState(operator.name);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      Alert.alert('Nombre requerido', 'El nombre no puede estar vacío.');
      return;
    }
    setSaving(true);
    try {
      await store.updateOperatorName(operator.id, trimmed);
      onUpdated(new Operator({ id: operator.id, name: trimmed, created_at: operator.created_at }));
      Alert.alert('Guardado', 'Perfil actualizado.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }, [name, store, operator, onUpdated]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Perfil del operador</Text>

      <Text style={styles.label}>Nombre</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} editable={!saving} />

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchButton} onPress={onSwitchOperator}>
        <Text style={styles.switchButtonText}>Cambiar de operador</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6C757D',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 24,
  },
  saveButton: {
    backgroundColor: '#2C3E50',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  switchButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#E74C3C',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default OperatorProfileScreen;
