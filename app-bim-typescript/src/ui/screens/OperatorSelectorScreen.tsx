// =============================================================================
// OperatorSelectorScreen.tsx — Seleccionar o crear un perfil de operador
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.2 (OperatorSelector)
// =============================================================================
//
// GAP CERRADO: no existía ninguna entidad Operator ni pantalla para
// seleccionar/crear uno — ver domain/objects/operator.ts para el alcance
// deliberadamente mínimo (solo nombre, sin autenticación, decisión de
// producto documentada allí porque no pudo confirmarse con el usuario).
//
// Es la primera pantalla del flujo (antes del Tab.Navigator, ver App.tsx) —
// mientras no haya un operador seleccionado, no se puede usar el resto de
// la app. Esto es solo trazabilidad, NO una barrera de seguridad real.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { themedStyles } from '../design/theme';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { Operator, operatorId } from '../../domain/objects/operator';

import { generateId } from '../../domain/objects';
import { alertDialog } from '../primitives';

interface OperatorSelectorScreenProps {
  store: ObjectStore;
  onSelect: (operator: Operator) => void;
}

export function OperatorSelectorScreen({ store, onSelect }: OperatorSelectorScreenProps) {
  const styles = useStyles();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      setOperators(await store.listOperators());
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      alertDialog('Nombre requerido', 'Escribe un nombre para el nuevo operador.');
      return;
    }
    setCreating(true);
    try {
      const operator = new Operator({ id: operatorId(generateId() as string), name: trimmed });
      await store.createOperator(operator);
      setNewName('');
      await loadOperators();
      onSelect(operator);
    } catch (err: any) {
      alertDialog('Error', err?.message ?? 'No se pudo crear el operador.');
    } finally {
      setCreating(false);
    }
  }, [newName, store, loadOperators, onSelect]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>¿Quién está haciendo el levantamiento?</Text>

      {!loading && operators.length > 0 && (
        <FlatList
          data={operators}
          keyExtractor={(op) => op.id as string}
          style={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.operatorRow} onPress={() => onSelect(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.operatorName}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {!loading && operators.length === 0 && (
        <Text style={styles.emptyText}>Aún no hay operadores registrados. Crea el primero abajo.</Text>
      )}

      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="Nombre del nuevo operador"
          value={newName}
          onChangeText={setNewName}
          editable={!creating}
        />
        <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating}>
          <Text style={styles.createButtonText}>{creating ? '...' : 'Crear'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const useStyles = themedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: colors.text,
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
    marginBottom: 16,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.textOnAccent,
    fontFamily: 'Roboto_700Bold',
  },
  operatorName: {
    fontSize: 16,
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textDisabled,
    marginBottom: 16,
  },
  createRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  createButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  createButtonText: {
    color: colors.textOnAccent,
    fontFamily: 'Roboto_700Bold',
  },
}));

