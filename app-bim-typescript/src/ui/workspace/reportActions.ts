// =============================================================================
// reportActions.ts — Guardar o compartir reportes (CSV y PDF) de Avance y Revisión
// =============================================================================

import { saveBase64ToUserFolder, saveTextToUserFolder } from '../../native/export/saveToUserFolder';
import { folderHint } from './folderHint';
import * as FileSystem from 'expo-file-system';
import { shareExistingFile, shareFile } from '../../native/export/shareFile';
import { htmlToPdf } from '../../native/export/printPdf';
import { toast } from '../primitives';
import { haptic } from '../design/haptics';

/** Nombre de archivo seguro: sin tildes ni símbolos. */
export function safeName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'reporte'
  );
}

async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(`[${label}]`, err);
    toast(`No se pudo generar el ${label}`, { kind: 'error' });
  }
}

export function saveCsv(filename: string, csv: string): Promise<void> {
  return guard('CSV', async () => {
    folderHint();
    // BOM: Excel reconoce las tildes.
    const r = await saveTextToUserFolder(filename, '﻿' + csv);
    if (r.ok) {
      haptic.commit();
      toast(`CSV guardado en ${r.folderLabel}`, { kind: 'success' });
    } else if (r.reason !== 'cancelled') toast('No se pudo guardar el CSV', { kind: 'error' });
  });
}

export function savePdf(filename: string, html: string): Promise<void> {
  return guard('PDF', async () => {
    toast('Generando PDF…', { kind: 'info', durationMs: 1200 });
    const pdf = await htmlToPdf(html);
    folderHint();
    const r = await saveBase64ToUserFolder(filename, pdf.base64, 'application/pdf');
    if (r.ok) {
      haptic.commit();
      toast(`PDF guardado en ${r.folderLabel}`, { kind: 'success' });
    } else if (r.reason !== 'cancelled') toast('No se pudo guardar el PDF', { kind: 'error' });
  });
}

/** Comparte el PDF (WhatsApp, correo, Drive…) sin pasar por una carpeta. */
export function sharePdf(html: string, dialogTitle: string, filename?: string): Promise<void> {
  return guard('PDF', async () => {
    toast('Generando PDF…', { kind: 'info', durationMs: 1200 });
    const pdf = await htmlToPdf(html);
    // expo-print nombra el archivo con un id aleatorio: quien lo recibe por WhatsApp ve ese nombre.
    let uri = pdf.uri;
    if (filename && FileSystem.cacheDirectory) {
      uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.deleteAsync(uri, { idempotent: true });
      await FileSystem.copyAsync({ from: pdf.uri, to: uri });
    }
    if (!(await shareExistingFile(uri, 'application/pdf', dialogTitle))) toast('Compartir no está disponible', { kind: 'error' });
  });
}

export function shareCsv(filename: string, csv: string): Promise<void> {
  return guard('CSV', async () => {
    const r = await shareFile(filename, '﻿' + csv, { mimeType: 'text/csv' });
    if (!r.ok) toast('Compartir no está disponible', { kind: 'error' });
  });
}
