// Mock: expo-location (for Node test environment)

export const requestForegroundPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  canAskAgain: true,
});

export const getForegroundPermissionsAsync = jest.fn().mockResolvedValue({
  status: 'granted',
  canAskAgain: true,
});

export const LocationAccuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

/**
 * Devuelve por defecto un fix válido con precisión aceptable. Los tests que
 * ejercitan los caminos de fallo (sin precisión, precisión mala, timeout)
 * sobrescriben esta implementación.
 */
export const getCurrentPositionAsync = jest.fn().mockResolvedValue({
  coords: {
    latitude: 40.4168,
    longitude: -3.7038,
    altitude: 667,
    accuracy: 5,
    altitudeAccuracy: 3,
    heading: 0,
    speed: 0,
  },
  timestamp: 1700000000000,
});
