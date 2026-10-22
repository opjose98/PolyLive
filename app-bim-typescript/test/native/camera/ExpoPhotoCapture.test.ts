// =============================================================================
// ExpoPhotoCapture.test.ts — Tests for Expo camera integration
// =============================================================================

// ---------------------------------------------------------------------------
// Mock: expo-camera
// ---------------------------------------------------------------------------

const mockRequestPermissions = jest.fn();
const mockGetPermissions = jest.fn();

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: mockRequestPermissions,
    getCameraPermissionsAsync: mockGetPermissions,
  },
  // Stub mínimo — solo se usa como valor de tipo (InstanceType<typeof CameraView>)
  // en ExpoPhotoCapture.ts; los tests castean sus mocks contra este tipo.
  CameraView: class {},
  requestCameraPermissionsAsync: mockRequestPermissions,
  getCameraPermissionsAsync: mockGetPermissions,
}));

import {
  ExpoPhotoCapture,
  createPhotoCapture,
} from '../../../src/native/camera/ExpoPhotoCapture';
import type CameraView from 'expo-camera/build/CameraView';

type MockCameraRef = InstanceType<typeof CameraView>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpoPhotoCapture', () => {
  let capture: ExpoPhotoCapture;

  // `takePictureAsync`: nombre real del método de instancia en la clase
  // `CameraView` (CameraView.d.ts) — confirmado leyendo esa clase
  // directamente. Existe también una interfaz auxiliar `CameraViewRef`
  // (usada solo internamente por expo-camera para su ref nativo) que declara
  // `takePicture` sin "Async" — un ref de JSX real sobre <CameraView> NO
  // resuelve a esa interfaz, sino a la clase, así que ese nombre habría sido
  // incorrecto aquí (un intento anterior de esta auditoría lo confundió).
  // `cameraRef` está tipado contra la clase real (no `any`) precisamente
  // para que un error de nombre de método como este lo atrape tsc.
  const takePictureAsyncMock = jest.fn();
  const mockCameraRef = {
    takePictureAsync: takePictureAsyncMock,
  } as unknown as MockCameraRef;

  beforeEach(() => {
    jest.clearAllMocks();
    capture = new ExpoPhotoCapture();

    // Default: permission granted
    mockRequestPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockGetPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
  });

  // -----------------------------------------------------------------------
  // Permissions
  // -----------------------------------------------------------------------

  describe('permissions', () => {
    it('should request camera permission', async () => {
      const status = await capture.requestPermission();
      expect(status).toBe('granted');
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    });

    it('should handle denied permission', async () => {
      mockRequestPermissions.mockResolvedValue({ status: 'denied' });
      const status = await capture.requestPermission();
      expect(status).toBe('denied');
    });

    it('should check current permission status', async () => {
      const status = await capture.getPermissionStatus();
      expect(status).toBe('granted');
      expect(mockGetPermissions).toHaveBeenCalledTimes(1);
    });

    it('should check hasPermission', async () => {
      expect(await capture.hasPermission()).toBe(true);

      mockGetPermissions.mockResolvedValue({ status: 'denied' });
      expect(await capture.hasPermission()).toBe(false);
    });

    it('should map undetermined status', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
      const status = await capture.getPermissionStatus();
      expect(status).toBe('undetermined');
    });
  });

  // -----------------------------------------------------------------------
  // Camera ref
  // -----------------------------------------------------------------------

  describe('camera ref management', () => {
    it('should set and get camera ref', () => {
      expect(capture.getCameraRef()).toBeNull();
      capture.setCameraRef(mockCameraRef);
      expect(capture.getCameraRef()).toBe(mockCameraRef);
    });
  });

  // -----------------------------------------------------------------------
  // takePicture
  // -----------------------------------------------------------------------

  describe('takePicture', () => {
    const mockPhoto = {
      uri: 'file:///photos/photo.jpg',
      base64: 'base64data...',
      width: 3024,
      height: 4032,
      exif: { Make: 'Motorola', Model: 'Edge 50' },
    };

    beforeEach(() => {
      capture.setCameraRef(mockCameraRef);
      takePictureAsyncMock.mockResolvedValue(mockPhoto);
    });

    it('should capture a photo with default config', async () => {
      const result = await capture.takePicture();

      expect(result.uri).toBe(mockPhoto.uri);
      expect(result.base64).toBe(mockPhoto.base64);
      expect(result.width).toBe(3024);
      expect(result.height).toBe(4032);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.exif).toBeDefined();
    });

    it('should pass quality config to camera', async () => {
      await capture.takePicture();

      expect(takePictureAsyncMock).toHaveBeenCalledWith({
        quality: 0.8,
        base64: true,
        exif: true,
      });
    });

    it('should throw if permission not granted', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'denied' });

      await expect(capture.takePicture()).rejects.toThrow('Camera permission not granted');
    });

    it('should throw if camera ref not set', async () => {
      const fresh = new ExpoPhotoCapture();
      await expect(fresh.takePicture()).rejects.toThrow('Camera ref not set');
    });

    it('should handle missing base64', async () => {
      takePictureAsyncMock.mockResolvedValue({
        ...mockPhoto,
        base64: undefined,
      });

      const result = await capture.takePicture();
      expect(result.base64).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  describe('configuration', () => {
    it('should use default quality of 0.8', () => {
      const config = capture.getConfig();
      expect(config.quality).toBe(0.8);
      expect(config.includeBase64).toBe(true);
      expect(config.includeExif).toBe(true);
    });

    it('should accept custom config', () => {
      const custom = new ExpoPhotoCapture({ quality: 0.5 });
      expect(custom.getConfig().quality).toBe(0.5);
    });

    it('should clamp quality to [0, 1]', () => {
      capture.setQuality(1.5);
      expect(capture.getConfig().quality).toBe(1.0);

      capture.setQuality(-0.5);
      expect(capture.getConfig().quality).toBe(0.0);
    });
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe('createPhotoCapture factory', () => {
    it('should create instance with default config', () => {
      const instance = createPhotoCapture();
      expect(instance).toBeInstanceOf(ExpoPhotoCapture);
    });

    it('should accept custom config', () => {
      const instance = createPhotoCapture({ quality: 0.3 });
      expect(instance.getConfig().quality).toBe(0.3);
    });
  });
});
