// =============================================================================
// deliverableActions.ts — Plano PDF, cuadro de áreas y registro fotográfico
// =============================================================================

import type { AppServices } from '../../application/AppServices';
import type { DetectedRoom } from '../../application/editor/EditorController';
import { AreaRow, PhotoEntry, SheetMeta, areaScheduleCsv, photoRegisterHtml, planSheetHtml } from '../../application/report/deliverables';
import type { RoomId } from '../../domain/objects/base';
import { zoneCode } from '../../domain/objects/zone';
import { uint8ArrayToBase64 } from '../../shared/encoding/base64';
import { diagnostics } from '../../shared/diagnostics';
import { toast } from '../primitives';
import { safeName, saveCsv, savePdf } from './reportActions';

/** Filas del cuadro de áreas desde los recintos del nivel. */
export function areaRowsOf(rooms: readonly DetectedRoom[], level: string): AreaRow[] {
  return rooms
    .filter((r) => (r.netArea ?? 0) > 0 || r.area > 0)
    .map((r) => ({
      code: r.number !== undefined ? zoneCode({ number: r.number }) : '—',
      name: r.name ?? 'Recinto',
      use: r.use ?? '',
      level,
      netArea: r.netArea ?? r.area,
      perimeter: r.perimeter ?? 0,
      axisArea: r.area,
    }));
}

const base = (meta: SheetMeta, what: string) => `${safeName(meta.project)}-${safeName(meta.space)}-${what}`;

export function exportPlanSheet(meta: SheetMeta, svg: string, rows: readonly AreaRow[]): Promise<void> {
  if (!rows.length) toast('Sin recintos cerrados: el plano sale sin cuadro de áreas', { kind: 'info' });
  return savePdf(`${base(meta, 'plano')}.pdf`, planSheetHtml(meta, svg, rows));
}

export function exportAreaCsv(meta: SheetMeta, rows: readonly AreaRow[]): Promise<void> {
  return saveCsv(`${base(meta, 'cuadro-de-areas')}.csv`, areaScheduleCsv(meta, rows));
}

/** Fotos con más de esto se avisan: el PDF de muchas fotos grandes tarda y pesa. */
const MANY_PHOTOS = 40;

export async function exportPhotoRegister(
  services: AppServices,
  roomId: RoomId,
  meta: SheetMeta,
  /** Nombre legible de un muro por id (para las fotos del alzado). */
  wallName: (id: string) => string,
): Promise<void> {
  try {
    const list = await services.store.listAuditPhotos(roomId);
    if (!list.length) {
      toast('El espacio no tiene fotos', { kind: 'info' });
      return;
    }
    if (list.length > MANY_PHOTOS) toast(`${list.length} fotos: el PDF puede tardar un poco`, { kind: 'info' });
    const entries: PhotoEntry[] = [];
    // Las más antiguas primero: el registro se lee en el orden en que se tomó.
    for (const p of [...list].reverse()) {
      const md = p.metadata;
      const full = await services.store.readAuditPhoto(p.id).catch(() => null);
      const m = md.marker;
      const where = m?.face
        ? `${wallName(m.face.wallId)} · cara ${m.face.side} · x ${m.face.x.toFixed(2)} m, altura ${m.face.y.toFixed(2)} m`
        : m
          ? `Planta (${m.position.x.toFixed(2)}; ${m.position.y.toFixed(2)}) m`
          : 'Sin ubicación en el plano';
      entries.push({
        code: md.bimCode ?? (p.id as string),
        takenAt: new Date(md.timestamp ?? p.created_at.getTime()),
        author: md.operator ?? meta.operator,
        where,
        notes: md.notes ?? '',
        gps: md.geo ? `${md.geo.latitude.toFixed(6)}, ${md.geo.longitude.toFixed(6)} (±${md.geo.accuracyMeters.toFixed(0)} m)` : undefined,
        dataUri: full?.foto?.length ? `data:image/jpeg;base64,${uint8ArrayToBase64(full.foto)}` : null,
      });
    }
    await savePdf(`${base(meta, 'registro-fotografico')}.pdf`, photoRegisterHtml(meta, entries));
  } catch (err) {
    diagnostics.error('photo-register', 'No se pudo generar el registro fotográfico', err);
    toast('No se pudo generar el registro fotográfico', { kind: 'error' });
  }
}
