// =============================================================================
// ExpoBackupDatabaseUseCase.test.ts — Backup rotacional en dispositivo
// =============================================================================
//
// Como expo-sqlite y expo-file-system son módulos nativos, estos tests NO
// verifican un motor SQL o de archivos real — verifican que la CAPA DE
// TRADUCCIÓN (nuestro código) llama a la API correcta, valida el resultado
// antes de aceptar un backup, y rota por nombre de archivo correctamente.
// Mismo enfoque que test/native/sqlite/ExpoSQLiteDatabase.test.ts.
//
// ESTRATEGIA BAJO PRUEBA: `VACUUM INTO` (ver la cabecera del use case).
// Estos tests se reescribieron cuando la implementación migró desde la
// cadena serializeAsync() + deserializeDatabaseAsync() + integrity_check +
// writeAsStringAsync(Base64) — que producía falsos negativos en bases con
// WAL activo — hacia el backup atómico nativo de SQLite. Los tests habían
// quedado atados a la mecánica vieja y fallaban contra el código correcto.
// =============================================================================

const mockGetInfo = jest.fn();
const mockMakeDir = jest.fn();
const mockWriteString = jest.fn();
const mockReadDir = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/com.polylivebim/documents/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: mockGetInfo,
  makeDirectoryAsync: mockMakeDir,
  writeAsStringAsync: mockWriteString,
  readDirectoryAsync: mockReadDir,
  deleteAsync: mockDeleteAsync,
}));

import { ExpoBackupDatabaseUseCase } from '../../../src/native/backup/ExpoBackupDatabaseUseCase';
import { ExpoSQLiteDatabase } from '../../../src/native/sqlite/ExpoSQLiteDatabase';
import { mockDb } from '../../__mocks__/expo-sqlite';
import { AppError, AppErrorCode } from '../../../src/shared/errors/AppError';

/** Las llamadas a execAsync que son sentencias VACUUM INTO. */
function vacuumCalls(): string[] {
  return (mockDb.execAsync as jest.Mock).mock.calls
    .map(([sql]) => String(sql))
    .filter((sql) => sql.includes('VACUUM INTO'));
}

