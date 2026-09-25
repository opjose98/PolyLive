// =============================================================================
// BackupRestoreUseCases.test.ts — BackupDatabaseUseCase / RestoreDatabaseUseCase
// Basado en: backup-integridad.md — cierra Gap #3 de docs/07-BUGS-GAPS-COMPLETE.md
//
// Usa bases de datos en ARCHIVO real (no :memory:), mismo patrón que
// test/integration/CrashRecovery.test.ts, porque backup/restore son
// operaciones de archivo — no tienen sentido contra una DB en memoria.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { Wall, roomId, revitObjectId } from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';
import { BackupDatabaseUseCase } from '../../src/application/use-cases/BackupDatabaseUseCase';
import { RestoreDatabaseUseCase } from '../../src/application/use-cases/RestoreDatabaseUseCase';
import { AppError, AppErrorCode } from '../../src/shared/errors/AppError';

const ROOM_ID = roomId('backup-room');

function uniqueDir(name: string): string {
  return path.join(os.tmpdir(), `polylive-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('BackupDatabaseUseCase', () => {
  let workDir: string;
  let dbPath: string;
  let backupDir: string;

  beforeEach(async () => {
    workDir = uniqueDir('backup-work');
    await fs.promises.mkdir(workDir, { recursive: true });
    dbPath = path.join(workDir, 'polylive.db');
    backupDir = path.join(workDir, 'backups');
  });

  afterEach(async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('crea un backup de una base sana y pasa su propia verificación de integridad', async () => {
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);
    await store.createObject(
      new Wall({
        id: revitObjectId('wall-1'),
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    const useCase = new BackupDatabaseUseCase();
    const result = await useCase.execute({ liveDb: db, dbFilePath: dbPath, backupDir });

    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(result.backupPath).toContain(backupDir);

    // El backup debe contener el Wall creado antes de la copia.
    const verifyDb = new Database(result.backupPath);
    await verifyDb.open();
    const verifyStore = new ObjectStore(verifyDb);
    const recovered = await verifyStore.readObject(revitObjectId('wall-1'));
    expect(recovered).not.toBeNull();
    await verifyDb.close();

    await db.close();
  });

  it('rota y conserva como máximo maxBackups archivos, eliminando los más antiguos', async () => {
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();

    const useCase = new BackupDatabaseUseCase();
    const paths: string[] = [];
    for (let i = 0; i < 7; i++) {
      const result = await useCase.execute({ liveDb: db, dbFilePath: dbPath, backupDir, maxBackups: 5 });
      paths.push(result.backupPath);
      // Los nombres de backup se derivan de un timestamp ISO — forzamos un
      // delta mayor a la resolución típica de mtime en el sistema de
      // archivos (hasta ~15ms en algunos FS de Windows) para que la
      // rotación por mtime ordene los backups de forma determinista.
      await new Promise((r) => setTimeout(r, 20));
    }

    const remaining = await fs.promises.readdir(backupDir);
    const backupFiles = remaining.filter((f) => f.endsWith('.db'));
    expect(backupFiles.length).toBe(5);

    // Los dos primeros backups creados deben haber sido podados.
    expect(fs.existsSync(paths[0])).toBe(false);
    expect(fs.existsSync(paths[1])).toBe(false);
    // El más reciente debe seguir existiendo.
    expect(fs.existsSync(paths[6])).toBe(true);

    await db.close();
  });
});

describe('RestoreDatabaseUseCase', () => {
  let workDir: string;
  let dbPath: string;
  let backupDir: string;

  beforeEach(async () => {
    workDir = uniqueDir('restore-work');
    await fs.promises.mkdir(workDir, { recursive: true });
    dbPath = path.join(workDir, 'polylive.db');
    backupDir = path.join(workDir, 'backups');
  });

  afterEach(async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('restaura desde el backup más reciente cuando pasa integrity_check', async () => {
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);
    await store.createObject(
      new Wall({
        id: revitObjectId('wall-original'),
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    const backupUseCase = new BackupDatabaseUseCase();
    await backupUseCase.execute({ liveDb: db, dbFilePath: dbPath, backupDir });
    await db.close();

    // Simular pérdida total de datos: el archivo "vivo" se corrompe/vacía.
    await fs.promises.writeFile(dbPath, 'not a valid sqlite file');

    const restoreUseCase = new RestoreDatabaseUseCase();
    const result = await restoreUseCase.execute({ backupDir, targetDbPath: dbPath });

    expect(result.backupsChecked).toBe(1);
    expect(result.rejectedBackups).toEqual([]);

    const restoredDb = new Database(dbPath);
    await restoredDb.open();
    const restoredStore = new ObjectStore(restoredDb);
    const recovered = await restoredStore.readObject(revitObjectId('wall-original'));
    expect(recovered).not.toBeNull();
    await restoredDb.close();
  });

  it('salta backups corruptos y usa el siguiente más reciente que sí pase integrity_check', async () => {
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);
    await store.createObject(
      new Wall({
        id: revitObjectId('wall-good'),
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    const backupUseCase = new BackupDatabaseUseCase();
    const goodBackup = await backupUseCase.execute({ liveDb: db, dbFilePath: dbPath, backupDir });
    await db.close();

    // Fabricar un backup MÁS RECIENTE pero corrupto, para forzar que
    // RestoreDatabaseUseCase lo descarte y caiga al backup bueno anterior.
    await new Promise((r) => setTimeout(r, 5));
    const corruptPath = path.join(backupDir, 'polylive-backup-9999-corrupt.db');
    await fs.promises.writeFile(corruptPath, 'garbage, not sqlite');
    // Forzar mtime posterior al backup bueno.
    const future = new Date(Date.now() + 60_000);
    await fs.promises.utimes(corruptPath, future, future);

    await fs.promises.writeFile(dbPath, 'blown away');

    const restoreUseCase = new RestoreDatabaseUseCase();
    const result = await restoreUseCase.execute({ backupDir, targetDbPath: dbPath });

    expect(result.restoredFrom).toBe(goodBackup.backupPath);
    expect(result.rejectedBackups).toContain(corruptPath);

    const restoredDb = new Database(dbPath);
    await restoredDb.open();
    const restoredStore = new ObjectStore(restoredDb);
    const recovered = await restoredStore.readObject(revitObjectId('wall-good'));
    expect(recovered).not.toBeNull();
    await restoredDb.close();
  });

  it('lanza AppError RESTORE_FAILED cuando no hay ningún backup', async () => {
    const restoreUseCase = new RestoreDatabaseUseCase();
    await expect(restoreUseCase.execute({ backupDir, targetDbPath: dbPath })).rejects.toMatchObject({
      code: AppErrorCode.RESTORE_FAILED,
    });
  });

  it('lanza AppError RESTORE_FAILED cuando TODOS los backups están corruptos', async () => {
    await fs.promises.mkdir(backupDir, { recursive: true });
    const corruptPath = path.join(backupDir, 'polylive-backup-only-corrupt.db');
    await fs.promises.writeFile(corruptPath, 'garbage');

    const restoreUseCase = new RestoreDatabaseUseCase();
    let error: unknown;
    try {
      await restoreUseCase.execute({ backupDir, targetDbPath: dbPath });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.RESTORE_FAILED);
  });
});
