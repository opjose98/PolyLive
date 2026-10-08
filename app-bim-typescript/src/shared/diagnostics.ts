// =============================================================================
// diagnostics.ts — Registro de diagnóstico de la app
// =============================================================================
//
// Un solo lugar para lo que antes se perdía en `console.warn` o en un
// `catch {}`: filas corruptas que se saltaron, respaldos fallidos, errores
// no capturados. Guarda las últimas entradas en memoria; la capa nativa se
// suscribe y las persiste en un archivo rotativo que el operador puede enviar
// ("Enviar diagnóstico"). Sin servicios externos.
// =============================================================================

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  readonly at: string;
  readonly level: DiagnosticLevel;
  /** De dónde viene: 'ObjectStore', 'backup', 'export-ifc', 'global'… */
  readonly source: string;
  readonly message: string;
  readonly detail?: string;
}

const MAX_ENTRIES = 500;
const entries: DiagnosticEntry[] = [];
const listeners = new Set<(e: DiagnosticEntry) => void>();

function detailOf(err: unknown): string | undefined {
  if (err === undefined) return undefined;
  if (err instanceof Error) return `${err.name}: ${err.message}${err.stack ? `\n${err.stack.split('\n').slice(1, 6).join('\n')}` : ''}`;
  try {
    return typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function record(level: DiagnosticLevel, source: string, message: string, err?: unknown): DiagnosticEntry {
  const e: DiagnosticEntry = { at: new Date().toISOString(), level, source, message, detail: detailOf(err) };
  entries.push(e);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const l of listeners) {
    try {
      l(e);
    } catch {
      // Un oyente roto (p. ej. el archivo de log) no debe tumbar a quien informa.
    }
  }
  return e;
}

export const diagnostics = {
  info: (source: string, message: string, err?: unknown) => record('info', source, message, err),
  warn: (source: string, message: string, err?: unknown) => record('warn', source, message, err),
  error: (source: string, message: string, err?: unknown) => record('error', source, message, err),
  /** Copia de las entradas en memoria (más antiguas primero). */
  entries: (): readonly DiagnosticEntry[] => [...entries],
  subscribe(l: (e: DiagnosticEntry) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Solo para tests. */
  clear(): void {
    entries.length = 0;
  },
};

/** Una línea de texto por entrada (para el archivo y para "Enviar diagnóstico"). */
export function formatEntry(e: DiagnosticEntry): string {
  return `${e.at} ${e.level.toUpperCase()} [${e.source}] ${e.message}${e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : ''}`;
}
