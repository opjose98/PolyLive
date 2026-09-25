// =============================================================================
// ExpoRestoreDatabaseUseCase.test.ts — Restauración en dispositivo
// =============================================================================
//
// La restauración estaba declarada "fuera de alcance" y por tanto los backups
// no servían de nada en el dispositivo. Estos tests fijan el contrato de la
// implementación que cierra ese hueco, y en particular el detalle del que
// depende que funcione de verdad: borrar los sidecars WAL antes de copiar.
// =============================================================================

const mockGetInfo = jest.fn();
const mockMakeDir = jest.fn();
const mockReadDir = jest.fn();
const mockDeleteAsync = jest.fn();
const mockCopyAsync = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/com.polylivebim/documents/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: mockGetInfo,
  makeDirectoryAsync: mockMakeDir,
  readDirectoryAsync: mockReadDir,
  deleteAsync: mockDeleteAsync,
  copyAsync: mockCopyAsync,
}));

import {
  ExpoRestoreDatabaseUseCase,
  databaseFilePath,
  sqliteDirectory,
  parseTimestampFromName,
} from '../../../src/native/backup/ExpoRestoreDatabaseUseCase';
import { AppErrorCode } from '../../../src/shared/errors/AppError';

const DB_NAME = 'polylive.db';
const TARGET = databaseFilePath(DB_NAME);
const BACKUP_DIR = 'file:///data/com.polylivebim/documents/backups/';

/** Respuestas de getInfoAsync por ruta, con un valor por defecto. */
function infoByPath(map: Record<string, unknown>, fallback: unknown = { exists: false }) {
  mockGetInfo.mockImplementation(async (path: string) => map[path] ?? fallback);
}

describe('ExpoRestoreDatabaseUseCase — rutas', () => {
  it('resuelve la ruta del archivo de base dentro del directorio SQLite de expo-sqlite', () => {
    expect(sqliteDirectory()).toBe('file:///data/com.polylivebim/documents/SQLite/');
    expect(TARGET).toBe('file:///data/com.polylivebim/documents/SQLite/polylive.db');
  });
});

describe('parseTimestampFromName', () => {
  it('reconstruye la fecha a partir del nombre del backup', () => {
    const date = parseTimestampFromName('polylive-backup-2026-03-14T09-26-53-589Z-ab12cd.db');
    expect(date?.toISOString()).toBe('2026-03-14T09:26:53.589Z');
  });

  it('devuelve null si el nombre no lleva marca de tiempo, en vez de inventarla', () => {
    // Una fecha falsa en la lista llevaría a restaurar el archivo equivocado.
    expect(parseTimestampFromName('polylive.db.bak')).toBeNull();
    expect(parseTimestampFromName('polylive-backup-sin-fecha.db')).toBeNull();
  });
});

describe('ExpoRestoreDatabaseUseCase — listBackups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista los backups del más reciente al más antiguo, por NOMBRE', () => {
    // Por nombre y no por mtime: el mtime lo reescribe cualquier sincronización
    // o copia del sistema, el nombre lleva el instante real de creación.
    mockReadDir.mockResolvedValue([
      'polylive-backup-2026-01-02T00-00-00-000Z-aaa.db',
      'polylive-backup-2026-03-01T00-00-00-000Z-ccc.db',
      'polylive-backup-2026-02-01T00-00-00-000Z-bbb.db',
    ]);
    infoByPath({ [BACKUP_DIR]: { exists: true, isDirectory: true } }, { exists: true, size: 2048 });

    return new ExpoRestoreDatabaseUseCase().listBackups().then((backups) => {
      expect(backups.map((b) => b.name)).toEqual([
        'polylive-backup-2026-03-01T00-00-00-000Z-ccc.db',
        'polylive-backup-2026-02-01T00-00-00-000Z-bbb.db',
        'polylive-backup-2026-01-02T00-00-00-000Z-aaa.db',
      ]);
      expect(backups[0].sizeBytes).toBe(2048);
      expect(backups[0].createdAt?.getUTCMonth()).toBe(2); // marzo
    });
  });

  it('ignora los archivos que no siguen el patrón de nombre de backup', async () => {
    mockReadDir.mockResolvedValue([
      'polylive-backup-2026-01-02T00-00-00-000Z-aaa.db',
      'notas.txt',
      'polylive.db',
    ]);
    infoByPath({ [BACKUP_DIR]: { exists: true, isDirectory: true } }, { exists: true, size: 10 });

    const backups = await new ExpoRestoreDatabaseUseCase().listBackups();
    expect(backups).toHaveLength(1);
  });

  it('devuelve lista vacía si el directorio de backups no existe', async () => {
    infoByPath({}, { exists: false });

    expect(await new ExpoRestoreDatabaseUseCase().listBackups()).toEqual([]);
    expect(mockReadDir).not.toHaveBeenCalled();
  });
});

