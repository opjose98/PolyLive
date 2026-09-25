// =============================================================================
// guid-generator.ts — Generación de GUID IFC (UUID v4 → comprimido a 22 chars)
// Basado en: generación-GUID-IFC.md (Obsidian 03-Infraestructura/export-ifc)
//
// IFC GUIDs siguen ISO 10303-21: UUID v4 de 128 bits codificado en base64url
// y truncado a 22 caracteres alfanuméricos. Cada entidad IFC recibe un GUID
// único para identificación dentro del archivo STEP.
// =============================================================================

/**
 * Caracteres válidos para GUID IFC (base64url sin padding).
 * 64 caracteres: 0-9, A-Z, a-z, _, $
 */
const IFC_BASE64_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/**
 * Genera un UUID v4 (RFC 4122) como array de 16 bytes.
 * Usa Math.random() — suficiente para archivos IFC (no criptográfico).
 */
function generateUuidBytes(): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  // Versión 4: bits 48-51 = 0100
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Variante RFC 4122: bits 64-65 = 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

/**
 * Convierte 16 bytes a un GUID IFC comprimido de 22 caracteres.
 *
 * Algoritmo:
 * 1. Toma los 16 bytes (128 bits)
 * 2. Codifica en base64 usando el alfabeto IFC
 * 3. Produce exactamente 22 caracteres (128 bits / 6 bits por char ≈ 22)
 *
 * Cada grupo de 3 bytes (24 bits) produce 4 caracteres de 6 bits.
 * El último grupo de 2 bytes (16 bits) produce 3 caracteres.
 * Total: 5 grupos × 4 chars + 1 grupo × 2 chars = 22 chars
 */
function bytesToIfcGuid(bytes: number[]): string {
  let result = '';

  // Procesar en grupos de 3 bytes → 4 caracteres base64
  for (let i = 0; i < 16; i += 3) {
    if (i + 2 < 16) {
      // Grupo completo: 3 bytes → 4 chars
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      result += IFC_BASE64_CHARS[(n >> 18) & 0x3f];
      result += IFC_BASE64_CHARS[(n >> 12) & 0x3f];
      result += IFC_BASE64_CHARS[(n >> 6) & 0x3f];
      result += IFC_BASE64_CHARS[n & 0x3f];
    } else if (i + 1 < 16) {
      // Grupo parcial: 2 bytes → 3 chars
      const n = (bytes[i] << 8) | bytes[i + 1];
      result += IFC_BASE64_CHARS[(n >> 12) & 0x3f];
      result += IFC_BASE64_CHARS[(n >> 6) & 0x3f];
      result += IFC_BASE64_CHARS[n & 0x3f];
    } else {
      // Grupo parcial: 1 byte → 2 chars
      const n = bytes[i];
      result += IFC_BASE64_CHARS[(n >> 6) & 0x3f];
      result += IFC_BASE64_CHARS[n & 0x3f];
    }
  }

  return result;
}

/**
 * Genera un GUID IFC único de 22 caracteres alfanuméricos.
 *
 * Formato: UUID v4 de 128 bits codificado en base64url (alfabeto IFC).
 * Ejemplo: "1kTvXnbbzCWO8LMiWEkQJo"
 *
 * Cada objeto BIM en el archivo IFC obtiene un GUID único.
 * Los GUIDs son generados fresh en cada exportación (no persistidos).
 */
export function generateGuid(): string {
  const bytes = generateUuidBytes();
  return bytesToIfcGuid(bytes);
}

/**
 * Valida que un string sea un GUID IFC válido.
 * - Exactamente 22 caracteres
 * - Solo caracteres del alfabeto IFC (alfanuméricos + _ + $)
 */
export function isValidIfcGuid(guid: string): boolean {
  if (guid.length !== 22) return false;
  for (let i = 0; i < guid.length; i++) {
    if (IFC_BASE64_CHARS.indexOf(guid[i]) === -1) return false;
  }
  return true;
}
