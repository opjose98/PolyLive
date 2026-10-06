// =============================================================================
// seal.ts — Sello de evidencia de una foto (quién, cuándo, y que no se alteró)
// =============================================================================
//
// La interventoría necesita saber que una foto es la que se tomó en obra:
// al capturarla se calcula el SHA-256 de la imagen y un sello sobre
// (imagen, código, operador, fecha, GPS). Verificar es volver a calcularlo:
// si la imagen o sus datos cambiaron, el sello no coincide.
//
// No es una firma con certificado (no hay cuentas ni llaves): prueba
// integridad y deja el autor declarado, que es lo mínimo exigible en campo.
// =============================================================================

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export interface EvidenceSeal {
  readonly algorithm: 'SHA-256';
  /** Hash de los bytes de la imagen. */
  readonly imageSha256: string;
  /** Hash de (imagen, código, operador, fecha, GPS) en JSON canónico. */
  readonly sealSha256: string;
  readonly sealedBy: string;
  readonly sealedAt: string;
}

export interface SealFields {
  readonly bimCode?: string;
  readonly operator?: string;
  readonly timestamp: number;
  readonly geo?: { readonly latitude: number; readonly longitude: number; readonly accuracyMeters: number };
}

function canonical(imageSha256: string, f: SealFields): string {
  return JSON.stringify({
    image: imageSha256,
    code: f.bimCode ?? '',
    operator: f.operator ?? '',
    timestamp: f.timestamp,
    geo: f.geo ? [f.geo.latitude, f.geo.longitude, f.geo.accuracyMeters] : null,
  });
}

export function sealPhoto(image: Uint8Array, f: SealFields): EvidenceSeal {
  const imageSha256 = bytesToHex(sha256(image));
  return {
    algorithm: 'SHA-256',
    imageSha256,
    sealSha256: bytesToHex(sha256(utf8ToBytes(canonical(imageSha256, f)))),
    sealedBy: f.operator ?? '',
    sealedAt: new Date(f.timestamp).toISOString(),
  };
}

/** ¿La imagen y sus datos son los mismos que se sellaron? */
export function verifySeal(image: Uint8Array, f: SealFields, seal: EvidenceSeal): boolean {
  const again = sealPhoto(image, f);
  return again.imageSha256 === seal.imageSha256 && again.sealSha256 === seal.sealSha256;
}

/** Forma corta para mostrar (primeros 12 caracteres). */
export const shortHash = (h: string) => h.slice(0, 12);
