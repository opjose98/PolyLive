// =============================================================================
// native/index.ts — Barrel exports for all native modules
// Spike #8: React Native Integration
// =============================================================================

// Canvas (Skia adapter)
export {
  SkiaCanvasAdapter,
  type ICanvasRenderer,
} from './canvas/SkiaCanvasAdapter';

// BLE (Huepa device)
export {
  HuepaDeviceManager,
  createHuepaManager,
  type MeasurementResult,
  type BLEDevice,
  type ConnectionState,
  type HuepaConfig,
} from './ble/HuepaDeviceManager';

// Camera (Expo)
export {
  ExpoPhotoCapture,
  createPhotoCapture,
  type PhotoResult,
  type PhotoCaptureConfig,
  type PermissionStatus as CameraPermissionStatus,
} from './camera/ExpoPhotoCapture';

// FileSystem (Expo)
export {
  ExpoFileSystem,
  createFileSystem,
  type StoredPhoto,
  type FileSystemInfo,
} from './filesystem/ExpoFileSystem';

// Permissions
export {
  PermissionsManager,
  createPermissionsManager,
  type PermissionType,
  type PermissionState,
  type PermissionRequestResult,
  type PermissionStatus,
} from './permissions/PermissionsManager';

// SQLite (Expo) — implementación de IDatabase para dispositivo real
export { ExpoSQLiteDatabase } from './sqlite/ExpoSQLiteDatabase';
