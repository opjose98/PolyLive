// =============================================================================
// ExpoFileSystem.ts — File storage via expo-file-system
// Basado en: filesystem-photo-storage.md
// =============================================================================
//
// Gestiona almacenamiento persistente de fotos y datos en el dispositivo
// usando expo-file-system. Estructura: DocumentDirectory/photos/
//
// INVARIANTES:
// - Fotos guardadas como JPEG en base64
// - Nombres de archivo: photo-{timestamp}.jpg
// - Directorio creado automáticamente si no existe
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredPhoto {
  readonly filename: string;
  readonly filepath: string;
  readonly size: number;          // bytes
  readonly createdAt: number;     // timestamp
}

interface FileSystemInfo {
  readonly totalSpace: number;    // bytes
  readonly freeSpace: number;     // bytes
  readonly photoCount: number;
  readonly photoDirSize: number;  // bytes
}

// ---------------------------------------------------------------------------
// ExpoFileSystem
// ---------------------------------------------------------------------------

export class ExpoFileSystem {
  private photoDir: string;

  constructor(baseDir?: string) {
    this.photoDir = baseDir ?? `${FileSystem.documentDirectory}photos/`;
  }

  // -------------------------------------------------------------------------
  // Directory management
  // -------------------------------------------------------------------------

  async ensurePhotoDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.photoDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.photoDir, { intermediates: true });
    }
  }

  getPhotoDir(): string {
    return this.photoDir;
  }

  // -------------------------------------------------------------------------
  // Save photo
  // -------------------------------------------------------------------------

  async savePhoto(base64Data: string, customFilename?: string): Promise<StoredPhoto> {
    await this.ensurePhotoDir();

    const filename = customFilename ?? `photo-${Date.now()}.jpg`;
    const filepath = `${this.photoDir}${filename}`;

    await FileSystem.writeAsStringAsync(filepath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const info = await FileSystem.getInfoAsync(filepath);

    return {
      filename,
      filepath,
      size: (info as any).size ?? 0,
      createdAt: Date.now(),
    };
  }

  // -------------------------------------------------------------------------
  // List photos
  // -------------------------------------------------------------------------

  async listPhotos(): Promise<StoredPhoto[]> {
    await this.ensurePhotoDir();

    const files = await FileSystem.readDirectoryAsync(this.photoDir);
    const photos: StoredPhoto[] = [];

    for (const filename of files) {
      if (this.isPhotoFile(filename)) {
        const filepath = `${this.photoDir}${filename}`;
        const info = await FileSystem.getInfoAsync(filepath);

        photos.push({
          filename,
          filepath,
          size: (info as any).size ?? 0,
          createdAt: (info as any).modificationTime ?? 0,
        });
      }
    }

    // Ordenar por fecha de creación, más reciente primero
    return photos.sort((a, b) => b.createdAt - a.createdAt);
  }

  // -------------------------------------------------------------------------
  // Delete photo
  // -------------------------------------------------------------------------

  async deletePhoto(filename: string): Promise<boolean> {
    const filepath = `${this.photoDir}${filename}`;

    try {
      const info = await FileSystem.getInfoAsync(filepath);
      if (!info.exists) {
        return false;
      }

      await FileSystem.deleteAsync(filepath);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Read photo
  // -------------------------------------------------------------------------

  async readPhoto(filename: string): Promise<string> {
    const filepath = `${this.photoDir}${filename}`;

    const info = await FileSystem.getInfoAsync(filepath);
    if (!info.exists) {
      throw new Error(`Photo not found: ${filename}`);
    }

    return FileSystem.readAsStringAsync(filepath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  // -------------------------------------------------------------------------
  // File system info
  // -------------------------------------------------------------------------

  async getInfo(): Promise<FileSystemInfo> {
    await this.ensurePhotoDir();

    const freeSpace = await FileSystem.getFreeDiskStorageAsync();
    const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
    const photos = await this.listPhotos();
    const photoDirSize = photos.reduce((sum, p) => sum + p.size, 0);

    return {
      totalSpace,
      freeSpace,
      photoCount: photos.length,
      photoDirSize,
    };
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async deleteAllPhotos(): Promise<number> {
    const photos = await this.listPhotos();
    let deleted = 0;

    for (const photo of photos) {
      const success = await this.deletePhoto(photo.filename);
      if (success) deleted++;
    }

    return deleted;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private isPhotoFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFileSystem(baseDir?: string): ExpoFileSystem {
  return new ExpoFileSystem(baseDir);
}
