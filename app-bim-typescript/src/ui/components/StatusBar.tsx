// =============================================================================
// StatusBar.tsx — Barra de estado persistente (BLE) sobre todas las pantallas
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.2 (StatusBar)
// =============================================================================
//
// GAP CERRADO: `state/appStore.ts` define un `bleSlice` (bleEnabled,
// bleDevice, lastMeasurement) desde el principio del proyecto, pero ningún
// componente de src/ui/ lo importaba ni lo escribía — el store completo era
// código muerto desde la perspectiva de la UI (SurveyScreen mantenía su
// propio estado BLE local en vez de escribirlo aquí). Esta barra lo pone en
// uso por primera vez, vía `useStore` de zustand (zustand/react) sobre la
// instancia vanilla ya creada en App.tsx — SurveyScreen ahora también
// escribe en este store (ver su wiring de `appStore.getState().setBle*`),
// así que el estado BLE es visible más allá de la pantalla de Levantamiento.
//
// ALCANCE: solo BLE. El wireframe original también contempla GPS y batería —
// GPS requeriría cablear expo-location (dependencia ya presente pero sin
// ningún uso en src/) y batería requeriría añadir expo-battery, que NO es
// una dependencia declarada en package.json. Añadir una dependencia nueva es
// una decisión de producto que no me corresponde tomar unilateralmente, así
// que se omite explícitamente en vez de simularse con datos falsos.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useStore } from 'zustand';
import type { AppStore } from '../../state/appStore';

export interface StatusBarProps {
  appStore: AppStore;
}

const STATE_COLOR: Record<'connected' | 'disconnected', string> = {
  connected: '#27AE60',
  disconnected: '#ADB5BD',
};

export function StatusBar({ appStore }: StatusBarProps) {
  const bleEnabled = useStore(appStore, (s) => s.bleEnabled);
  const bleDevice = useStore(appStore, (s) => s.bleDevice);
  const lastMeasurement = useStore(appStore, (s) => s.lastMeasurement);

  const connectionKey = bleEnabled && bleDevice ? 'connected' : 'disconnected';

  return (
    <View style={styles.container}>
      <View style={styles.item}>
        <View style={[styles.dot, { backgroundColor: STATE_COLOR[connectionKey] }]} />
        <Text style={styles.label}>{bleDevice ? bleDevice.name : 'BLE desconectado'}</Text>
      </View>

      {lastMeasurement && (
        <Text style={styles.measurement}>{Number(lastMeasurement.distance).toFixed(3)} m</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#212529',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    color: '#F8F9FA',
    fontSize: 12,
    fontWeight: '600',
  },
  measurement: {
    color: '#F8F9FA',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default StatusBar;
