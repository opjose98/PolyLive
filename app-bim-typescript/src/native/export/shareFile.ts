// =============================================================================
// shareFile.ts — Compartir un archivo generado (WhatsApp, correo, Drive…)
// =============================================================================
//
// La hoja de compartir del sistema necesita un archivo local (file://): se
// escribe en la caché de la app y se comparte desde allí.
// =============================================================================

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareFile(
  filename: string,
  data: string,
  opts: { base64?: boolean; mimeType?: string; dialogTitle?: string } = {},
): Promise<{ ok: true } | { ok: false; reason: 'unavailable' | 'failed'; detail?: string }> {
  if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
  try {
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, data, {
      encoding: opts.base64 ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, { mimeType: opts.mimeType, dialogTitle: opts.dialogTitle });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Comparte un archivo que ya está en disco (p. ej. el PDF que generó expo-print). */
export async function shareExistingFile(uri: string, mimeType?: string, dialogTitle?: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
  return true;
}
