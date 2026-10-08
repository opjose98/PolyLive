// =============================================================================
// ExpoPhotoCapture.ts — Camera integration via expo-camera
// Basado en: camera-photo-capture.md
// =============================================================================
//
// Gestiona la captura de fotos con la cámara nativa vía expo-camera.
// Provee: requestPermission, takePicture, getPermissionStatus.
//
// INVARIANTES:
// - Siempre verificar permiso antes de capturar
// - Fotos retornadas como { uri, base64, width, height }
// - quality configurable (default: 0.8)
// =============================================================================

import { Camera, CameraView } from 'expo-camera';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhotoResult {
  readonly uri: string;
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly exif?: Record<string, any>;
  readonly timestamp: number;
}

interface PhotoCaptureConfig {
  readonly quality: number;         // 0.0 - 1.0 (default: 0.8)
  readonly includeBase64: boolean;  // default: true
  readonly includeExif: boolean;    // default: true
}

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: PhotoCaptureConfig = {
  quality: 0.8,
  includeBase64: true,
  includeExif: true,
};

// ---------------------------------------------------------------------------
// ExpoPhotoCapture
// ---------------------------------------------------------------------------

export class ExpoPhotoCapture {
  private config: PhotoCaptureConfig;
  // Tipado contra la CLASE `CameraView` (no `any`, y no la interfaz auxiliar
  // `CameraViewRef` que expo-camera usa internamente para su ref nativo —
  // esa interfaz declara `takePicture`, pero un `ref` de JSX sobre
  // `<CameraView>` resuelve al INSTANCE TYPE de la clase, que expone
  // `takePictureAsync`. Confirmado leyendo CameraView.d.ts directamente,
  // no solo Camera.types.d.ts, tras un primer intento de tipado que asumió
  // erróneamente la interfaz auxiliar).
  private cameraRef: InstanceType<typeof CameraView> | null = null;

  constructor(config?: Partial<PhotoCaptureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  async requestPermission(): Promise<PermissionStatus> {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return this.mapPermissionStatus(status);
  }

  async getPermissionStatus(): Promise<PermissionStatus> {
    const { status } = await Camera.getCameraPermissionsAsync();
    return this.mapPermissionStatus(status);
  }

  async hasPermission(): Promise<boolean> {
    const status = await this.getPermissionStatus();
    return status === 'granted';
  }

  // -------------------------------------------------------------------------
  // Camera reference (set by React component)
  // -------------------------------------------------------------------------

  setCameraRef(ref: InstanceType<typeof CameraView> | null): void {
    this.cameraRef = ref;
  }

  getCameraRef(): InstanceType<typeof CameraView> | null {
    return this.cameraRef;
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  async takePicture(): Promise<PhotoResult> {
    const permitted = await this.hasPermission();
    if (!permitted) {
      throw new Error('Camera permission not granted. Call requestPermission() first.');
    }

    if (!this.cameraRef) {
      throw new Error('Camera ref not set. Call setCameraRef() from CameraView component.');
    }

    const photo = await this.cameraRef.takePictureAsync({
      quality: this.config.quality,
      base64: this.config.includeBase64,
      exif: this.config.includeExif,
    });

    if (!photo) {
      // takePictureAsync() puede resolver `undefined` (ver CameraView.d.ts) —
      // por ejemplo si la vista se desmonta a mitad de captura.
      throw new Error('La cámara no devolvió ninguna foto.');
    }

    return {
      uri: photo.uri,
      base64: photo.base64 ?? '',
      width: photo.width,
      height: photo.height,
      exif: photo.exif,
      timestamp: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  setQuality(quality: number): void {
    this.config = {
      ...this.config,
      quality: Math.max(0.0, Math.min(1.0, quality)),
    };
  }

  getConfig(): PhotoCaptureConfig {
    return { ...this.config };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private mapPermissionStatus(status: string): PermissionStatus {
    switch (status) {
      case 'granted':
        return 'granted';
      case 'denied':
        return 'denied';
      default:
        return 'undetermined';
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPhotoCapture(config?: Partial<PhotoCaptureConfig>): ExpoPhotoCapture {
  return new ExpoPhotoCapture(config);
}
