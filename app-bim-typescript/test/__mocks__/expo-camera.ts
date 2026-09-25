// Mock: expo-camera (for Node test environment)

const requestCameraPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  canAskAgain: true,
});

const getCameraPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  canAskAgain: true,
});

export const Camera = {
  requestCameraPermissionsAsync,
  getCameraPermissionsAsync,
};

export const CameraView = 'CameraView';

// Also export directly for tests that reference specific functions
export { requestCameraPermissionsAsync, getCameraPermissionsAsync };
