// =============================================================================
// ExpoSQLiteDatabase.ts — Implementación de IDatabase sobre expo-sqlite
// Basado en: infrastructure/sqlite/database.ts (contrato IDatabase)
// =============================================================================
//
// POR QUÉ EXISTE ESTE ARCHIVO:
// `infrastructure/sqlite/database.ts` (`Database`) usa el paquete npm
// `sqlite3` — un addon nativo de Node que funciona en Jest pero que NO
// puede cargarse en el runtime de React Native/Hermes de un dispositivo
// real (no hay Node aquí, y `sqlite3` requiere bindings nativos de Node-API
// que Hermes no provee). `expo-sqlite` SÍ está declarado en package.json
// como dependencia — pero hasta ahora ningún archivo en src/ lo usaba.
// Esta clase cierra ese hueco: implementa el mismo contrato `IDatabase` que
// `Database`, así que `ObjectStore` y todos los UseCases funcionan sin
// cambios sobre cualquiera de las dos — solo cambia qué se instancia en el
// punto de entrada de la app (`src/ui/App.tsx`) según la plataforma.
//
// INVARIANTES (idénticas a Database, mismo contrato):
// - WAL mode + foreign keys + busy_timeout, igual que la versión Node.
// - transaction() usa withTransactionAsync (BEGIN/COMMIT/ROLLBACK
//   automáticos que provee expo-sqlite — no reimplementamos ese manejo).
// =============================================================================

import * as SQLite from 'expo-sqlite';
import { runMigrations } from '../../infrastructure/sqlite/migrations';
import { IDatabase } from '../../infrastructure/sqlite/database';

export class ExpoSQLiteDatabase implements IDatabase {
  private db: SQLite.SQLiteDatabase | null = null;
  private readonly dbName: string;

  /** `dbName` es el nombre lógico que expo-sqlite resuelve dentro del sandbox de la app (no una ruta de archivo). */
  constructor(dbName: string = 'polylive.db') {
    this.dbName = dbName;
  }

  async open(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(this.dbName);
    await this.exec('PRAGMA journal_mode = WAL;');
    await this.exec('PRAGMA busy_timeout = 5000;');
    await this.exec('PRAGMA foreign_keys = ON;');
  }

  async close(): Promise<void> {
    if (!this.db) return;
    await this.db.closeAsync();
    this.db = null;
  }

  /** Lleva el esquema a la última versión (ver infrastructure/sqlite/migrations.ts). */
  async migrate(): Promise<void> {
    await runMigrations(this);
  }

  async exec(sql: string): Promise<void> {
    await this.getDb().execAsync(sql);
  }

  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.getDb().getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
  }

  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const row = await this.getDb().getFirstAsync<T>(sql, params as SQLite.SQLiteBindParams);
    return row ?? undefined;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastID: number }> {
    const result = await this.getDb().runAsync(sql, params as SQLite.SQLiteBindParams);
    return { changes: result.changes, lastID: result.lastInsertRowId };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    let result: T;

    // BUG CORREGIDO: la versión anterior capturaba el error de `fn()` DENTRO
    // de la callback y no lo re-lanzaba, para poder propagar el error original
    // después. El efecto era el contrario al buscado: `withTransactionAsync`
    // decide COMMIT vs ROLLBACK según si su callback lanza — al tragarnos el
    // error, la callback terminaba "bien" y expo-sqlite hacía COMMIT de una
    // transacción fallida. Las escrituras parciales de un UseCase que abortó a
    // mitad (p. ej. un UseCase fallando la validación tras haber escrito
    // el Room) quedaban persistidas.
    //
    // La forma correcta es dejar que el error atraviese la callback (para que
    // haya ROLLBACK) y re-lanzarlo fuera. `withTransactionAsync` re-lanza el
    // error de la callback tras el rollback, así que el error original llega
    // intacto al llamador sin necesidad de capturarlo.
    await this.getDb().withTransactionAsync(async () => {
      result = await fn();
    });

    return result!;
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('ExpoSQLiteDatabase not open. Call open() first.');
    }
    return this.db;
  }
}
