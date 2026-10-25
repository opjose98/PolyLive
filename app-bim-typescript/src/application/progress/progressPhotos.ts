// =============================================================================
// progressPhotos.ts — Registro fotográfico del avance (H-90)
// =============================================================================
//
// Una foto de avance es una foto de campo más (galería, código FOTnnn, sello)
// con una etiqueta en su metadata: el corte en que se tomó y, si se tomó
// tocando un elemento, el soporte (suelo, cara de muro, columna) y la
// actividad activa. Con eso entra al registro fotográfico del reporte y a la
// memoria de cantidades, junto a las medidas de ese elemento.
// =============================================================================

import type { AuditPhoto, PhotoProgressTag } from '../../domain/objects/audit-photo';
import type { ReportPhoto } from './progressReport';

/** Las fotos de avance de un espacio, listas para el reporte. */
export function reportPhotosOf(photos: readonly AuditPhoto[]): ReportPhoto[] {
  return photos.flatMap((p) => {
    const m = p.metadata;
    const tag = m.progress as PhotoProgressTag | undefined;
    if (!tag?.cutId) return [];
    return [
      {
        id: p.id as string,
        code: m.bimCode ?? 'Foto',
        takenAt: new Date(m.timestamp),
        cutId: tag.cutId,
        ...(tag.targetKey ? { targetKey: tag.targetKey } : {}),
        ...(tag.activityId ? { activityId: tag.activityId } : {}),
        ...(m.notes ? { notes: m.notes } : {}),
        ...(m.operator ? { operator: m.operator } : {}),
      },
    ];
  });
}

/** Objeto BIM al que apunta un soporte de avance (para ligar la foto en la galería). */
export function objectIdOfTarget(targetKey: string): string | null {
  if (targetKey.startsWith('column:')) return targetKey.slice(7);
  const wall = /^wall:(.+):[AB]$/.exec(targetKey);
  if (wall) return wall[1];
  // Suelo libre: `floor:floor:<id>`; suelo de recinto: el recinto (no es un objeto BIM).
  if (targetKey.startsWith('floor:floor:')) return targetKey.slice(12);
  return null;
}
