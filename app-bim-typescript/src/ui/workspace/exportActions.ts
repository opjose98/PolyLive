// =============================================================================
// exportActions.ts — Exportar IFC (Revit) y DXF a una carpeta del usuario
// =============================================================================
//
// Un solo camino para las dos entradas (menú ☰ y pantalla Exportar): junta
// niveles, fases y antepechos del proyecto, genera el archivo y lo guarda con
// el Storage Access Framework (la carpeta que elija el usuario: Documentos,
// Drive...). Antes la pantalla Exportar escribía en la carpeta privada de la
// app, donde el operador no podía encontrar el archivo.
// =============================================================================

import type { AppServices } from '../../application/AppServices';
import { ValidationError } from '../../application/use-cases/types';
import type { RoomId } from '../../domain/objects/base';
import type { ProjectMarker } from '../../domain/objects/marker';
import { AppError } from '../../shared/errors/AppError';
import { saveTextToUserFolder } from '../../native/export/saveToUserFolder';
import { folderHint } from './folderHint';
import { toast } from '../primitives';
import { haptic } from '../design/haptics';
import { dxfZones, ifcZones } from '../../application/topology/zoneExport';
import { mapConversionFor } from '../../application/geo/surveyTools';
import { isGeoreferenced } from '../../application/geo/coordinateText';
import { crsDef, workingCrs } from '../../domain/geo/crs';

export interface ExportContext {
  readonly roomId: RoomId;
  readonly projectId?: string;
  readonly projectName: string;
  readonly spaceName: string;
  readonly author?: string;
}

export type ExportOutcome =
  | { readonly ok: true; readonly folder: string; readonly detail?: string }
  | { readonly ok: false; readonly message: string | null };

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'x';

/** Nombre con fecha y hora LOCAL (la que reconoce el operador al buscarlo). */
export function exportFilename(ctx: ExportContext, ext: string, now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  return `${slug(ctx.projectName)}-${slug(ctx.spaceName)}-${stamp}.${ext}`;
}

function failureMessage(err: unknown, fallback: string): string {
  if (err instanceof ValidationError) return `No se puede exportar: ${err.warnings.map((w) => w.message).join(' · ')}`;
  if (err instanceof AppError) return err.userMessage;
  return fallback;
}

async function save(ctx: ExportContext, ext: string, content: string, detail?: string): Promise<ExportOutcome> {
  folderHint();
  const saved = await saveTextToUserFolder(exportFilename(ctx, ext), content);
  if (saved.ok) {
    haptic.commit();
    toast(`${ext.toUpperCase()} guardado en ${saved.folderLabel}`, { kind: 'success' });
    return { ok: true, folder: saved.folderLabel, detail };
  }
  if (saved.reason === 'cancelled') {
    toast('Exportación cancelada: no se eligió carpeta', { kind: 'info' });
    return { ok: false, message: null };
  }
  const message =
    saved.reason === 'unsupported'
      ? 'Guardar en carpeta solo está disponible en Android'
      : `No se pudo escribir el archivo${saved.detail ? `: ${saved.detail}` : ''}`;
  toast(message, { kind: 'error' });
  return { ok: false, message };
}

/** IFC 4 para Revit: un piso por nivel, restricciones de base/tope, fases. */
export async function exportRevitIfc(services: AppServices, ctx: ExportContext): Promise<ExportOutcome> {
  toast('Generando IFC…', { kind: 'info', durationMs: 1200 });
  try {
    const none = Promise.resolve([] as ProjectMarker[]);
    const geo = ctx.projectId ? await services.topography.getGeoreference(ctx.projectId) : null;
    const space = ctx.roomId as unknown as string;
    // Proyecto amarrado: el IFC sale georreferenciado (coordenadas compartidas en Revit).
    const mapConversion = isGeoreferenced(geo)
      ? mapConversionFor(geo, space, workingCrs(geo.crs), crsDef(workingCrs(geo.crs)).name)
      : undefined;
    const [lv, ph, elevs, zones] = await Promise.all([
      ctx.projectId ? services.markers.list(ctx.projectId, 'level') : none,
      ctx.projectId ? services.markers.list(ctx.projectId, 'phase') : none,
      services.elevations.listElevations(ctx.roomId),
      services.zones.list(ctx.roomId as unknown as string),
    ]);
    const sills = new Map<string, number>();
    for (const e of elevs) for (const o of e.openings) if (o.vanoId) sills.set(o.vanoId, o.sillHeight);
    const out = await services.useCases.exportRoomIfc.execute({
      roomId: ctx.roomId,
      levels: lv.map((m) => ({ id: m.id, name: m.name, elevation: m.value, isBase: m.isBase })),
      phaseNames: new Map(ph.map((m) => [m.id, m.name] as [string, string])),
      openingSills: sills,
      projectName: ctx.projectName,
      projectKey: ctx.projectId,
      author: ctx.author,
      zones: ifcZones(zones),
      mapConversion,
    });
    const detail = `${lv.length || 1} nivel(es), ${ifcZones(zones).length} recinto(s)${mapConversion ? ', georreferenciado' : ''}`;
    return await save(ctx, 'ifc', out.ifcContent, detail);
  } catch (err) {
    console.warn('[export-ifc]', err);
    const message = failureMessage(err, 'No se pudo exportar el IFC.');
    toast(message, { kind: 'error' });
    return { ok: false, message };
  }
}

/** DXF R2000 de la planta: funciona aunque el recinto esté abierto. */
export async function exportPlanDxf(services: AppServices, ctx: ExportContext): Promise<ExportOutcome> {
  try {
    // Las elevaciones van explícitas: sin ellas el DXF saldría sin huecos.
    const elevations = await services.elevations.listElevations(ctx.roomId);
    // La planta del DXF es la del nivel base: sus recintos (los de otros niveles se superpondrían).
    const base = ctx.projectId ? (await services.markers.list(ctx.projectId, 'level')).find((m) => m.isBase)?.id : undefined;
    const zones = dxfZones(await services.zones.list(ctx.roomId as unknown as string), base ?? '');
    const r = await services.useCases.exportRoomDxf.execute({ roomId: ctx.roomId, title: ctx.spaceName, elevations, zones });
    const detail =
      `${r.stats.walls} muro(s), ${r.stats.columns} columna(s), ${r.stats.openings} hueco(s)` +
      (r.stats.roomClosed ? ', recinto cerrado' : ', recinto sin cerrar');
    return await save(ctx, 'dxf', r.dxfContent, detail);
  } catch (err) {
    console.warn('[export-dxf]', err);
    const message = failureMessage(err, 'No se pudo exportar el DXF.');
    toast(message, { kind: 'error' });
    return { ok: false, message };
  }
}
