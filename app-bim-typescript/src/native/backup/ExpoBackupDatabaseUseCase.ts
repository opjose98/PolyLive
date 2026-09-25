// =============================================================================
// ExpoBackupDatabaseUseCase.ts — Copia de seguridad rotacional en dispositivo
// Basado en: backup-integridad.md, application/use-cases/BackupDatabaseUseCase.ts
// (variante Node/sqlite3 — esta es la variante Expo/dispositivo)
// =============================================================================
//
// ESTRATEGIA: VACUUM INTO (backup atómico nativo de SQLite)
//
// La versión anterior usaba una cadena de 4 pasos frágil:
//   1. PRAGMA wal_checkpoint(FULL)
//   2. serializeAsync()  →  sqlite3_serialize() captura solo páginas del
//      archivo principal, NO el WAL
//   3. deserializeDatabaseAsync() + PRAGMA integrity_check
//   4. writeAsStringAsync() con encoding Base64
//
// El problema: entre los awaits del paso 1 y 2, el event loop de JS puede
// ejecutar otras operaciones async de ObjectStore que escriben al WAL.
// serialize() captura el archivo principal (sin esas escrituras nuevas) pero
// con la cabecera WAL-mode activa → el deserialize ve una base que "debería"
// tener WAL pero no lo tiene → integrity_check falla.
//
// VACUUM INTO resuelve todo de un golpe:
// - Es atómico: lee un snapshot consistente internamente
// - Produce un archivo standalone en rollback-journal mode (sin WAL)
// - Funciona mientras otras conexiones leen/escriben
// - Evita el overhead de pasar toda la DB como Uint8Array por el bridge JS
// - Disponible desde SQLite 3.27.0; expo-sqlite empaqueta 3.45+
//
// LA RESTAURACIÓN vive en ExpoRestoreDatabaseUseCase (mismo directorio). La
// cabecera de este archivo afirmaba que era imposible porque "expo-sqlite no
// expone API pública para cargar un backup sobre una base ya existente": es
// cierto y es irrelevante, porque restaurar no necesita ninguna API de SQLite
// — una base es un archivo, y expo-file-system sabe copiarlo. Ver los detalles
// (y el asunto de los sidecars WAL) en ExpoRestoreDatabaseUseCase.ts.
// =============================================================================

import * as FileSystem from 'expo-file-system';
import { IDatabase } from '../../infrastructure/sqlite/database';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

const BACKUP_PREFIX = 'polylive-backup-';
const BACKUP_EXT = '.db';

export interface ExpoBackupDatabaseInput {
  /**
   * Base de datos ABIERTA a respaldar.
   *
   * Basta el contrato genérico `IDatabase`: con la estrategia VACUUM INTO lo
   * único que se necesita es `exec()`. La versión anterior pedía el tipo
   * concreto `ExpoSQLiteDatabase` porque llamaba a `serializeAsync()`, que no
   * forma parte de `IDatabase` — y eso obligaba a SettingsScreen a hacer un
   * `instanceof` y a negar el backup manual fuera del dispositivo.
   */
  db: IDatabase;
  /** Carpeta donde persistir los backups — por defecto `${documentDirectory}backups/`. */
  backupDir?: string;
  /** Máximo de backups a conservar (por defecto 5, igual que la variante Node). */
  maxBackups?: number;
}

export interface ExpoBackupDatabaseOutput {
  backupPath: string;
  prunedPaths: string[];
}

export class ExpoBackupDatabaseUseCase {
  async execute(input: ExpoBackupDatabaseInput): Promise<ExpoBackupDatabaseOutput> {
    const backupDir = input.backupDir ?? `${FileSystem.documentDirectory}backups/`;
    const maxBackups = input.maxBackups ?? 5;

    try {
      // 1. Asegurar que el directorio de backups existe.
      await this.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const uniqueSuffix = Math.random().toString(36).slice(2, 8);
      const backupPath = `${backupDir}${BACKUP_PREFIX}${timestamp}-${uniqueSuffix}${BACKUP_EXT}`;

      // 2. Crear backup atómico via VACUUM INTO.
      //
      // VACUUM INTO es la primitiva nativa de SQLite para backups atómicos.
      // Lee un snapshot consistente de la base (incluyendo contenido WAL),
      // lo escribe como un archivo SQLite standalone en journal-mode DELETE
      // (sin dependencia de WAL), y lo hace en una sola operación atómica
      // en el lado nativo — sin pasar bytes por el bridge JS.
      //
      // Requiere ruta nativa del filesystem (sin prefijo file://).
      const nativePath = backupPath.replace(/^file:\/\//, '');

      // Escapar comillas simples en la ruta para evitar inyección SQL
      // (la ruta la generamos nosotros, pero defensa en profundidad).
      const escapedPath = nativePath.replace(/'/g, "''");
      await input.db.exec(`VACUUM INTO '${escapedPath}';`);

      // 3. Verificación ligera: confirmar que el archivo fue creado y tiene
      //    tamaño > 0. VACUUM INTO garantiza consistencia por diseño — no
      //    necesitamos deserializar + integrity_check (que era la fuente
      //    del falso negativo original).
      const fileInfo = await FileSystem.getInfoAsync(backupPath);
      if (!fileInfo.exists || (fileInfo as { size?: number }).size === 0) {
        throw new AppError({
          code: AppErrorCode.BACKUP_FAILED,
          userMessage: 'La copia de seguridad no se creó correctamente.',
          technicalDetail: `VACUUM INTO completed but backup file is missing or empty at ${nativePath}`,
        });
      }

      // 4. Rotación: conservar los `maxBackups` más recientes (por nombre —
      //    ver la nota extensa en application/use-cases/BackupDatabaseUseCase.ts
      //    sobre por qué mtime no es confiable para esta rotación).
      const prunedPaths = await this.pruneOldBackups(backupDir, maxBackups);

      return { backupPath, prunedPaths };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.wrap(err, AppErrorCode.BACKUP_FAILED, 'No se pudo crear la copia de seguridad.', {
        backupDir,
      });
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  private async pruneOldBackups(backupDir: string, maxBackups: number): Promise<string[]> {
    const entries = await FileSystem.readDirectoryAsync(backupDir);
    const backupFiles = entries.filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT));

    backupFiles.sort((a, b) => b.localeCompare(a)); // descendente: más reciente primero (timestamp ISO en el nombre)

    const toPrune = backupFiles.slice(maxBackups).map((f) => `${backupDir}${f}`);
    for (const path of toPrune) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
    return toPrune;
  }
}
