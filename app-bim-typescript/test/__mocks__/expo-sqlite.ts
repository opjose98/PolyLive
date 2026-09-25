// Mock: expo-sqlite (for Node test environment)
//
// expo-sqlite es un módulo nativo — no puede ejecutarse en Jest/Node.
// Este mock no reimplementa un motor SQL real: expone jest.fn() por método
// para que ExpoSQLiteDatabase.test.ts pueda verificar que la CAPA DE
// TRADUCCIÓN (nuestro código) llama a la API correcta con los argumentos
// correctos y mapea las respuestas al contrato IDatabase correctamente.
// La corrección del propio motor SQLite ya está cubierta por los tests que
// ejercen `Database` (sqlite3) contra un archivo real.

export const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
  closeAsync: jest.fn().mockResolvedValue(undefined),
  withTransactionAsync: jest.fn(async (task: () => Promise<void>) => {
    await task();
  }),
};

export const openDatabaseAsync = jest.fn().mockResolvedValue(mockDb);

export type SQLiteDatabase = typeof mockDb;
export type SQLiteBindParams = unknown[];
