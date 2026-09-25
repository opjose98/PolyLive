// =============================================================================
// DashboardScreen.tsx — Resumen de Recintos y punto de entrada al levantamiento
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.2 (Dashboard, ProjectNavigator)
// =============================================================================
//
// DECISIÓN DE ALCANCE (tomada sin poder confirmarla con el usuario —
// documentada explícitamente): el wireframe original separa `Dashboard`
// (resumen) de `ProjectNavigator` (árbol de proyectos/sedes). No existe
// ninguna entidad "Project" en el dominio ni en el esquema SQLite — inventar
// una sería una decisión de modelo de datos mayor sin especificación previa.
// En su lugar, esta pantalla combina ambos roles sobre la unidad que SÍ
// existe y ya soporta múltiples instancias: el Recinto (Room). El esquema
// SIEMPRE permitió múltiples Rooms (room_id es una columna libre); lo único
// que faltaba era una consulta (`ObjectStore.listAllRooms()`) y una pantalla
// que las mostrara — antes la UI fijaba un único ACTIVE_ROOM_ID (App.tsx).
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { Room, RoomId, roomId, levelId, revitObjectId, generateId } from '../../domain/objects';
import { Operator } from '../../domain/objects/operator';

export interface DashboardScreenProps {
  store: ObjectStore;
  operator: Operator;
  onSelectRoom: (roomId: RoomId) => void;
}

export function DashboardScreen({ store, operator, onSelectRoom }: DashboardScreenProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    setRooms(await store.listAllRooms());
  }, [store]);

  useEffect(() => {
    setLoading(true);
    loadRooms().finally(() => setLoading(false));
  }, [loadRooms]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  }, [loadRooms]);

  const handleCreateRoom = useCallback(async () => {
    setCreating(true);
    try {
      // Convención existente en toda la base (ver test/fixtures/room-scenarios.fixtures.ts,
      // CloseRoomUseCase.ts): el `id` de una Room es siempre su `roomId`
      // reinterpretado, no un id independiente.
      const newRoomId = roomId(generateId() as unknown as string);
      const room = new Room({
        id: revitObjectId(newRoomId as unknown as string),
        roomId: newRoomId,
        levelId: levelId('level-1'),
        geometry: [],
        isOpen: true,
      });
      await store.createObject(room);
      onSelectRoom(newRoomId);
    } finally {
      setCreating(false);
    }
  }, [store, onSelectRoom]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Levantamientos</Text>
          <Text style={styles.subtitle}>Operador: {operator.name}</Text>
        </View>
        <TouchableOpacity style={styles.newButton} onPress={handleCreateRoom} disabled={creating}>
          <Text style={styles.newButtonText}>{creating ? '...' : '+ Nuevo'}</Text>
        </TouchableOpacity>
      </View>

      {!loading && rooms.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Sin levantamientos todavía</Text>
          <Text style={styles.emptySubtext}>Toca "+ Nuevo" para empezar el primero.</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.roomId as string}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.roomCard} onPress={() => onSelectRoom(item.roomId)}>
              <View>
                <Text style={styles.roomId}>{item.roomId}</Text>
                <Text style={styles.roomMeta}>
                  {item.isOpen ? 'En trazo' : 'Cerrado'}
                  {item.area != null ? ` · ${Number(item.area).toFixed(1)} m²` : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#DEE2E6',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212529',
  },
  subtitle: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 2,
  },
  newButton: {
    backgroundColor: '#2C3E50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  list: {
    padding: 16,
  },
  roomCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  roomId: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212529',
  },
  roomMeta: {
    fontSize: 13,
    color: '#6C757D',
    marginTop: 4,
  },
  chevron: {
    fontSize: 20,
    color: '#ADB5BD',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ADB5BD',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ADB5BD',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default DashboardScreen;
