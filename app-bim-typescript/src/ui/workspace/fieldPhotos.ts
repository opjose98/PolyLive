// =============================================================================
// fieldPhotos.ts — Guardar una foto de campo (un solo camino)
// =============================================================================
//
// Archivo (para la galería) + registro en la base con su código BIM correlativo
// (FOT001, FOT002…), operador, GPS si hay fix y sello de evidencia. Antes este
// mismo paso estaba copiado en la planta, en Revisión y en la galería.
//
// El GPS se intenta pero NO bloquea: en un sótano no hay fix, y perder la foto
// por eso sería absurdo.
// =============================================================================

import type { AppServices } from '../../application/AppServices';
import type { AuditPhotoId, RoomId } from '../../domain/objects/base';
import { PHOTO_BIM_CODE_PREFIX, PhotoGeoTag } from '../../domain/objects/audit-photo';
import { generateBimCode } from '../../domain/objects/project';
import type { ExpoFileSystem } from '../../native/filesystem/ExpoFileSystem';
import type { ExpoGpsProvider } from '../../native/location/ExpoGpsProvider';
import { base64ToUint8Array } from '../../shared/encoding/base64';

interface SaveFieldPhotoInput {
  readonly services: AppServices;
  readonly fs: ExpoFileSystem;
  readonly roomId: RoomId;
  readonly base64: string;
  readonly operator?: string;
  readonly notes?: string;
  /** Si se pasa, se intenta una posición GPS (sin bloquear si no hay fix). */
  readonly gps?: ExpoGpsProvider;
}

export async function saveFieldPhoto(i: SaveFieldPhotoInput): Promise<{ photoId: AuditPhotoId; bimCode: string }> {
  const saved = await i.fs.savePhoto(i.base64);
  let geo: PhotoGeoTag | undefined;
  if (i.gps) {
    try {
      const fix = await i.gps.getCurrentPosition();
      geo = { latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: Number(fix.accuracy) };
    } catch {
      geo = undefined;
    }
  }
  const existing = await i.services.store.listAuditPhotos(i.roomId);
  const bimCode = generateBimCode(
    PHOTO_BIM_CODE_PREFIX,
    existing.map((p) => p.metadata.bimCode).filter((c): c is string => !!c),
  );
  const result = await i.services.useCases.capturePhoto.execute({
    roomId: i.roomId,
    photoData: base64ToUint8Array(i.base64),
    filename: saved.filename,
    metadata: { bimCode, geo, operator: i.operator || undefined, ...(i.notes ? { notes: i.notes } : {}) },
  });
  return { photoId: result.photoId, bimCode };
}
