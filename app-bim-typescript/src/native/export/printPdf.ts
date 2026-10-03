// =============================================================================
// printPdf.ts — HTML → PDF en el teléfono (reportes de Avance y Revisión)
// =============================================================================

import * as Print from 'expo-print';

/** Genera el PDF; devuelve el archivo local y su contenido en base64. */
export async function htmlToPdf(html: string): Promise<{ uri: string; base64: string }> {
  const r = await Print.printToFileAsync({ html, base64: true });
  return { uri: r.uri, base64: r.base64 ?? '' };
}
