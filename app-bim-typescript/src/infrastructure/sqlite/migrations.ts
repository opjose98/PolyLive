// =============================================================================
// migrations.ts — Esquema versionado (PRAGMA user_version)
// =============================================================================
//
// Cada migración lleva la base de la versión N−1 a la N dentro de UNA
// transacción, junto con el `user_version`: si algo falla, la base queda en la
// versión anterior intacta y la app lo informa (no hay medias migraciones).
//
// Reglas:
//   · las migraciones solo se AGREGAN al final; nunca se editan las ya publicadas;
//   · deben ser idempotentes (una instalación vieja puede tener ya la tabla);
//   · un cambio de columna se hace con ALTER TABLE … ADD COLUMN, o con tabla
//     nueva + copia + rename si SQLite no permite el cambio.
//
// v1 = el esquema creado con `CREATE TABLE IF NOT EXISTS` hasta octubre 2026.
// Las instalaciones de antes del versionado están en user_version 0 y con todas
// las tablas: la v1 es idempotente sobre ellas y no toca datos.
// =============================================================================

import { ALL_DDL } from './schema';

/** Lo mínimo que necesita una migración de la base. */
export interface MigrationDb {
  exec(sql: string): Promise<void>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastID: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: MigrationDb): Promise<void>;
}

/** ¿La tabla tiene la columna? (para migraciones idempotentes de ADD COLUMN). */
export async function hasColumn(db: MigrationDb, table: string, column: string): Promise<boolean> {
  const cols = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'Esquema base (proyectos, objetos, fotos, niveles, georreferencia, recintos, avance, revisión, dibujo)',
    async up(db) {
      for (const ddl of ALL_DDL) await db.exec(ddl);
    },
  },
  {
    version: 2,
    name: 'Medidas: semántica (cara interior / exterior / eje) y muro afectado',
    async up(db) {
      // Qué se midió y cómo: la longitud de eje se deriva de esto (B3).
      if (!(await hasColumn(db, 'measurements', 'reference'))) {
        await db.exec(`ALTER TABLE measurements ADD COLUMN reference TEXT NOT NULL DEFAULT 'axis'`);
      }
      if (!(await hasColumn(db, 'measurements', 'applied_length'))) {
        await db.exec(`ALTER TABLE measurements ADD COLUMN applied_length REAL`);
      }
    },
  },
  {
    version: 3,
    name: 'Proyectos: fecha del último paquete exportado (respaldo fuera del teléfono)',
    async up(db) {
      if (!(await hasColumn(db, 'projects', 'last_package_at'))) {
        await db.exec(`ALTER TABLE projects ADD COLUMN last_package_at TEXT`);
      }
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export class MigrationError extends Error {
  constructor(
    readonly version: number,
    readonly migrationName: string,
    cause: unknown,
  ) {
    super(`Falló la migración ${version} (${migrationName}): ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'MigrationError';
  }
}

/** Versión actual del esquema de la base. */
export async function schemaVersion(db: MigrationDb): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return Number(row?.user_version ?? 0);
}

/**
 * Lleva la base a la última versión. Devuelve de qué versión a cuál pasó.
 * Una base MÁS NUEVA que esta app (se instaló una versión anterior encima)
 * no se toca y se informa: abrirla podría perder datos.
 */
export async function runMigrations(
  db: MigrationDb,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<{ from: number; to: number; applied: number[] }> {
  const from = await schemaVersion(db);
  const latest = migrations.length ? migrations[migrations.length - 1].version : 0;
  if (from > latest) {
    throw new MigrationError(from, 'base más nueva que la app', new Error(`la base está en v${from} y esta versión de la app solo conoce hasta v${latest}`));
  }
  const applied: number[] = [];
  for (const m of migrations) {
    if (m.version <= from) continue;
    try {
      await db.transaction(async () => {
        await m.up(db);
        await db.exec(`PRAGMA user_version = ${m.version}`);
      });
      applied.push(m.version);
    } catch (err) {
      throw new MigrationError(m.version, m.name, err);
    }
  }
  return { from, to: await schemaVersion(db), applied };
}
