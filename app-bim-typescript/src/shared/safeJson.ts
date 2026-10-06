// =============================================================================
// safeJson.ts — Lectura tolerante de filas con JSON
// =============================================================================
//
// Una fila con JSON corrupto (escritura interrumpida, migración a mano) no debe
// dejar inabrible el espacio entero: se salta, se informa en el diagnóstico y
// el resto se carga.
// =============================================================================

import { diagnostics } from './diagnostics';

export class CorruptRowError extends Error {
  constructor(
    readonly table: string,
    readonly rowId: string,
    cause: unknown,
  ) {
    super(`Fila corrupta en ${table} (${rowId}): ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CorruptRowError';
  }
}

/** JSON.parse que lanza un error con la tabla y la fila (para saltarla con `mapTolerant`). */
export function parseRowJson<T = unknown>(text: string | null | undefined, table: string, rowId: string): T {
  try {
    return JSON.parse(text ?? 'null') as T;
  } catch (err) {
    throw new CorruptRowError(table, rowId, err);
  }
}

/** JSON.parse con valor por defecto (para campos opcionales: la fila sigue siendo útil). */
export function parseJsonOr<T>(text: string | null | undefined, fallback: T, context?: string): T {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    if (context) diagnostics.warn('json', `JSON ilegible en ${context}; se usa el valor por defecto`, err);
    return fallback;
  }
}

/**
 * Convierte filas en objetos saltando las que no se pueden leer. Cada fila
 * saltada queda en el diagnóstico con su tabla e id.
 */
export function mapTolerant<R, T>(rows: readonly R[], map: (row: R) => T, table: string, idOf: (row: R) => string): T[] {
  const out: T[] = [];
  for (const row of rows) {
    try {
      out.push(map(row));
    } catch (err) {
      diagnostics.error(table, `Se omitió una fila ilegible (${idOf(row)})`, err);
    }
  }
  return out;
}
