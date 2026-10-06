// =============================================================================
// diagnosticsLog.ts — El registro de diagnóstico en un archivo, y "Enviar diagnóstico"
// =============================================================================
//
// Las entradas de `shared/diagnostics` se guardan en un archivo de la app
// (las últimas 500, entre sesiones). Los errores no capturados de JavaScript
// también entran. "Enviar diagnóstico" comparte el archivo (correo, WhatsApp)
// para que un error en el teléfono de un usuario deje de ser invisible.
// Nada sale del teléfono sin que el usuario lo comparta.
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { DiagnosticEntry, diagnostics, formatEntry, record } from '../../shared/diagnostics';
import { shareFile } from '../export/shareFile';

const FILE = `${FileSystem.documentDirectory}diagnostics.jsonl`;
const KEEP = 500;

let history: DiagnosticEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flushSoon(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const all = [...history, ...diagnostics.entries()].slice(-KEEP);
    void FileSystem.writeAsStringAsync(FILE, all.map((e) => JSON.stringify(e)).join('\n')).catch(() => undefined);
  }, 1500);
}

/** Carga el registro de sesiones anteriores, empieza a guardar y captura los errores no controlados. */
export async function startDiagnosticsLog(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (info.exists) {
      history = (await FileSystem.readAsStringAsync(FILE))
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l) as DiagnosticEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is DiagnosticEntry => e !== null)
        .slice(-KEEP);
    }
  } catch {
    history = [];
  }
  diagnostics.subscribe(flushSoon);

  // Errores de JavaScript no capturados (fuera de React): se registran y se
  // deja actuar al manejador anterior (pantalla roja en desarrollo).
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (eu) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((err, fatal) => {
      record(fatal ? 'error' : 'warn', 'global', fatal ? 'Error fatal no controlado' : 'Error no controlado', err);
      previous(err, fatal);
    });
  }
}

/** Texto del diagnóstico: cabecera del dispositivo + entradas (más antiguas primero). */
export function diagnosticsText(meta: { app: string; schema: number; operator?: string }): string {
  const all = [...history, ...diagnostics.entries()].slice(-KEEP);
  const head = [
    `PolyLive BIM ${meta.app} · esquema v${meta.schema}`,
    `Android ${String(Platform.Version)} · ${new Date().toISOString()}`,
    meta.operator ? `Operador: ${meta.operator}` : '',
    `${all.length} entradas`,
    '',
  ].filter((l, i) => l || i === 4);
  return [...head, ...all.map(formatEntry)].join('\n');
}

export async function shareDiagnostics(meta: { app: string; schema: number; operator?: string }): Promise<boolean> {
  const r = await shareFile(`polylive-diagnostico-${Date.now()}.txt`, diagnosticsText(meta), {
    mimeType: 'text/plain',
    dialogTitle: 'Enviar diagnóstico',
  });
  return r.ok;
}
