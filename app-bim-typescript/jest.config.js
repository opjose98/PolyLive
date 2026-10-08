/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    // Mock native modules for Node test environment
    '^react-native$': '<rootDir>/test/__mocks__/react-native.ts',
    '^@shopify/react-native-skia$': '<rootDir>/test/__mocks__/react-native-skia.ts',
    '^expo-camera$': '<rootDir>/test/__mocks__/expo-camera.ts',
    '^expo-file-system(/legacy)?$': '<rootDir>/test/__mocks__/expo-file-system.ts',
    '^expo-location$': '<rootDir>/test/__mocks__/expo-location.ts',
    '^expo-sqlite$': '<rootDir>/test/__mocks__/expo-sqlite.ts',
  },
};
