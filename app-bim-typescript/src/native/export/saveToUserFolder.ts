// =============================================================================
// saveToUserFolder.ts — Guardar un archivo exportado donde el usuario elija
// =============================================================================
//
// En Android la app no puede escribir en Descargas ni en Drive por su cuenta:
// el Storage Access Framework le pide al usuario una carpeta y devuelve un
// permiso sobre ella. La carpeta elegida se recuerda mientras la app esté
// abierta, para que exportar varias veces no pregunte cada vez.
//
// Fuera de Android (o si el usuario cancela) no hay carpeta: el llamador
// decide qué hacer (en iOS, guardar en los documentos de la app).
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

let rememberedDir: string | null = null;

/** ¿La próxima exportación va a abrir el selector de carpetas del sistema? */
export function willAskForFolder(): boolean {
  return Platform.OS === 'android' && rememberedDir === null;
}

type SaveResult =
  | { readonly ok: true; readonly uri: string; readonly folderLabel: string }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unsupported' | 'failed'; readonly detail?: string };

/** Nombre legible de una carpeta SAF ("primary:Download/PolyLive" → "Download/PolyLive"). */
function folderLabelOf(dirUri: string): string {
  const tree = decodeURIComponent(dirUri.split('/tree/')[1] ?? dirUri);
  return tree.replace(/^primary:/, '') || 'carpeta elegida';
}

export async function saveTextToUserFolder(
  filename: string,
  content: string,
  mimeType = 'application/octet-stream',
  opts: { askAgain?: boolean } = {},
): Promise<SaveResult> {
  return saveToUserFolder(filename, content, FileSystem.EncodingType.UTF8, mimeType, opts);
}

/** Igual que `saveTextToUserFolder`, para binarios (PDF, imágenes) en base64. */
export async function saveBase64ToUserFolder(
  filename: string,
  base64: string,
  mimeType = 'application/octet-stream',
  opts: { askAgain?: boolean } = {},
): Promise<SaveResult> {
  return saveToUserFolder(filename, base64, FileSystem.EncodingType.Base64, mimeType, opts);
}

async function saveToUserFolder(
  filename: string,
  data: string,
  encoding: FileSystem.EncodingType,
  mimeType: string,
  opts: { askAgain?: boolean },
): Promise<SaveResult> {
  if (Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };
  const saf = FileSystem.StorageAccessFramework;

  const write = async (dir: string): Promise<string> => {
    // Con un tipo genérico Android respeta la extensión del nombre (.ifc);
    // con uno conocido añadiría la suya.
    const uri = await saf.createFileAsync(dir, filename, mimeType);
    await FileSystem.writeAsStringAsync(uri, data, { encoding });
    return uri;
  };

  if (rememberedDir && !opts.askAgain) {
    try {
      return { ok: true, uri: await write(rememberedDir), folderLabel: folderLabelOf(rememberedDir) };
    } catch {
      // El permiso caducó (o se borró la carpeta): se vuelve a preguntar.
      rememberedDir = null;
    }
  }

  const perm = await saf.requestDirectoryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'cancelled' };
  try {
    const uri = await write(perm.directoryUri);
    rememberedDir = perm.directoryUri;
    return { ok: true, uri, folderLabel: folderLabelOf(perm.directoryUri) };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
