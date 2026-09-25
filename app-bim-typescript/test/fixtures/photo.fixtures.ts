// =============================================================================
// photo.fixtures.ts — Fixture de foto de auditoría (AuditPhoto)
// Basado en: lista-14-fixtures.md (#7 photo-1 — "BLOB foto (pequeño JPEG para test)")
// =============================================================================

import { AuditPhoto, auditPhotoId, RevitObjectId } from '../../src/domain/objects';
import { ROOM_1_ID } from './geometry.fixtures';

/**
 * BLOB JPEG mínimo para tests: cabecera SOI (0xFFD8) + segmento APP0/JFIF corto
 * + marcador EOI (0xFFD9). Deliberadamente pequeño (21 bytes) — NO es una imagen
 * decodificable/renderizable real, solo sirve para probar que el pipeline de
 * Buffer/BLOB (AuditPhoto → SQLite BLOB → lectura) funciona de punta a punta
 * sin depender de un archivo .jpg real en disco.
 */
const FAKE_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, // SOI — Start of Image
  0xff, 0xe0, 0x00, 0x10, // APP0 marker, longitud de segmento = 16
  0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
  0x01, 0x01, // versión 1.1
  0x00, // unidades de densidad: sin unidades
  0x00, 0x01, 0x00, 0x01, // Xdensity=1, Ydensity=1
  0x00, 0x00, // sin thumbnail (Xthumbnail=0, Ythumbnail=0)
  0xff, 0xd9, // EOI — End of Image
]);

/**
 * photo-1: foto de auditoría de room-1, sin vincular a ningún objeto BIM
 * (linkedObjectId undefined — foto de contexto general del Recinto).
 */
export function createFixturePhoto1(overrides?: { linkedObjectId?: RevitObjectId }): AuditPhoto {
  return new AuditPhoto({
    id: auditPhotoId('photo-1'),
    roomId: ROOM_1_ID,
    foto: FAKE_JPEG_BYTES,
    metadata_json: JSON.stringify({
      timestamp: 1_700_000_000_000,
      filename: 'room-1-photo-1.jpg',
    }),
    linkedObjectId: overrides?.linkedObjectId,
  });
}

/** Acceso directo al BLOB fake, por si un test necesita comparar bytes exactos. */
export { FAKE_JPEG_BYTES };
