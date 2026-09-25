// =============================================================================
// BLEStatus.tsx — BLE device connection status indicator
// Basado en: ble-huepa-device.md
// =============================================================================
//
// Muestra el estado de conexión BLE con el dispositivo Huepa.
// Estados: disconnected, scanning, connecting, connected, measuring
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { ConnectionState, BLEDevice } from '../../native/ble/HuepaDeviceManager';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BLEStatusProps {
  state: ConnectionState;
  device: BLEDevice | null;
  lastDistance?: number;       // última medición en metros
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMeasure?: () => void;
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ConnectionState, { label: string; color: string; icon: string }> = {
  disconnected: { label: 'Desconectado', color: '#E74C3C', icon: 'x' },
  scanning:     { label: 'Escaneando...',  color: '#F39C12', icon: '~' },
  connecting:   { label: 'Conectando...', color: '#F39C12', icon: '~' },
  connected:    { label: 'Conectado',     color: '#27AE60', icon: 'o' },
  measuring:    { label: 'Midiendo...',   color: '#3498DB', icon: '>' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BLEStatus({
  state,
  device,
  lastDistance,
  onConnect,
  onDisconnect,
  onMeasure,
}: BLEStatusProps) {
  const config = STATUS_CONFIG[state];
  const isActive = state === 'scanning' || state === 'connecting' || state === 'measuring';
  const isConnected = state === 'connected';

  return (
    <View style={styles.container}>
      {/* Status indicator */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <Text style={styles.statusLabel}>{config.label}</Text>
        {isActive && <ActivityIndicator size="small" color={config.color} />}
      </View>

      {/* Device name */}
      {device && (
        <Text style={styles.deviceName}>
          {device.name} (RSSI: {device.rssi} dBm)
        </Text>
      )}

      {/* Last measurement */}
      {lastDistance !== undefined && (
        <Text style={styles.measurement}>
          {lastDistance.toFixed(3)} m
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        {state === 'disconnected' && onConnect && (
          <TouchableOpacity style={[styles.button, styles.connectButton]} onPress={onConnect}>
            <Text style={styles.buttonText}>Conectar</Text>
          </TouchableOpacity>
        )}

        {isConnected && onMeasure && (
          <TouchableOpacity style={[styles.button, styles.measureButton]} onPress={onMeasure}>
            <Text style={styles.buttonText}>Medir</Text>
          </TouchableOpacity>
        )}

        {isConnected && onDisconnect && (
          <TouchableOpacity style={[styles.button, styles.disconnectButton]} onPress={onDisconnect}>
            <Text style={styles.buttonText}>Desconectar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212529',
  },
  deviceName: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 4,
  },
  measurement: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212529',
    marginTop: 8,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#27AE60',
  },
  measureButton: {
    backgroundColor: '#3498DB',
  },
  disconnectButton: {
    backgroundColor: '#E74C3C',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default BLEStatus;
