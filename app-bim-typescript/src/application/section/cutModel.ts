// =============================================================================
// cutModel.ts — El espacio, listo para cortarlo con un plano vertical
// =============================================================================
//
// Resuelve lo que domain/section/sectionCut necesita en cotas absolutas: muros
// con su perfil (extremos y estaciones) y sus huecos, columnas con su huella,
// suelos (de recinto y libres, con vacíos) como losas bajo su nivel, y las
// vigas dibujadas en planta. Lo usan el alzado de un muro, el corte y el
// alzado de una columna.
// =============================================================================

import type { AppServices } from '../AppServices';
import type { RoomId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Column } from '../../domain/objects/column';
import { Floor, circlePolygon, floorZoneId } from '../../domain/objects/floor';
import { LEVEL_PROP } from '../../domain/objects/marker';
import {
  LevelElevations,
  columnVerticalOf,
  profileAt,
  profileBottom,
  resolveExtent,
  resolveWallProfile,
  wallVerticalOf,
} from '../../domain/objects/vertical';
import type { Point2D } from '../../domain/geometry/types';
import type { CutColumn, CutModel, CutSlab, CutWall } from '../../domain/section/sectionCut';
import { draftIfcMembers } from '../drafting/draftExport';

/** Huella de una columna: rectángulo girado o polígono del círculo. */
function columnFootprint(c: Column): Point2D[] {
  const w = c.dimensionX as number;
  if (c.sectionShape === 'circular') return circlePolygon(c.position, w / 2, 24);
  const d = (c.dimensionY as number | undefined) ?? w;
  const t = ((c.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: c.position.x + x * cos - y * sin, y: c.position.y + x * sin + y * cos }));
}

export async function loadCutModel(
  services: AppServices,
  spaceId: RoomId,
  levels: LevelElevations,
  baseLevelId: string,
): Promise<CutModel> {
  const [objects, elevations, zones, drafts] = await Promise.all([
    services.store.listObjects(spaceId),
    services.elevations.listElevations(spaceId),
    services.zones.list(spaceId as string),
    services.drafts.list(spaceId as string).catch(() => []),
  ]);
  const vanos = new Map(
    objects.filter((o): o is Door | Window => o instanceof Door || o instanceof Window).map((v) => [v.id as string, v]),
  );
  const elevOf = new Map(elevations.map((e) => [e.wallId, e]));
  const lv = (id: string | undefined) => (id ? levels.get(id) ?? 0 : 0);

  const walls: CutWall[] = [];
  for (const w of objects) {
    if (!(w instanceof Wall) || !w.isStraight) continue;
    const L = w.length as number;
    const profile = resolveWallProfile(wallVerticalOf(w, baseLevelId, LEVEL_PROP), levels, L);
    const bottom = profileBottom(profile);
    const seen = new Set<string>();
    // Un hueco cuyo vano ya no existe (puerta borrada) no corta: el alzado guardado no se reconcilia al listarlo.
    const live = (elevOf.get(w.id as string)?.openings ?? []).filter((o) => !o.vanoId || vanos.has(o.vanoId));
    const openings = live.map((o) => {
      const v = o.vanoId ? vanos.get(o.vanoId) : undefined;
      if (o.vanoId) seen.add(o.vanoId);
      const x0 = v ? (v.offsetAlongWall as number) : o.xOffset;
      const width = v ? (v.width as number) : o.width;
      const height = v ? (v.height as number) : o.height;
      return { x0, x1: x0 + width, z0: bottom + o.sillHeight, z1: bottom + o.sillHeight + height };
    });
    // Vanos sin hueco en el alzado guardado (nunca se abrió): puertas al suelo, ventanas a 0,90.
    for (const v of vanos.values()) {
      if ((v.parentWallId as string) !== (w.id as string) || seen.has(v.id as string)) continue;
      const sill = v instanceof Door ? 0 : 0.9;
      const x0 = v.offsetAlongWall as number;
      openings.push({ x0, x1: x0 + (v.width as number), z0: bottom + sill, z1: bottom + sill + (v.height as number) });
    }
    walls.push({
      id: w.id as string,
      start: w.startPoint,
      end: w.endPoint,
      thickness: w.thickness as number,
      profileAt: (s) => profileAt(profile, L, s),
      openings,
    });
  }

  const columns: CutColumn[] = objects
    .filter((o): o is Column => o instanceof Column)
    .map((c) => {
      const e = resolveExtent(columnVerticalOf(c, baseLevelId, LEVEL_PROP), levels);
      return { id: c.id as string, footprint: columnFootprint(c), base: e.base, top: e.top };
    });

  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const slabs: CutSlab[] = [];
  for (const f of objects) {
    if (!(f instanceof Floor)) continue;
    const z = zonesById.get(floorZoneId(f) ?? '');
    const outline = z ? z.netPolygon : f.outline;
    if (!outline || outline.length < 3) continue;
    const own = f.properties[LEVEL_PROP];
    slabs.push({
      id: f.id as string,
      outline,
      holes: f.holes ?? [],
      top: lv(typeof own === 'string' ? own : z ? z.levelId : baseLevelId),
      thickness: (f.thickness as number | undefined) || 0.1,
    });
  }

  const beams = draftIfcMembers(drafts)
    .filter((m) => m.role === 'beam' && m.view.kind === 'plan')
    .map((m) => ({ id: m.id, a: m.a, b: m.b, width: m.width, top: lv(m.levelId || baseLevelId), depth: m.depth }));

  return { walls, columns, slabs, beams };
}
