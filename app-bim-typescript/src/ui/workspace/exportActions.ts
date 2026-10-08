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

import { localStamp } from '../../shared/dates';
import type { AppServices } from '../../application/AppServices';
import { ValidationError } from '../../application/use-cases/types';
import type { RoomId } from '../../domain/objects/base';
import type { ProjectMarker } from '../../domain/objects/marker';
import { projectId as toProjectId } from '../../domain/objects/project';
import { AppError } from '../../shared/errors/AppError';
import { saveTextToUserFolder } from '../../native/export/saveToUserFolder';
import { folderHint } from './folderHint';
import { toast } from '../primitives';
import { haptic } from '../design/haptics';
import { dxfZones, ifcZones } from '../../application/topology/zoneExport';
import { mapConversionFor } from '../../application/geo/surveyTools';
import { gridLabel, isGeoreferenced, localLabel } from '../../application/geo/coordinateText';
import { crsDef, workingCrs } from '../../domain/geo/crs';
import { modelToGrid } from '../../domain/geo/georeference';
import { draftDxfEntities, draftIfcMembers } from '../../application/drafting/draftExport';
import type { Point2D } from '../../domain/geometry/types';
import type { DraftItem } from '../../domain/drafting/drafting';
import { Wall } from '../../domain/objects/wall';
import { Column } from '../../domain/objects/column';
import { workspaceStore } from '../../state/workspaceStore';

interface ExportContext {
  readonly roomId: RoomId;
  readonly projectId?: string;
  readonly projectName: string;
  readonly spaceName: string;
  readonly author?: string;
}

type ExportOutcome =
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
  return `${slug(ctx.projectName)}-${slug(ctx.spaceName)}-${localStamp(now)}.${ext}`;
}

function failureMessage(err: unknown, fallback: string): string {
  if (err instanceof ValidationError) return `No se puede exportar: ${err.warnings.map((w) => w.message).join(' · ')}`;
  if (err instanceof AppError) return err.userMessage;
  return fallback;
}

async function save(ctx: ExportContext, ext: string, content: string, detail?: string): Promise<ExportOutcome> {
  await folderHint();
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

/** Dibujo técnico del espacio; si falla la lectura, el plano sale sin él (no se pierde la exportación). */
async function loadDrafts(services: AppServices, ctx: ExportContext): Promise<DraftItem[]> {
  try {
    return await services.drafts.list(ctx.roomId as string);
  } catch (err) {
    console.warn('[export-drafts]', err);
    return [];
  }
}

const summarize = (n: number, one: string, many: string) => (n ? `, ${n} ${n === 1 ? one : many}` : '');

/** IFC 4 para Revit: un piso por nivel, restricciones de base/tope, fases. */
export async function exportRevitIfc(services: AppServices, ctx: ExportContext): Promise<ExportOutcome> {
  toast('Generando IFC…', { kind: 'info', durationMs: 1200 });
  try {
    const none = Promise.resolve([] as ProjectMarker[]);
    const geo = ctx.projectId ? await services.topography.getGeoreference(ctx.projectId) : null;
    const space = ctx.roomId as string;
    // Proyecto amarrado: el IFC sale georreferenciado (coordenadas compartidas en Revit).
    const mapConversion = isGeoreferenced(geo)
      ? mapConversionFor(geo, space, workingCrs(geo.crs), crsDef(workingCrs(geo.crs)).name)
      : undefined;
    const [lv, ph, elevs, zones] = await Promise.all([
      ctx.projectId ? services.markers.list(ctx.projectId, 'level') : none,
      ctx.projectId ? services.markers.list(ctx.projectId, 'phase') : none,
      services.elevations.listElevations(ctx.roomId),
      services.zones.list(ctx.roomId as string),
    ]);
    const sills = new Map<string, number>();
    for (const e of elevs) for (const o of e.openings) if (o.vanoId) sills.set(o.vanoId, o.sillHeight);
    const members = draftIfcMembers(await loadDrafts(services, ctx));
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
      members,
    });
    const beams = members.filter((m) => m.role === 'beam').length;
    const detail =
      `${lv.length || 1} nivel(es), ${ifcZones(zones).length} recinto(s)` +
      summarize(beams, 'viga', 'vigas') +
      summarize(members.length - beams, 'barra de cercha/correa', 'barras de cerchas/correas') +
      (mapConversion ? ', georreferenciado' : '');
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
    const allZones = await services.zones.list(ctx.roomId as string);
    const zones = dxfZones(allZones, base ?? '');
    // Dibujo técnico del mismo nivel (el de planta; lo de alzado no va al plano de planta).
    const drafts = (await loadDrafts(services, ctx)).filter(
      (d) => d.view.kind === 'plan' && (!base || d.levelId === base || d.levelId === ''),
    );
    const drafting = drafts.length ? draftDxfEntities(drafts, await draftContext(services, ctx, allZones)) : undefined;
    const r = await services.useCases.exportRoomDxf.execute({ roomId: ctx.roomId, title: ctx.spaceName, elevations, zones, drafting });
    const detail =
      `${r.stats.walls} muro(s), ${r.stats.columns} columna(s), ${r.stats.openings} hueco(s)` +
      summarize(drafts.length, 'elemento de dibujo', 'elementos de dibujo') +
      (r.stats.roomClosed ? ', recinto cerrado' : ', recinto sin cerrar');
    return await save(ctx, 'dxf', r.dxfContent, detail);
  } catch (err) {
    console.warn('[export-dxf]', err);
    const message = failureMessage(err, 'No se pudo exportar el DXF.');
    toast(message, { kind: 'error' });
    return { ok: false, message };
  }
}

/**
 * Lo que el dibujo técnico necesita para salir al DXF: la escala del plano
 * (alto de los textos), el rótulo de las coordenadas (N/E si el proyecto está
 * amarrado) y el centro de cada objeto etiquetado (línea de referencia).
 */
