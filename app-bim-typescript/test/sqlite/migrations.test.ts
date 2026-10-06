// =============================================================================
// migrations.test.ts — Esquema versionado sobre SQLite real
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ALL_DDL } from '../../src/infrastructure/sqlite/schema';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  Migration,
  MigrationError,
  hasColumn,
  runMigrations,
  schemaVersion,
} from '../../src/infrastructure/sqlite/migrations';

describe('Migraciones de esquema', () => {
  let dbPath: string;
  let db: Database;
  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `mig-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
  });
  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('una base nueva queda en la última versión con todas las tablas', async () => {
    await db.migrate();
    expect(await schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = (await db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t) => t.name);
    for (const t of ['revit_objects', 'audit_photos', 'projects', 'zones', 'draft_items', 'measurements']) expect(tables).toContain(t);
    expect(await hasColumn(db, 'measurements', 'reference')).toBe(true);
  });

  it('una instalación anterior al versionado (v0 con tablas y datos) migra sin perder nada', async () => {
    for (const ddl of ALL_DDL) await db.exec(ddl);
    await db.run(`INSERT INTO measurements (id, room_id, wall_id, capture_method, average) VALUES ('m1', 'r1', 'w1', 'manual', 3.2)`);
    expect(await schemaVersion(db)).toBe(0);
    const r = await runMigrations(db);
    expect(r).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    const row = await db.get<{ average: number; reference: string }>(`SELECT average, reference FROM measurements WHERE id = 'm1'`);
    expect(row).toEqual({ average: 3.2, reference: 'axis' });
  });

  it('migrar dos veces no hace nada la segunda', async () => {
    await db.migrate();
    const r = await runMigrations(db);
    expect(r.applied).toEqual([]);
    expect(r.to).toBe(LATEST_SCHEMA_VERSION);
  });

  it('una migración que falla se revierte entera y la versión no avanza', async () => {
    await db.migrate();
    const bad: Migration = {
      version: LATEST_SCHEMA_VERSION + 1,
      name: 'rompe a mitad',
      async up(d) {
        await d.exec(`CREATE TABLE temporal (x INTEGER)`);
        await d.exec(`INSERT INTO tabla_que_no_existe VALUES (1)`);
      },
    };
    await expect(runMigrations(db, [...MIGRATIONS, bad])).rejects.toBeInstanceOf(MigrationError);
    expect(await schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = (await db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE name = 'temporal'`)).length;
    expect(tables).toBe(0);
  });

  it('una base más nueva que la app no se toca', async () => {
    await db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 5}`);
    await expect(runMigrations(db)).rejects.toThrow(/más nueva/);
    expect(await schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 5);
  });

  it('las versiones son consecutivas desde 1', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
