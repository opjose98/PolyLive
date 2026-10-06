// =============================================================================
// ExpoFileSystem.test.ts — Tests for Expo file system integration
// =============================================================================

// ---------------------------------------------------------------------------
// Mock: expo-file-system
// ---------------------------------------------------------------------------

const mockGetInfo = jest.fn();
const mockMakeDir = jest.fn();
const mockWriteString = jest.fn();
const mockReadDir = jest.fn();
const mockDeleteAsync = jest.fn();
const mockReadString = jest.fn();
const mockGetFreeSpace = jest.fn();
const mockGetTotalCapacity = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/com.polylivebim/documents/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: mockGetInfo,
  makeDirectoryAsync: mockMakeDir,
  writeAsStringAsync: mockWriteString,
  readDirectoryAsync: mockReadDir,
  deleteAsync: mockDeleteAsync,
  readAsStringAsync: mockReadString,
  getFreeDiskStorageAsync: mockGetFreeSpace,
  getTotalDiskCapacityAsync: mockGetTotalCapacity,
}));

import {
  ExpoFileSystem,
  createFileSystem,
  
} from '../../../src/native/filesystem/ExpoFileSystem';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpoFileSystem', () => {
  let fs: ExpoFileSystem;

  beforeEach(() => {
    jest.clearAllMocks();
    fs = new ExpoFileSystem();

    // Default: photo dir exists
    mockGetInfo.mockResolvedValue({ exists: true, isDirectory: true, size: 0 });
    mockMakeDir.mockResolvedValue(undefined);
    mockReadDir.mockResolvedValue([]);
  });

  // -----------------------------------------------------------------------
  // Directory management
  // -----------------------------------------------------------------------

  describe('ensurePhotoDir', () => {
    it('should create directory if not exists', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: false });
      await fs.ensurePhotoDir();
      expect(mockMakeDir).toHaveBeenCalledWith(
        expect.stringContaining('photos/'),
        { intermediates: true },
      );
    });

    it('should not create directory if exists', async () => {
      mockGetInfo.mockResolvedValueOnce({ exists: true });
      await fs.ensurePhotoDir();
      expect(mockMakeDir).not.toHaveBeenCalled();
    });

    it('should return correct photo dir path', () => {
      expect(fs.getPhotoDir()).toContain('photos/');
    });
  });

  // -----------------------------------------------------------------------
  // savePhoto
  // -----------------------------------------------------------------------

  describe('savePhoto', () => {
    it('should save base64 photo to file', async () => {
      mockGetInfo.mockResolvedValue({ exists: true, size: 1024 });
      mockWriteString.mockResolvedValue(undefined);

      const result = await fs.savePhoto('base64data');

      expect(result.filename).toMatch(/^photo-\d+\.jpg$/);
      expect(result.filepath).toContain('photos/');
      expect(result.createdAt).toBeGreaterThan(0);
      expect(mockWriteString).toHaveBeenCalledWith(
        expect.stringContaining('photo-'),
        'base64data',
        { encoding: 'base64' },
      );
    });

    it('should accept custom filename', async () => {
      mockGetInfo.mockResolvedValue({ exists: true, size: 512 });
      const result = await fs.savePhoto('data', 'custom-name.jpg');

      expect(result.filename).toBe('custom-name.jpg');
    });

    it('should ensure photo dir exists before saving', async () => {
      mockGetInfo
        .mockResolvedValueOnce({ exists: false })  // ensurePhotoDir check
        .mockResolvedValueOnce({ exists: true, size: 100 }); // file info after save

      await fs.savePhoto('data');
      expect(mockMakeDir).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // listPhotos
  // -----------------------------------------------------------------------

  describe('listPhotos', () => {
    it('should list photo files', async () => {
      mockReadDir.mockResolvedValue(['photo-001.jpg', 'photo-002.jpg', 'readme.txt']);
      mockGetInfo.mockResolvedValue({
        exists: true,
        size: 1024,
        modificationTime: 1694956800,
      });

      const photos = await fs.listPhotos();

      // Should filter out non-photo files
      expect(photos).toHaveLength(2);
      expect(photos[0].filename).toMatch(/photo-\d+\.jpg/);
    });

    it('should return empty array for empty directory', async () => {
      mockReadDir.mockResolvedValue([]);
      const photos = await fs.listPhotos();
      expect(photos).toHaveLength(0);
    });

    it('should include .png files', async () => {
      mockReadDir.mockResolvedValue(['screenshot.png']);
      mockGetInfo.mockResolvedValue({ exists: true, size: 2048, modificationTime: 0 });

      const photos = await fs.listPhotos();
      expect(photos).toHaveLength(1);
    });

    it('should include .jpeg files', async () => {
      mockReadDir.mockResolvedValue(['photo.jpeg']);
      mockGetInfo.mockResolvedValue({ exists: true, size: 512, modificationTime: 0 });

      const photos = await fs.listPhotos();
      expect(photos).toHaveLength(1);
    });

    it('should sort by creation time descending', async () => {
      mockReadDir.mockResolvedValue(['old.jpg', 'new.jpg']);
      let callCount = 0;
      mockGetInfo.mockImplementation(() => {
        callCount++;
        // First calls are for ensurePhotoDir, then for each file
        return Promise.resolve({
          exists: true,
          size: 100,
          modificationTime: callCount <= 2 ? 100 : 200,
        });
      });

      const photos = await fs.listPhotos();
      expect(photos.length).toBe(2);
      // Most recent first
      expect(photos[0].createdAt).toBeGreaterThanOrEqual(photos[1].createdAt);
    });
  });

  // -----------------------------------------------------------------------
  // deletePhoto
  // -----------------------------------------------------------------------

  describe('deletePhoto', () => {
    it('should delete existing photo', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockDeleteAsync.mockResolvedValue(undefined);

      const result = await fs.deletePhoto('photo-001.jpg');
      expect(result).toBe(true);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    });

    it('should return false for non-existent photo', async () => {
      mockGetInfo.mockResolvedValue({ exists: false });

      const result = await fs.deletePhoto('missing.jpg');
      expect(result).toBe(false);
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('should return false on delete error', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockDeleteAsync.mockRejectedValue(new Error('delete failed'));

      const result = await fs.deletePhoto('locked.jpg');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // readPhoto
  // -----------------------------------------------------------------------

  describe('readPhoto', () => {
    it('should read photo as base64', async () => {
      mockGetInfo.mockResolvedValue({ exists: true });
      mockReadString.mockResolvedValue('base64content');

      const data = await fs.readPhoto('photo-001.jpg');
      expect(data).toBe('base64content');
      expect(mockReadString).toHaveBeenCalledWith(
        expect.stringContaining('photo-001.jpg'),
        { encoding: 'base64' },
      );
    });

    it('should throw for non-existent photo', async () => {
      mockGetInfo.mockResolvedValue({ exists: false });

      await expect(fs.readPhoto('missing.jpg')).rejects.toThrow('Photo not found');
    });
  });

  // -----------------------------------------------------------------------
  // getInfo
  // -----------------------------------------------------------------------

  describe('getInfo', () => {
    it('should return file system info', async () => {
      mockGetFreeSpace.mockResolvedValue(50_000_000_000);
      mockGetTotalCapacity.mockResolvedValue(128_000_000_000);
      mockReadDir.mockResolvedValue(['a.jpg', 'b.jpg']);
      mockGetInfo.mockResolvedValue({ exists: true, size: 1024, modificationTime: 0 });

      const info = await fs.getInfo();

      expect(info.totalSpace).toBe(128_000_000_000);
      expect(info.freeSpace).toBe(50_000_000_000);
      expect(info.photoCount).toBe(2);
      expect(info.photoDirSize).toBe(2048); // 2 * 1024
    });
  });

  // -----------------------------------------------------------------------
  // deleteAllPhotos
  // -----------------------------------------------------------------------

  describe('deleteAllPhotos', () => {
    it('should delete all photos and return count', async () => {
      mockReadDir.mockResolvedValue(['a.jpg', 'b.jpg', 'c.jpg']);
      mockGetInfo.mockResolvedValue({ exists: true, size: 100, modificationTime: 0 });
      mockDeleteAsync.mockResolvedValue(undefined);

      const count = await fs.deleteAllPhotos();
      expect(count).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe('createFileSystem factory', () => {
    it('should create instance with default dir', () => {
      const instance = createFileSystem();
      expect(instance).toBeInstanceOf(ExpoFileSystem);
      expect(instance.getPhotoDir()).toContain('photos/');
    });

    it('should accept custom base dir', () => {
      const instance = createFileSystem('/custom/dir/');
      expect(instance.getPhotoDir()).toBe('/custom/dir/');
    });
  });
});