describe('ExpoBackupDatabaseUseCase', () => {
  let db: ExpoSQLiteDatabase;

  beforeEach(async () => {
    // `clearAllMocks` borra las llamadas registradas pero NO las
    // implementaciones: sin esta línea, el `mockImplementation` que instala el
    // test del fallo de VACUUM INTO se filtra a los tests siguientes (y hasta
    // al `db.open()` de su propio beforeEach, que también usa execAsync).
    jest.clearAllMocks();
    (mockDb.execAsync as jest.Mock).mockImplementation(async () => undefined);

    db = new ExpoSQLiteDatabase('polylive.db');
    await db.open();

    // Defaults del "camino feliz": el directorio de backups ya existe, y el
    // archivo que VACUUM INTO produce aparece con tamaño > 0.
    mockGetInfo.mockResolvedValue({ exists: true, isDirectory: true, size: 4096 });
    mockReadDir.mockResolvedValue([]);
  });

  it('crea el backup con VACUUM INTO sobre una ruta nativa (sin prefijo file://) y la devuelve como backupPath', async () => {
    const useCase = new ExpoBackupDatabaseUseCase();
    const result = await useCase.execute({ db });

    const vacuums = vacuumCalls();
    expect(vacuums).toHaveLength(1);

    // La ruta que se le pasa a SQLite tiene que ser del filesystem nativo:
    // el motor no entiende el esquema URI `file://` de expo-file-system.
    expect(vacuums[0]).not.toContain('file://');
    expect(vacuums[0]).toContain('/data/com.polylivebim/documents/backups/');
    expect(vacuums[0]).toContain('polylive-backup-');
    expect(vacuums[0]).toMatch(/VACUUM INTO '.*\.db';/);

    // El backupPath que se reporta al llamador sí conserva la forma URI, que
    // es la que consume expo-file-system (getInfoAsync, deleteAsync...).
    expect(result.backupPath.startsWith('file:///data/com.polylivebim/documents/backups/')).toBe(true);
    expect(result.backupPath.endsWith('.db')).toBe(true);
  });

  it('NO pasa los bytes de la base por el puente JS — no serializa ni escribe el archivo desde JS', async () => {
    // La razón de existir de VACUUM INTO aquí: el archivo lo escribe SQLite en
    // el lado nativo. Si alguien reintroduce writeAsStringAsync para el backup,
    // volvemos a cargar la base entera en memoria JS y a los falsos negativos
    // de integridad que esta migración eliminó.
    const useCase = new ExpoBackupDatabaseUseCase();
    await useCase.execute({ db });

    expect(mockWriteString).not.toHaveBeenCalled();
  });

  it('escapa comillas simples en la ruta antes de interpolarla en el SQL', async () => {
    const useCase = new ExpoBackupDatabaseUseCase();
    await useCase.execute({ db, backupDir: "file:///data/o'brien/backups/" });

    // `o'brien` → `o''brien`: sin esto la sentencia se rompe (y, con una ruta
    // de origen menos confiable, sería inyección SQL).
    expect(vacuumCalls()[0]).toContain("o''brien");
  });

  it('crea el directorio de backups si no existe', async () => {
    // Primer getInfoAsync (el del directorio) dice que no existe; el segundo
    // (el del archivo de backup ya creado) sí, con tamaño > 0.
    mockGetInfo
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValue({ exists: true, size: 4096 });

    const useCase = new ExpoBackupDatabaseUseCase();
    await useCase.execute({ db });

    expect(mockMakeDir).toHaveBeenCalledWith(expect.any(String), { intermediates: true });
  });

  it('lanza AppError BACKUP_FAILED si el archivo resultante no existe', async () => {
    mockGetInfo
      .mockResolvedValueOnce({ exists: true, isDirectory: true }) // el directorio
      .mockResolvedValue({ exists: false }); // el backup nunca apareció

    const useCase = new ExpoBackupDatabaseUseCase();
    let error: unknown;
    try {
      await useCase.execute({ db });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.BACKUP_FAILED);
  });

  it('lanza AppError BACKUP_FAILED si el archivo resultante existe pero está vacío', async () => {
    // Un archivo de 0 bytes es el síntoma de un VACUUM INTO que falló a
    // medias: aceptarlo como backup válido sería peor que no tener backup.
    mockGetInfo
      .mockResolvedValueOnce({ exists: true, isDirectory: true })
      .mockResolvedValue({ exists: true, size: 0 });

    const useCase = new ExpoBackupDatabaseUseCase();
    await expect(useCase.execute({ db })).rejects.toMatchObject({
      code: AppErrorCode.BACKUP_FAILED,
    });
  });

  it('envuelve un fallo de VACUUM INTO como AppError BACKUP_FAILED y no poda nada', async () => {
    (mockDb.execAsync as jest.Mock).mockImplementation(async (sql: string) => {
      if (String(sql).includes('VACUUM INTO')) throw new Error('disk I/O error');
    });

    const useCase = new ExpoBackupDatabaseUseCase();
    await expect(useCase.execute({ db })).rejects.toMatchObject({
      code: AppErrorCode.BACKUP_FAILED,
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('rota y conserva como máximo maxBackups archivos, eliminando los más antiguos por nombre', async () => {
    // readDirectoryAsync es un mock estático — no refleja el archivo recién
    // creado por VACUUM INTO en el mismo test, así que la poda opera sobre
    // exactamente estos 7 nombres (no 8).
    const existing = Array.from({ length: 7 }, (_, i) => `polylive-backup-2024-01-0${i + 1}T00-00-00-000Z-abc${i}.db`);
    mockReadDir.mockResolvedValue(existing);

    const useCase = new ExpoBackupDatabaseUseCase();
    await useCase.execute({ db, maxBackups: 5 });

    // 7 nombres, conservar 5 más recientes por orden lexicográfico → podar
    // los 2 más antiguos (2024-01-01 y 2024-01-02).
    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    const deletedPaths = mockDeleteAsync.mock.calls.map((call) => call[0]);
    expect(deletedPaths.some((p) => p.includes('2024-01-01'))).toBe(true);
    expect(deletedPaths.some((p) => p.includes('2024-01-02'))).toBe(true);
    expect(deletedPaths.some((p) => p.includes('2024-01-03'))).toBe(false);
    expect(deletedPaths.some((p) => p.includes('2024-01-07'))).toBe(false);
  });

  it('ignora archivos en el directorio que no siguen el patrón de nombre de backup', async () => {
    mockReadDir.mockResolvedValue(['some-other-file.txt', 'polylive.db.bak']);

    const useCase = new ExpoBackupDatabaseUseCase();
    await useCase.execute({ db, maxBackups: 5 });

    // Ninguno de esos dos coincide con el prefijo/sufijo esperado — no se podan.
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('genera nombres distintos en backups consecutivos dentro del mismo milisegundo', async () => {
    // El timestamp ISO tiene resolución de milisegundo; el sufijo aleatorio es
    // lo que evita que dos backups seguidos se pisen el archivo.
    const useCase = new ExpoBackupDatabaseUseCase();
    const a = await useCase.execute({ db });
    const b = await useCase.execute({ db });

    expect(a.backupPath).not.toBe(b.backupPath);
  });
});
