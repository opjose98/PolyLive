// =============================================================================
// RestoreDatabaseUseCase.ts — Restaura la base SQLite desde el backup válido
// más reciente
// Basado en: backup-integridad.md — restaurar desde el backup MÁS RECIENTE
// que pase su propia verificación de integridad (no necesariamente el último
// creado, si ese resultó corrupto).
//
// Cierra Gap #3 de docs/07-BUGS-GAPS-COMPLETE.md junto con BackupDatabaseUseCase.
// =============================================================================
//
// PRECONDICIÓN IMPORTANTE: el llamador debe cerrar cualquier conexión abierta
// sobre `targetDbPath` ANTES de invocar este UseCase. Sobrescribir el archivo
// de una base de datos SQLite con una conexión activa produce corrupción —
// exactamente el problema que este UseCase existe para resolver, no para causar.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../../infrastructure/sqlite/database';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

const BACKUP_PREFIX = 'polylive-backup-';
const BACKUP_EXT = '.db';

export interface RestoreDatabaseInput {
  /** Carpeta donde BackupDatabaseUseCase guarda los backups rotacionales. */
  backupDir: string;
  /** Ruta del archivo .db que se va a sobrescribir con el backup restaurado. */
  targetDbPath: string;
}

export interface RestoreDatabaseOutput {
  restoredFrom: string;
  backupsChecked: number;
  /** Rutas de backups descartados por fallar integrity_check, en orden de intento. */
  rejectedBackups: string[];
}

export class RestoreDatabaseUseCase {
  async execute(input: RestoreDatabaseInput): Promise<RestoreDatabaseOutput> {
    const candidates = await this.listBackupsNewestFirst(input.backupDir);

    if (candidates.length === 0) {
      throw new AppError({
        code: AppErrorCode.RESTORE_FAILED,
        userMessage: 'No hay copias de seguridad disponibles para restaurar.',
        technicalDetail: `No backups found in ${input.backupDir}`,
        context: { backupDir: input.backupDir },
      });
    }

    const rejectedBackups: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const passed = await this.verifyIntegrity(candidate);
      if (!passed) {
        rejectedBackups.push(candidate);
        continue;
      }

      // Backup válido encontrado — restaurar sobre el destino.
      try {
        await fs.promises.copyFile(candidate, input.targetDbPath);
      } catch (err) {
        throw AppError.wrap(
          err,
          AppErrorCode.RESTORE_FAILED,
          'Se encontró una copia de seguridad válida pero no se pudo escribir sobre la base de datos.',
          { candidate, targetDbPath: input.targetDbPath },
        );
      }

      return {
        restoredFrom: candidate,
        backupsChecked: i + 1,
        rejectedBackups,
      };
    }

    // Ningún backup pasó integrity_check.
    throw new AppError({
      code: AppErrorCode.RESTORE_FAILED,
      userMessage:
        'Ninguna de las copias de seguridad disponibles superó la verificación de integridad. No se restauró nada.',
      technicalDetail: `All ${candidates.length} backups in ${input.backupDir} failed integrity_check`,
      context: { backupDir: input.backupDir, rejectedBackups },
    });
  }

  private async listBackupsNewestFirst(backupDir: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(backupDir);
    } catch {
      return [];
    }

    const backupFiles = entries.filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT));

    // Orden por NOMBRE (timestamp ISO embebido), no por mtime — ver la nota
    // extensa en BackupDatabaseUseCase.pruneOldBackups() sobre por qué mtime
    // no es confiable en Windows para archivos copiados con fs.copyFile.
    backupFiles.sort((a, b) => b.localeCompare(a)); // descendente: más reciente primero

    return backupFiles.map((f) => path.join(backupDir, f));
  }

  /** Abre una copia AISLADA (nunca el archivo candidato directamente en modo escritura persistente) y corre integrity_check. */
  private async verifyIntegrity(backupPath: string): Promise<boolean> {
    const db = new Database(backupPath);
    try {
      await db.open();
      const rows = await db.all<{ integrity_check: string }>('PRAGMA integrity_check;');
      return rows.length === 1 && rows[0].integrity_check === 'ok';
    } catch {
      return false;
    } finally {
      await db.close().catch(() => undefined);
    }
  }
}
