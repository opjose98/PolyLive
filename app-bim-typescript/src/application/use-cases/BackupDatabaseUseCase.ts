// =============================================================================
// BackupDatabaseUseCase.ts — Copia de seguridad rotacional de la base SQLite
// Basado en: backup-integridad.md — hasta 5 backups, verificación de
// integridad antes de aceptar una copia como válida.
//
// Cierra Gap #3 de docs/07-BUGS-GAPS-COMPLETE.md: la estrategia estaba
// completamente especificada pero no existía código en src/.
// =============================================================================
//
// DISEÑO:
// - Antes de copiar, se corre `PRAGMA wal_checkpoint(FULL)` sobre la conexión
//   viva para volcar el WAL al archivo principal — si no se hace esto, copiar
//   solo el .db en modo WAL puede dejar fuera escrituras recientes que aún
//   viven en el -wal.
// - Antes de aceptar la copia como backup válido, se abre un archivo TEMPORAL
//   separado y se corre `PRAGMA integrity_check` sobre esa copia — nunca sobre
//   la base viva (evita interferir con la sesión en curso) y nunca se confía
//   en la copia final sin haberla verificado primero.
// - Rotación FIFO: se mantienen como máximo `maxBackups` archivos; los más
//   antiguos se borran por fecha de modificación, no por nombre.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../../infrastructure/sqlite/database';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

const BACKUP_PREFIX = 'polylive-backup-';
const BACKUP_EXT = '.db';

export interface BackupDatabaseInput {
  /** Conexión ABIERTA sobre la base viva — se usa solo para el checkpoint del WAL. */
  liveDb: Database;
  /** Ruta del archivo .db en disco correspondiente a `liveDb`. */
  dbFilePath: string;
  /** Carpeta donde se guardan los backups rotacionales. */
  backupDir: string;
  /** Máximo de backups a conservar (por defecto 5, según backup-integridad.md). */
  maxBackups?: number;
}

export interface BackupDatabaseOutput {
  backupPath: string;
  prunedPaths: string[];
}

export class BackupDatabaseUseCase {
  async execute(input: BackupDatabaseInput): Promise<BackupDatabaseOutput> {
    const maxBackups = input.maxBackups ?? 5;

    try {
      // 1. Volcar WAL al archivo principal para que la copia sea autocontenida.
      await input.liveDb.exec('PRAGMA wal_checkpoint(FULL);');

      // 2. Copiar a un archivo temporal primero — nunca escribimos directamente
      //    el nombre final hasta confirmar integridad, para no dejar un backup
      //    corrupto con nombre de backup "bueno".
      await fs.promises.mkdir(input.backupDir, { recursive: true });
      // Sufijo aleatorio además del timestamp: dos backups disparados dentro
      // del mismo milisegundo (posible en tests, y en teoría en producción)
      // no deben colisionar en el nombre de archivo y pisarse entre sí.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueSuffix = Math.random().toString(36).slice(2, 8);
      const baseName = `${BACKUP_PREFIX}${timestamp}-${uniqueSuffix}`;
      const tempPath = path.join(input.backupDir, `${baseName}.tmp`);
      const finalPath = path.join(input.backupDir, `${baseName}${BACKUP_EXT}`);

      await fs.promises.copyFile(input.dbFilePath, tempPath);

      // 3. Verificar integridad de la COPIA (no de la base viva) antes de aceptarla.
      const verifyDb = new Database(tempPath);
      let integrityOk = false;
      try {
        await verifyDb.open();
        const rows = await verifyDb.all<{ integrity_check: string }>('PRAGMA integrity_check;');
        integrityOk = rows.length === 1 && rows[0].integrity_check === 'ok';
      } finally {
        await verifyDb.close().catch(() => undefined);
      }

      if (!integrityOk) {
        await fs.promises.unlink(tempPath).catch(() => undefined);
        throw new AppError({
          code: AppErrorCode.BACKUP_FAILED,
          userMessage: 'La copia de seguridad falló la verificación de integridad y fue descartada.',
          technicalDetail: `integrity_check failed for temp backup ${tempPath}`,
          context: { dbFilePath: input.dbFilePath },
        });
      }

      // 4. Promover el temporal a nombre final solo tras integridad confirmada.
      await fs.promises.rename(tempPath, finalPath);

      // 5. Rotación: conservar los `maxBackups` más recientes.
      const prunedPaths = await this.pruneOldBackups(input.backupDir, maxBackups);

      return { backupPath: finalPath, prunedPaths };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.wrap(err, AppErrorCode.BACKUP_FAILED, 'No se pudo crear la copia de seguridad.', {
        dbFilePath: input.dbFilePath,
        backupDir: input.backupDir,
      });
    }
  }

  private async pruneOldBackups(backupDir: string, maxBackups: number): Promise<string[]> {
    const entries = await fs.promises.readdir(backupDir);
    const backupFiles = entries.filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT));

    // Orden por NOMBRE de archivo, no por mtime: el nombre embebe un
    // timestamp ISO 8601 (lexicográficamente ordenable) + sufijo aleatorio.
    // mtime NO es confiable aquí — en Windows, fs.copyFile usa CopyFileEx,
    // que por defecto PRESERVA el mtime del archivo origen (la base viva),
    // así que backups sucesivos del mismo archivo fuente sin cambios entre
    // medio pueden terminar con mtimes idénticos o fuera de orden.
    backupFiles.sort((a, b) => b.localeCompare(a)); // descendente: más reciente primero

    const toPrune = backupFiles.slice(maxBackups).map((f) => path.join(backupDir, f));
    for (const fullPath of toPrune) {
      await fs.promises.unlink(fullPath).catch(() => undefined);
    }
    return toPrune;
  }
}