async function draftContext(
  services: AppServices,
  ctx: ExportContext,
  zones: Awaited<ReturnType<AppServices['zones']['list']>>,
): Promise<Parameters<typeof draftDxfEntities>[1]> {
  const space = ctx.roomId as string;
  const geo = ctx.projectId ? await services.topography.getGeoreference(ctx.projectId).catch(() => null) : null;
  const centers = new Map<string, Point2D>();
  for (const o of await services.store.listObjects(ctx.roomId)) {
    if (o instanceof Wall) centers.set(o.id as string, { x: (o.startPoint.x + o.endPoint.x) / 2, y: (o.startPoint.y + o.endPoint.y) / 2 });
    else if (o instanceof Column) centers.set(o.id as string, o.position);
  }
  for (const z of zones) {
    const poly = z.netPolygon.length ? z.netPolygon : z.polygon;
    if (poly.length) centers.set(z.id, { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length });
  }
  return {
    denominator: Number(workspaceStore.getState().scale.denominator) || 50,
    coordText: (p) => (isGeoreferenced(geo) ? gridLabel(modelToGrid(geo, space, p)) : localLabel(p)),
    targetCenter: (id) => centers.get(id) ?? null,
  };
}

/**
 * El PROYECTO completo en un IFC: todos sus espacios, cada uno en su ubicación
 * (amarre), con un solo IfcProject/sitio/edificio y un piso por nivel. Revit lo
 * abre como un modelo, sin vincular un archivo por espacio.
 */
export async function exportProjectIfc(
  services: AppServices,
  ctx: { readonly projectId: string; readonly projectName: string; readonly author?: string },
): Promise<ExportOutcome> {
  toast('Generando IFC del proyecto…', { kind: 'info', durationMs: 1200 });
  const fileCtx: ExportContext = { roomId: '' as RoomId, projectId: ctx.projectId, projectName: ctx.projectName, spaceName: 'proyecto', author: ctx.author };
  try {
    const geo = await services.topography.getGeoreference(ctx.projectId).catch(() => null);
    // El origen del IFC es el del proyecto (no el de un espacio): giro e x,y nulos.
    const mapConversion = isGeoreferenced(geo)
      ? mapConversionFor(geo, PROJECT_ORIGIN, workingCrs(geo.crs), crsDef(workingCrs(geo.crs)).name)
      : undefined;
    const [lv, ph, details] = await Promise.all([
      services.markers.list(ctx.projectId, 'level'),
      services.markers.list(ctx.projectId, 'phase'),
      services.projects.listSpaceDetails(toProjectId(ctx.projectId)),
    ]);
    const spaces = [];
    let memberCount = 0;
    for (const d of details) {
      if (!d.room) continue;
      const roomId = d.space.roomId as RoomId;
      const spaceCtx: ExportContext = { ...fileCtx, roomId, spaceName: d.space.name };
      const [elevs, zones, drafts] = await Promise.all([
        services.elevations.listElevations(roomId),
        services.zones.list(d.space.roomId as string),
        loadDrafts(services, spaceCtx),
      ]);
      const sills = new Map<string, number>();
      for (const e of elevs) for (const o of e.openings) if (o.vanoId) sills.set(o.vanoId, o.sillHeight);
      const members = draftIfcMembers(drafts);
      memberCount += members.length;
      spaces.push({ roomId, placement: geo?.placements[d.space.roomId as string], zones: ifcZones(zones), openingSills: sills, members });
    }
    if (!spaces.length) {
      const message = 'El proyecto no tiene espacios con datos para exportar.';
      toast(message, { kind: 'error' });
      return { ok: false, message };
    }
    const out = await services.useCases.exportProjectIfc.execute({
      levels: lv.map((m) => ({ id: m.id, name: m.name, elevation: m.value, isBase: m.isBase })),
      phaseNames: new Map(ph.map((m) => [m.id, m.name] as [string, string])),
      projectName: ctx.projectName,
      projectKey: ctx.projectId,
      author: ctx.author,
      mapConversion,
      spaces,
    });
    if (!out.spaces) {
      const message = `No se puede exportar: ningún espacio pasa la validación (${out.skipped.join(', ')}).`;
      toast(message, { kind: 'error' });
      return { ok: false, message };
    }
    // Sin ubicación en el proyecto todos los espacios nacen en el mismo origen y se
    // superponen en el modelo: se avisa cuáles faltan (se ubican en Topografía).
    const unplaced = spaces.length > 1 ? spaces.filter((s) => !s.placement).length : 0;
    if (unplaced) {
      toast(`${unplaced} espacio(s) sin ubicar en el proyecto quedan superpuestos en el origen. Ubícalos con mojones en Topografía → Amarre → «Ubicar solo este espacio».`, {
        kind: 'warning',
        durationMs: 5000,
      });
    }
    const detail =
      `${out.spaces} espacio(s), ${lv.length || 1} nivel(es)` +
      (unplaced ? `, ${unplaced} sin ubicar` : '') +
      summarize(memberCount, 'barra de dibujo', 'barras de dibujo') +
      (mapConversion ? ', georreferenciado' : '') +
      (out.skipped.length ? ` · omitidos: ${out.skipped.join(', ')}` : '');
    return await save(fileCtx, 'ifc', out.ifcContent, detail);
  } catch (err) {
    console.warn('[export-project-ifc]', err);
    const message = failureMessage(err, 'No se pudo exportar el IFC del proyecto.');
    toast(message, { kind: 'error' });
    return { ok: false, message };
  }
}

/** Id que no es de ningún espacio: su ubicación es la identidad (el origen del proyecto). */
const PROJECT_ORIGIN = '__project__';
