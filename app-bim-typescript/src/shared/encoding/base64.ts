// =============================================================================
// base64.ts — Codificador/decodificador Base64 ↔ Uint8Array sin `Buffer`
// =============================================================================
//
// GAP CERRADO: el global `Buffer` de Node no existe en Hermes/React Native.
// expo-camera entrega la foto capturada como string Base64 (`PhotoResult.base64`)
// y CapturePhotoUseCase necesita bytes (`Uint8Array`) para el BLOB de SQLite —
// decodificar con `Buffer.from(base64, 'base64')` (el patrón usado en otras
// partes del código, ej. native/ble/HuepaDeviceManager.ts:318) funciona en los
// tests de Node pero lanzaría `ReferenceError: Buffer is not defined` en un
// dispositivo real. Estas funciones no dependen de ningún global de
// plataforma — solo aritmética de tabla, funcionan igual en Node, Hermes o
// un navegador. `uint8ArrayToBase64` la usa el backup de base de datos en
// dispositivo (native/backup/ExpoBackupDatabaseUseCase.ts) para persistir
// `SQLiteDatabase.serializeAsync()` (bytes) como archivo vía expo-file-system,
// cuya API de escritura solo acepta strings.
// =============================================================================

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REVERSE_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    table[BASE64_CHARS[i]] = i;
  }
  return table;
})();

/** Decodifica una cadena Base64 (con o sin padding `=`) a bytes crudos. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, ''); // ignora padding, whitespace, saltos de línea
  const byteLength = Math.floor((clean.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let byteIndex = 0;

  for (let i = 0; i < clean.length; i++) {
    const value = REVERSE_LOOKUP[clean[i]];
    if (value === undefined) continue; // caracter no-Base64 inesperado — se ignora, no se lanza

    bitBuffer = (bitBuffer << 6) | value;
    bitsInBuffer += 6;

    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[byteIndex++] = (bitBuffer >> bitsInBuffer) & 0xff;
    }
  }

  return bytes;
}

/** Codifica bytes crudos a una cadena Base64 (con padding `=` estándar). */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;

  for (; i + 3 <= bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      BASE64_CHARS[(chunk >> 18) & 0x3f] +
      BASE64_CHARS[(chunk >> 12) & 0x3f] +
      BASE64_CHARS[(chunk >> 6) & 0x3f] +
      BASE64_CHARS[chunk & 0x3f];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    result += BASE64_CHARS[(chunk >> 18) & 0x3f] + BASE64_CHARS[(chunk >> 12) & 0x3f] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      BASE64_CHARS[(chunk >> 18) & 0x3f] + BASE64_CHARS[(chunk >> 12) & 0x3f] + BASE64_CHARS[(chunk >> 6) & 0x3f] + '=';
  }

  return result;
}
