// =============================================================================
// ExpoRestoreDatabaseUseCase.ts — Restauración de la base en el dispositivo
// Basado en: backup-integridad.md, escenarios-recuperacion.md
// (variante Node/sqlite3: application/use-cases/RestoreDatabaseUseCase.ts)
// =============================================================================
//
// GAP CERRADO: la restauración en dispositivo estaba declarada explícitamente
// como FUERA DE ALCANCE en la cabecera de ExpoBackupDatabaseUseCase, con el
// argumento de que "expo-sqlite no expone API pública para cargar un backup
// sobre una base con nombre ya existente en disco". Eso es cierto, y también
// es irrelevante: la restauración no necesita ninguna API de SQLite.
//
// Una base SQLite es UN ARCHIVO. `expo-sqlite` lo coloca en una ruta conocida
// y estable dentro del sandbox de la app — `${documentDirectory}SQLite/<nombre>` —
// y `expo-file-system` sabe copiar archivos. Restaurar es:
//
//   1. cerrar la conexión (obligatorio: sobrescribir el archivo de una base
//      con una conexión viva es la forma más directa de corromperla, que es
//      justo lo que esto viene a arreglar)
//   2. borrar los sidecars -wal y -shm (ver la nota extensa abajo: sin esto
//      la restauración parece funcionar y luego resucita datos del estado que
//      se intentaba descartar)
//   3. copiar el backup sobre el archivo principal
//   4. reiniciar la app, porque todo el árbol de React tiene referencias a
//      servicios construidos sobre la conexión vieja
//
// El resultado era un producto que hacía copias de seguridad que NADIE podía
// restaurar desde el dispositivo — es decir, en la práctica, sin copias.
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

const BACKUP_PREFIX = 'polylive-backup-';
const BACKUP_EXT = '.db';

/** Carpeta donde expo-sqlite materializa las bases de datos de la app. */
export function sqliteDirectory(): string {
  return `${FileSystem.documentDirectory}SQLite/`;
}

/** Ruta del archivo de una base abierta por nombre lógico con expo-sqlite. */
export function databaseFilePath(dbName: string): string {
  return `${sqliteDirectory()}${dbName}`;
}

interface ExpoRestoreDatabaseInput {
  /** Nombre lógico de la base, el mismo que se pasa a ExpoSQLiteDatabase. */
  dbName: string;
  /** Carpeta de backups — por defecto la misma que usa ExpoBackupDatabaseUseCase. */
  backupDir?: string;
  /** Backup concreto a restaurar. Si se omite, el más reciente por nombre. */
  backupPath?: string;
}

interface ExpoRestoreDatabaseOutput {
  restoredFrom: string;
  /** Sidecars WAL/SHM que se eliminaron como parte de la restauración. */
  removedSidecars: string[];
}

export interface BackupEntry {
  path: string;
  name: string;
  sizeBytes: number;
  /** Fecha extraída del NOMBRE del archivo, no del mtime — ver la nota abajo. */
  createdAt: Date | null;
}

export class ExpoRestoreDatabaseUseCase {
  /**
   * Lista los backups disponibles, del más reciente al más antiguo.
   *
   * ORDENA POR NOMBRE, no por mtime: el nombre lleva un timestamp ISO que se
   * escribió en el momento de crear el backup, mientras que el mtime lo puede
   * reescribir cualquier cosa (una sincronización, una copia, una restauración
   * del propio sistema operativo). Misma decisión que la rotación del backup.
   */
  async listBackups(backupDir?: string): Promise<BackupEntry[]> {
    const dir = backupDir ?? `${FileSystem.documentDirectory}backups/`;

    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) return [];

    const names = (await FileSystem.readDirectoryAsync(dir))
      .filter((n) => n.startsWith(BACKUP_PREFIX) && n.endsWith(BACKUP_EXT))
      .sort((a, b) => b.localeCompare(a));

