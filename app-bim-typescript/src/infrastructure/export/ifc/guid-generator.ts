// =============================================================================
// guid-generator.ts — IfcGloballyUniqueId (22 caracteres)
// =============================================================================
//
// FORMATO (buildingSMART, el que usan Revit e IfcOpenShell): los 128 bits del
// GUID se codifican en base 64 con el alfabeto IFC, empezando por el primer
// byte en DOS caracteres y luego cinco grupos de tres bytes en cuatro. Por eso
// el primer carácter solo puede ser 0–3.
//
// BUG CORREGIDO: la versión anterior agrupaba desde el byte 0 de tres en tres y
// dejaba el último byte suelto. El texto tenía 22 caracteres del alfabeto
// correcto, pero no era la compresión estándar: el primer carácter podía ser
// cualquiera y Revit/IfcOpenShell decodificaban otro GUID (o lo rechazaban).
//
// GUIDs ESTABLES: un mismo objeto de PolyLive exporta siempre el mismo GUID
// (derivado de su id). Es lo que permite a Revit reconocer un muro al
// reimportar un levantamiento actualizado en vez de duplicarlo.
// =============================================================================

/** Alfabeto IFC: 0-9, A-Z, a-z, _, $ (en ese orden). */
const IFC_BASE64_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

function b64(value: number, digits: number): string {
  let out = '';
  for (let i = 0; i < digits; i++) {
    out = IFC_BASE64_CHARS[value % 64] + out;
    value = Math.floor(value / 64);
  }
  return out;
}

/** Comprime 16 bytes al formato IFC de 22 caracteres. */
export function compressGuidBytes(bytes: readonly number[]): string {
  if (bytes.length !== 16) throw new Error('Un GUID tiene 16 bytes.');
  let out = b64(bytes[0], 2);
  for (let i = 1; i < 16; i += 3) out += b64((bytes[i] << 16) + (bytes[i + 1] << 8) + bytes[i + 2], 4);
  return out;
}

/** Inversa de `compressGuidBytes`. */
export function expandGuid(guid: string): number[] {
  const val = (s: string) => [...s].reduce((acc, c) => acc * 64 + IFC_BASE64_CHARS.indexOf(c), 0);
  const bytes = [val(guid.slice(0, 2))];
  for (let i = 2; i < 22; i += 4) {
    const n = val(guid.slice(i, i + 4));
    bytes.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

/** Marca los bytes como UUID versión `v` (RFC 4122). */
function stampUuid(bytes: number[], version: number): number[] {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

/** GUID aleatorio (UUID v4). Para entidades sin identidad propia (relaciones). */
export function generateGuid(): string {
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  return compressGuidBytes(stampUuid(bytes, 4));
}

/**
 * GUID determinista a partir de una clave (id de objeto, "storey:<id>",
 * "rel:<id>"...). Misma clave → mismo GUID en cada exportación.
 *
 * Es un hash de 128 bits (cuatro FNV-1a de 32 bits con semillas distintas,
 * mezclados). No es criptográfico ni lo necesita: solo tiene que ser estable
 * y repartir bien claves parecidas.
 */
export function stableGuid(key: string): string {
  const seeds = [0x811c9dc5, 0x01000193 ^ 0x5bd1e995, 0x27d4eb2f, 0x165667b1];
  const bytes: number[] = [];
  for (const seed of seeds) {
    let h = seed >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Avalancha final (murmur3 fmix32) para que claves casi iguales difieran en todo.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    bytes.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return compressGuidBytes(stampUuid(bytes, 5));
}

/**
 * ¿Es un IfcGloballyUniqueId válido? 22 caracteres del alfabeto IFC y el
 * primero entre 0 y 3 (solo codifica los 2 bits altos del primer byte).
 */
export function isValidIfcGuid(guid: string): boolean {
  if (guid.length !== 22) return false;
  if (!'0123'.includes(guid[0])) return false;
  for (let i = 0; i < guid.length; i++) {
    if (IFC_BASE64_CHARS.indexOf(guid[i]) === -1) return false;
  }
  return true;
}