describe('ExpoRestoreDatabaseUseCase — execute', () => {
  const BACKUP = `${BACKUP_DIR}polylive-backup-2026-03-01T00-00-00-000Z-ccc.db`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copia el backup sobre el archivo de la base', async () => {
    infoByPath({
      [BACKUP]: { exists: true, size: 4096 },
      [sqliteDirectory()]: { exists: true, isDirectory: true },
    });

    const result = await new ExpoRestoreDatabaseUseCase().execute({
      dbName: DB_NAME,
      backupPath: BACKUP,
    });

    expect(mockCopyAsync).toHaveBeenCalledWith({ from: BACKUP, to: TARGET });
    expect(result.restoredFrom).toBe(BACKUP);
  });

  it('BORRA los sidecars -wal y -shm ANTES de copiar', async () => {
    // Es el detalle del que depende que la restauración funcione de verdad: un
    // -wal de la base anterior aplicado encima del backup resucita justo los
    // datos que se querían descartar.
    infoByPath({
      [BACKUP]: { exists: true, size: 4096 },
      [sqliteDirectory()]: { exists: true, isDirectory: true },
      [`${TARGET}-wal`]: { exists: true, size: 900 },
      [`${TARGET}-shm`]: { exists: true, size: 32 },
    });

    const result = await new ExpoRestoreDatabaseUseCase().execute({
      dbName: DB_NAME,
      backupPath: BACKUP,
    });

    expect(result.removedSidecars).toEqual([`${TARGET}-wal`, `${TARGET}-shm`]);
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${TARGET}-wal`, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${TARGET}-shm`, { idempotent: true });

    const lastDelete = Math.max(...mockDeleteAsync.mock.invocationCallOrder);
    expect(lastDelete).toBeLessThan(mockCopyAsync.mock.invocationCallOrder[0]);
  });

  it('no intenta borrar sidecars que no existen', async () => {
    infoByPath({
      [BACKUP]: { exists: true, size: 4096 },
      [sqliteDirectory()]: { exists: true, isDirectory: true },
    });

    const result = await new ExpoRestoreDatabaseUseCase().execute({
      dbName: DB_NAME,
      backupPath: BACKUP,
    });

    expect(result.removedSidecars).toEqual([]);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('crea el directorio SQLite si no existe — restaurar puede ser lo primero tras reinstalar', async () => {
    infoByPath({ [BACKUP]: { exists: true, size: 4096 } }, { exists: false });

    await new ExpoRestoreDatabaseUseCase().execute({ dbName: DB_NAME, backupPath: BACKUP });

    expect(mockMakeDir).toHaveBeenCalledWith(sqliteDirectory(), { intermediates: true });
  });

  it('sin backupPath, restaura el más reciente', async () => {
    mockReadDir.mockResolvedValue([
      'polylive-backup-2026-01-02T00-00-00-000Z-aaa.db',
      'polylive-backup-2026-03-01T00-00-00-000Z-ccc.db',
    ]);
    infoByPath({ [sqliteDirectory()]: { exists: true, isDirectory: true } }, { exists: true, size: 4096 });

    const result = await new ExpoRestoreDatabaseUseCase().execute({ dbName: DB_NAME });

    expect(result.restoredFrom).toContain('2026-03-01');
  });

  it('lanza RESTORE_FAILED si no hay ningún backup', async () => {
    infoByPath({}, { exists: false });

    await expect(new ExpoRestoreDatabaseUseCase().execute({ dbName: DB_NAME })).rejects.toMatchObject({
      code: AppErrorCode.RESTORE_FAILED,
    });
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('lanza RESTORE_FAILED y no copia nada si el backup elegido está vacío', async () => {
    // Un archivo de 0 bytes sobrescribiendo la base destruiría el trabajo del
    // día para "restaurar" una nada.
    infoByPath({
      [BACKUP]: { exists: true, size: 0 },
      [sqliteDirectory()]: { exists: true, isDirectory: true },
    });

    await expect(
      new ExpoRestoreDatabaseUseCase().execute({ dbName: DB_NAME, backupPath: BACKUP }),
    ).rejects.toMatchObject({ code: AppErrorCode.RESTORE_FAILED });
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('envuelve un fallo de copia como RESTORE_FAILED', async () => {
    infoByPath({
      [BACKUP]: { exists: true, size: 4096 },
      [sqliteDirectory()]: { exists: true, isDirectory: true },
    });
    mockCopyAsync.mockRejectedValue(new Error('EACCES'));

    await expect(
      new ExpoRestoreDatabaseUseCase().execute({ dbName: DB_NAME, backupPath: BACKUP }),
    ).rejects.toMatchObject({ code: AppErrorCode.RESTORE_FAILED });
  });
});
