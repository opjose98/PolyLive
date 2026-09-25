// =============================================================================
// database.ts — Inicialización y gestión de conexión SQLite
// =============================================================================

import sqlite3 from 'sqlite3';
import { ALL_DDL } from './schema';

/**
 * Contrato mínimo que necesita ObjectStore (y los UseCases que operan sobre
 * la base directamente, como Backup/RestoreDatabaseUseCase) de cualquier
 * implementación de acceso a SQLite.
 *
 * POR QUÉ EXISTE ESTA INTERFAZ:
 * `Database` (abajo) usa el paquete npm `sqlite3`, que es un addon nativo de
 * Node — funciona perfecto en Jest/Node (por eso toda la suite de tests lo
 * usa así) pero NO puede ejecutarse en el runtime de React Native/Hermes en
 * un dispositivo real. Para que la app funcione en Android, la capa Native
 * necesita una implementación equivalente sobre `expo-sqlite`
 * (ver `src/native/sqlite/ExpoSQLiteDatabase.ts`) sin que ObjectStore ni los
 * UseCases tengan que saber cuál de las dos está usando.
 */
export interface IDatabase {
  open(): Promise<void>;
  close(): Promise<void>;
  migrate(): Promise<void>;
  exec(sql: string): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastID: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Wrapper sobre sqlite3.Database que expone métodos promisificados.
 *
 * ÁMBITO: Node.js (tests, herramientas de escritorio/CLI). Para React
 * Native/Expo en un dispositivo real, usar `ExpoSQLiteDatabase` — ambas
 * implementan `IDatabase`.
 *
 * CONFIGURACIÓN:
 * - WAL mode para recuperación y escrituras concurrentes
 * - Foreign keys habilitadas (SQLite las desactiva por defecto)
 * - Busy timeout de 5s para evitar SQLITE_BUSY
 */
export class Database implements IDatabase {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  /** Abre la conexión y configura pragmas. */
  async open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    }).then(async () => {
      // Configurar pragmas para rendimiento y seguridad
      await this.exec('PRAGMA journal_mode = WAL;');
      await this.exec('PRAGMA busy_timeout = 5000;');
      await this.exec('PRAGMA foreign_keys = ON;');
    });
  }

  /** Cierra la conexión. */
  async close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) return reject(err);
        this.db = null;
        resolve();
      });
    });
  }

  /** Crea todas las tablas si no existen. */
  async migrate(): Promise<void> {
    for (const ddl of ALL_DDL) {
      await this.exec(ddl);
    }
  }

  // -------------------------------------------------------------------------
  // Métodos promisificados sobre sqlite3
  // -------------------------------------------------------------------------

  /** Ejecuta SQL sin retorno de filas (CREATE, INSERT, UPDATE, DELETE). */
  async exec(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.getDb().exec(sql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  /** Ejecuta un prepared statement y retorna todas las filas. */
  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.getDb().all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows as T[]);
      });
    });
  }

  /** Ejecuta un prepared statement y retorna la primera fila o undefined. */
  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.getDb().get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row as T | undefined);
      });
    });
  }

  /** Ejecuta un prepared statement (INSERT/UPDATE/DELETE) y retorna changes. */
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastID: number }> {
    return new Promise((resolve, reject) => {
      this.getDb().run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  /** Ejecuta una función dentro de una transacción ACID. Rollback automático si falla. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec('BEGIN TRANSACTION;');
    try {
      const result = await fn();
      await this.exec('COMMIT;');
      return result;
    } catch (err) {
      await this.exec('ROLLBACK;');
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Interno
  // -------------------------------------------------------------------------

  private getDb(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not open. Call open() first.');
    }
    return this.db;
  }
}