    const entries: BackupEntry[] = [];
    for (const name of names) {
      const path = `${dir}${name}`;
      const info = await FileSystem.getInfoAsync(path);
      entries.push({
        path,
        name,
        sizeBytes: (info as { size?: number }).size ?? 0,
        createdAt: parseTimestampFromName(name),
      });
    }
    return entries;
  }

  /**
   * Restaura la base desde un backup.
   *
   * PRECONDICIÓN: la conexión sobre esa base debe estar CERRADA. Este UseCase
   * no la cierra por su cuenta a propósito — no tiene la referencia, y cerrarla
   * desde aquí escondería el hecho de que todo lo construido encima (los
   * UseCases, el store, el editor) queda apuntando a una conexión muerta. El
   * llamador cierra, restaura y reinicia, en ese orden.
   */
  async execute(input: ExpoRestoreDatabaseInput): Promise<ExpoRestoreDatabaseOutput> {
    const source = input.backupPath ?? (await this.newestBackupPath(input.backupDir));

    const sourceInfo = await FileSystem.getInfoAsync(source);
    if (!sourceInfo.exists || (sourceInfo as { size?: number }).size === 0) {
      throw new AppError({
        code: AppErrorCode.RESTORE_FAILED,
        userMessage: 'La copia de seguridad elegida no existe o está vacía.',
        technicalDetail: `Backup missing or empty at ${source}`,
        context: { source },
      });
    }

    const target = databaseFilePath(input.dbName);

    try {
      // El directorio SQLite/ puede no existir si la app nunca abrió una base
      // (restaurar como primera acción tras reinstalar, por ejemplo).
      const sqliteDirInfo = await FileSystem.getInfoAsync(sqliteDirectory());
      if (!sqliteDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(sqliteDirectory(), { intermediates: true });
      }

      // Los sidecars del modo WAL (-wal y -shm) SE BORRAN antes de copiar.
      //
      // POR QUÉ ES IMPRESCINDIBLE: la app abre la base en WAL
      // (`PRAGMA journal_mode = WAL`), así que junto al archivo principal hay
      // un `-wal` con transacciones aún no integradas. Si se sustituye solo el
      // archivo principal, SQLite encuentra al abrir un `-wal` que pertenece a
      // OTRA base, con otro número de generación: en el mejor caso rechaza
      // abrirla, y en el peor aplica ese WAL encima del backup, resucitando
      // exactamente los datos que se querían descartar. El backup que produce
      // VACUUM INTO es un archivo autocontenido en journal-mode DELETE, así
      // que no necesita sidecars propios.
      const removedSidecars: string[] = [];
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = `${target}${suffix}`;
        const info = await FileSystem.getInfoAsync(sidecar);
        if (info.exists) {
          await FileSystem.deleteAsync(sidecar, { idempotent: true });
          removedSidecars.push(sidecar);
        }
      }

      // `copyAsync` sobrescribe el destino si existe.
      await FileSystem.copyAsync({ from: source, to: target });

      return { restoredFrom: source, removedSidecars };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.wrap(
        err,
        AppErrorCode.RESTORE_FAILED,
        'No se pudo restaurar la copia de seguridad.',
        { source, target },
      );
    }
  }

  private async newestBackupPath(backupDir?: string): Promise<string> {
    const backups = await this.listBackups(backupDir);
    if (backups.length === 0) {
      throw new AppError({
        code: AppErrorCode.RESTORE_FAILED,
        userMessage: 'No hay copias de seguridad disponibles para restaurar.',
        technicalDetail: 'listBackups() returned an empty list',
      });
    }
    return backups[0].path;
  }
}

/**
 * Extrae la fecha del nombre `polylive-backup-<ISO con : y . sustituidos por
 * ->-<sufijo>.db`. Devuelve `null` si el nombre no la lleva, en vez de una
 * fecha inventada: una fecha falsa en la lista de backups llevaría a restaurar
 * el archivo equivocado.
 */
export function parseTimestampFromName(name: string): Date | null {
  const match = name.match(
    /^polylive-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
  );
  if (!match) return null;

  const [, y, mo, d, h, mi, s, ms] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
