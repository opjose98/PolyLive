// =============================================================================
// pickBinaryFile.ts — Elegir un archivo binario del teléfono (paquete .polylive)
// =============================================================================

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { base64ToUint8Array } from '../../shared/encoding/base64';

interface PickedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** `null` si el usuario cancela. */
export async function pickBinaryFile(types: string[] = ['*/*']): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return { name: asset.name, bytes: base64ToUint8Array(b64) };
}
