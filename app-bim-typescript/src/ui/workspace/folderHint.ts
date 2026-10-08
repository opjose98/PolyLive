// =============================================================================
// folderHint.ts — Aviso antes del selector de carpetas de Android
// =============================================================================

import { willAskForFolder } from '../../native/export/saveToUserFolder';
import { toast } from '../primitives';

/**
 * Android no deja guardar directamente en Descargas ni en Documentos: hay que
 * elegir (o crear) una carpeta dentro. Se avisa ANTES del selector, la primera vez.
 */
export async function folderHint(): Promise<void> {
  if (await willAskForFolder()) {
    toast('Elige o crea una carpeta (p. ej. "PolyLive" dentro de Descargas): Android no permite usar Descargas directamente', {
      kind: 'info',
      durationMs: 4500,
    });
  }
}

