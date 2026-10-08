// =============================================================================
// pickTextFile.ts — Elegir un archivo de texto del teléfono (CSV de puntos)
// =============================================================================
//
// El selector del sistema (Drive, Descargas, WhatsApp…) devuelve una copia en
// la caché de la app, que se lee como texto. `null` si el usuario cancela.
// =============================================================================

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

interface PickedText {
  readonly name: string;
  readonly text: string;
}

export async function pickTextFile(): Promise<PickedText | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // Las estaciones totales exportan .csv, .txt o sin extensión; algunos
    // gestores los anuncian como hoja de cálculo.
    type: ['text/*', 'text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return { name: asset.name, text };
}
