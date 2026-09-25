// =============================================================================
// ExpoSQLiteDatabase.test.ts — Verifica la capa de traducción hacia expo-sqlite
// =============================================================================
//
// Como expo-sqlite es un módulo nativo (mockeado en
// test/__mocks__/expo-sqlite.ts), estos tests NO verifican el motor SQL en
// sí — verifican que ExpoSQLiteDatabase llama a la API de expo-sqlite
// correctamente y mapea las respuestas al contrato IDatabase tal como lo
// espera ObjectStore (mismo contrato que la implementación Node `Database`).
// =============================================================================

import { ExpoSQLiteDatabase } from '../../../src/native/sqlite/ExpoSQLiteDatabase';
import { ALL_DDL } from '../../../src/infrastructure/sqlite/schema';
// Importado por ruta relativa (no 'expo-sqlite') porque `mockDb` es un
// export propio del mock para inspección en tests — no existe en el
// paquete real, así que el nombre 'expo-sqlite' (resuelto por moduleNameMapper
// en runtime) no lo expone a nivel de tipos.
import { mockDb, openDatabaseAsync } from '../../__mocks__/expo-sqlite';

describe('ExpoSQLiteDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('open() abre la base y configura WAL + foreign_keys + busy_timeout', async () => {
    const db = new ExpoSQLiteDatabase('test.db');
    await db.open();

    expect(openDatabaseAsync).toHaveBeenCalledWith('test.db');
    expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('WAL'));
    expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('foreign_keys'));
    expect(mockDb.execAsync).toHaveBeenCalledWith(expect.stringContaining('busy_timeout'));
  });

  it('get() usa getFirstAsync y convierte null a undefined (contrato IDatabase)', async () => {
    (mockDb.getFirstAsync as jest.Mock).mockResolvedValueOnce(null);
    const db = new ExpoSQLiteDatabase();
    await db.open();

    const row = await db.get('SELECT * FROM revit_objects WHERE id = ?', ['wall-1']);

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith('SELECT * FROM revit_objects WHERE id = ?', ['wall-1']);
    expect(row).toBeUndefined();
  });

  it('get() retorna la fila cuando getFirstAsync sí encuentra resultado', async () => {
    (mockDb.getFirstAsync as jest.Mock).mockResolvedValueOnce({ id: 'wall-1' });
    const db = new ExpoSQLiteDatabase();
    await db.open();

    const row = await db.get<{ id: string }>('SELECT * FROM revit_objects WHERE id = ?', ['wall-1']);
    expect(row).toEqual({ id: 'wall-1' });
  });

  it('all() delega en getAllAsync con los mismos parámetros', async () => {
    (mockDb.getAllAsync as jest.Mock).mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    const db = new ExpoSQLiteDatabase();
    await db.open();

    const rows = await db.all('SELECT * FROM revit_objects WHERE room_id = ?', ['room-1']);

    expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM revit_objects WHERE room_id = ?', ['room-1']);
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('run() mapea lastInsertRowId → lastID (contrato IDatabase, igual que sqlite3)', async () => {
    (mockDb.runAsync as jest.Mock).mockResolvedValueOnce({ changes: 1, lastInsertRowId: 42 });
    const db = new ExpoSQLiteDatabase();
    await db.open();

    const result = await db.run('INSERT INTO revit_objects (id) VALUES (?)', ['wall-1']);

    expect(result).toEqual({ changes: 1, lastID: 42 });
  });

  it('transaction() ejecuta la función dentro de withTransactionAsync y retorna su valor', async () => {
    const db = new ExpoSQLiteDatabase();
    await db.open();

    const result = await db.transaction(async () => 'ok');

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(result).toBe('ok');
  });

  it('transaction() propaga el error de la función al llamador (no lo traga)', async () => {
    const db = new ExpoSQLiteDatabase();
    await db.open();

    await expect(
      db.transaction(async () => {
        throw new Error('constraint violation');
      }),
    ).rejects.toThrow('constraint violation');
  });

  it('transaction() deja que el error ATRAVIESE la callback de withTransactionAsync — es lo que dispara el ROLLBACK', async () => {
    // REGRESIÓN: la implementación anterior capturaba el error dentro de la
    // callback y lo re-lanzaba fuera. El llamador veía el error igual (el test
    // de arriba pasaba), pero expo-sqlite veía una callback que terminó bien
    // y hacía COMMIT de una transacción fallida. Este test mira lo que el test
    // anterior no puede ver: si la callback REALMENTE rechaza.
    const db = new ExpoSQLiteDatabase();
    await db.open();

    await expect(
      db.transaction(async () => {
        throw new Error('constraint violation');
      }),
    ).rejects.toThrow('constraint violation');

    const callback = (mockDb.withTransactionAsync as jest.Mock).mock.calls[0][0];
    await expect(callback()).rejects.toThrow('constraint violation');
  });

  it('migrate() ejecuta todas las sentencias DDL del schema', async () => {
    const db = new ExpoSQLiteDatabase();
    await db.open();
    jest.clearAllMocks();

    await db.migrate();

    // Se comprueba contra ALL_DDL en vez de contra un número escrito a mano:
    // la versión anterior fijaba "8" y cada tabla nueva del schema rompía este
    // test sin que hubiera nada roto en el código.
    expect(mockDb.execAsync).toHaveBeenCalledTimes(ALL_DDL.length);
  });

  it('close() cierra la conexión y un get() posterior falla con mensaje claro', async () => {
    const db = new ExpoSQLiteDatabase();
    await db.open();
    await db.close();

    expect(mockDb.closeAsync).toHaveBeenCalledTimes(1);
    await expect(db.get('SELECT 1')).rejects.toThrow('not open');
  });

  it('operar sin abrir primero falla con mensaje claro en vez de un TypeError críptico', async () => {
    const db = new ExpoSQLiteDatabase();
    await expect(db.get('SELECT 1')).rejects.toThrow('not open');
  });
});
