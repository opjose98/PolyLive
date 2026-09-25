// Mock: expo-file-system (for Node test environment)

export const documentDirectory = 'file:///data/com.polylivebim/documents/';

export const EncodingType = {
  Base64: 'base64',
  UTF8: 'utf8',
};

export const getInfoAsync = jest.fn().mockResolvedValue({
  exists: true,
  isDirectory: true,
  size: 0,
  modificationTime: 0,
});

export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const readDirectoryAsync = jest.fn().mockResolvedValue([]);
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const copyAsync = jest.fn().mockResolvedValue(undefined);
export const moveAsync = jest.fn().mockResolvedValue(undefined);
export const getFreeDiskStorageAsync = jest.fn().mockResolvedValue(50_000_000_000);
export const getTotalDiskCapacityAsync = jest.fn().mockResolvedValue(128_000_000_000);
