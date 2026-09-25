// =============================================================================
// PermissionsManager.ts — Unified permissions for Camera, BLE, Location
// Basado en: permissions-ios-android.md
// =============================================================================
//
// Centraliza la solicitud y verificación de permisos en iOS y Android.
// Abstrae las diferencias de plataforma detrás de una API unificada.
//
// Permisos gestionados:
// - Camera (expo-camera)
// - Location (expo-location)
// - Bluetooth (expo-modules / Android PermissionsAndroid)
// =============================================================================

import { Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionType = 'camera' | 'location' | 'bluetooth';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'restricted';

export interface PermissionState {
  readonly camera: PermissionStatus;
  readonly location: PermissionStatus;
  readonly bluetooth: PermissionStatus;
}

export interface PermissionRequestResult {
  readonly type: PermissionType;
  readonly status: PermissionStatus;
  readonly canAskAgain: boolean;
}

// ---------------------------------------------------------------------------
// PermissionsManager
// ---------------------------------------------------------------------------

export class PermissionsManager {
  private state: PermissionState = {
    camera: 'undetermined',
    location: 'undetermined',
    bluetooth: 'undetermined',
  };

  // -------------------------------------------------------------------------
  // Check all permissions
  // -------------------------------------------------------------------------

  async checkAll(): Promise<PermissionState> {
    const [camera, location, bluetooth] = await Promise.all([
      this.checkCamera(),
      this.checkLocation(),
      this.checkBluetooth(),
    ]);

    this.state = { camera, location, bluetooth };
    return this.state;
  }

  getState(): PermissionState {
    return { ...this.state };
  }

  // -------------------------------------------------------------------------
  // Individual checks
  // -------------------------------------------------------------------------

  async checkCamera(): Promise<PermissionStatus> {
    const { status } = await Camera.getCameraPermissionsAsync();
    const mapped = this.mapStatus(status);
    this.state = { ...this.state, camera: mapped };
    return mapped;
  }

  async checkLocation(): Promise<PermissionStatus> {
    const { status } = await Location.getForegroundPermissionsAsync();
    const mapped = this.mapStatus(status);
    this.state = { ...this.state, location: mapped };
    return mapped;
  }

  async checkBluetooth(): Promise<PermissionStatus> {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
      try {
        const { PermissionsAndroid } = require('react-native');
        const scanResult = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );
        const connectResult = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );

        const status: PermissionStatus =
          scanResult && connectResult ? 'granted' : 'undetermined';
        this.state = { ...this.state, bluetooth: status };
        return status;
      } catch {
        return 'undetermined';
      }
    }

    // iOS: Bluetooth permissions handled by system (CBCentralManager)
    // Pre-Android 12: BLUETOOTH and BLUETOOTH_ADMIN are normal permissions
    this.state = { ...this.state, bluetooth: 'granted' };
    return 'granted';
  }

  // -------------------------------------------------------------------------
  // Request permissions
  // -------------------------------------------------------------------------

  async requestCamera(): Promise<PermissionRequestResult> {
    const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
    const mapped = this.mapStatus(status);
    this.state = { ...this.state, camera: mapped };

    return {
      type: 'camera',
      status: mapped,
      canAskAgain: canAskAgain ?? true,
    };
  }

  async requestLocation(): Promise<PermissionRequestResult> {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    const mapped = this.mapStatus(status);
    this.state = { ...this.state, location: mapped };

    return {
      type: 'location',
      status: mapped,
      canAskAgain: canAskAgain ?? true,
    };
  }

  async requestBluetooth(): Promise<PermissionRequestResult> {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      try {
        const { PermissionsAndroid } = require('react-native');
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        const allGranted = Object.values(results).every(
          (r: any) => r === PermissionsAndroid.RESULTS.GRANTED,
        );
        const status: PermissionStatus = allGranted ? 'granted' : 'denied';
        this.state = { ...this.state, bluetooth: status };

        return {
          type: 'bluetooth',
          status,
          canAskAgain: !allGranted,
        };
      } catch {
        return { type: 'bluetooth', status: 'denied', canAskAgain: false };
      }
    }

    // iOS / old Android: granted by default
    this.state = { ...this.state, bluetooth: 'granted' };
    return { type: 'bluetooth', status: 'granted', canAskAgain: false };
  }

  // -------------------------------------------------------------------------
  // Request all
  // -------------------------------------------------------------------------

  /**
   * Solicita los tres permisos EN SECUENCIA, no en paralelo.
   *
   * GAP CORREGIDO: antes usaba `Promise.all([...])` para disparar las tres
   * solicitudes nativas a la vez. Android solo puede procesar una solicitud
   * de permiso a la vez por Activity — si dos llamadas nativas de "pedir
   * permiso" se disparan casi simultáneamente, la segunda puede pisar el
   * callback de la primera, dejando esa promesa nativa sin resolver NUNCA.
   * Como `Promise.all` no resuelve hasta que las tres promesas resuelvan,
   * una sola llamada colgada bloqueaba `requestAll()` para siempre — y como
   * App.tsx solo marca `permissionsReady = true` después de que esta
   * función resuelva (o lance), la app entera se quedaba congelada en la
   * pantalla de carga sin ningún error visible.
   */
  async requestAll(): Promise<PermissionState> {
    const camera = await this.requestCamera();
    const location = await this.requestLocation();
    const bluetooth = await this.requestBluetooth();

    return {
      camera: camera.status,
      location: location.status,
      bluetooth: bluetooth.status,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  allGranted(): boolean {
    return (
      this.state.camera === 'granted' &&
      this.state.location === 'granted' &&
      this.state.bluetooth === 'granted'
    );
  }

  getMissing(): PermissionType[] {
    const missing: PermissionType[] = [];
    if (this.state.camera !== 'granted') missing.push('camera');
    if (this.state.location !== 'granted') missing.push('location');
    if (this.state.bluetooth !== 'granted') missing.push('bluetooth');
    return missing;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private mapStatus(status: string): PermissionStatus {
    switch (status) {
      case 'granted':
        return 'granted';
      case 'denied':
        return 'denied';
      case 'restricted':
        return 'restricted';
      default:
        return 'undetermined';
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPermissionsManager(): PermissionsManager {
  return new PermissionsManager();
}
