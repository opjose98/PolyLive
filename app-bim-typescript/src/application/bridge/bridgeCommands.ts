// =============================================================================
// bridgeCommands.ts — Comandos del puente de control directo (solo desarrollo)
// =============================================================================
//
// El puente (scripts/bridge/polylive-bridge.mjs + infrastructure/bridge) deja
// que un agente levante un plano con COMANDOS en vez de toques de pantalla:
// leer el espacio, crear muros con sus niveles, vanos con su antepecho,
// columnas, suelos y vacíos, partir muros, poner estaciones de altura,
// deshacer y exportar el IFC para revisarlo.
//
// Todo pasa por los mismos casos de uso que la pantalla (validación, comandos
// de deshacer, propiedades de nivel y fase), así lo creado por el puente es
// indistinguible de lo dibujado a mano. Los niveles se nombran por su nombre
// ("Muro", "Cubierta") o por su id; las cotas son metros.
// =============================================================================

import type { AppServices } from '../AppServices';
import type { EditorController } from '../editor/EditorController';
import type { Point2D } from '../../domain/geometry/types';
import { meters } from '../../domain/geometry/types';
import { revitObjectId, wallId as toWallId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Column } from '../../domain/objects/column';
import { Floor, floorZoneId } from '../../domain/objects/floor';
import { LEVEL_PROP, PHASE_PROP, ProjectMarker } from '../../domain/objects/marker';
import {
  LevelElevations,
  VerticalExtent,
  WallVertical,
  extent,
  hostLevelOf,
  profileHeight,
  profileProblem,
  resolveExtent,
  resolveWallProfile,
  wallVerticalOf,
  withStation,
} from '../../domain/objects/vertical';
import type { WallElevation, WallOpeningId } from '../../domain/objects/wall-elevation';
import { ElevationSnapshotCommand } from '../commands/ElevationSnapshotCommand';
import { columnProjection, sectionProjection } from '../section/projection';

/** Lo que el puente necesita de la app en marcha (lo registran App y SurveyScreen). */
export interface BridgeContext {
  readonly services: AppServices;
  /** Editor del espacio abierto, o null fuera de un levantamiento. */
  readonly editor: EditorController | null;
  readonly projectId: string | null;
  readonly spaceId: string | null;
  /** Abre un espacio en la pantalla (navegación de App). */
  readonly open?: (projectId: string, spaceId: string) => Promise<void>;
  /** Acciones que viven en la UI (exportar el IFC tal como lo exporta el menú). */
  readonly exportIfc?: () => Promise<string>;
  /** Acciones de pantalla (encuadrar, abrir alzado o corte…), para revisar a ojo. */
  readonly ui?: Readonly<Record<string, (args: Record<string, unknown>) => unknown>>;
}

type Args = Record<string, unknown>;

/** Campos con nombre propio en los objetos (se escriben directos); lo demás es una propiedad libre. */
const OWN_FIELDS: ReadonlySet<string> = new Set([
  'thickness', 'height', 'material', 'isStructural', 'vertical', 'notes',
  'width', 'offsetAlongWall', 'offsetPerpendicular', 'doorType', 'windowType',
  'rotation', 'dimensionY', 'sectionShape', 'outline', 'holes',
]);
type Xy = readonly [number, number];

/** Restricción por nombres: { base: 'Piso', top: 'Muro', baseOffset?, topOffset?, height? }. */
interface ExtentSpec {
  readonly base?: string;
  readonly top?: string | null;
  readonly baseOffset?: number;
  readonly topOffset?: number;
  readonly height?: number;
}

const HELP = {
  help: 'Esta lista.',
  projects: 'Proyectos con sus espacios (ids y nombres).',
  open: '{ project, space } (id o nombre): abre el espacio en la tableta.',
  levels: 'Niveles y fases del espacio abierto.',
  setLevels: '{ levels: [{ name, value }] } crea o ajusta niveles por nombre (no borra; los objetos siguen atados).',
  objects: 'Muros, vanos (con antepecho), columnas, suelos y recintos del espacio abierto.',
  ops:
    '{ list: [op…] } en orden; cada op devuelve su id. ' +
    'wall {start:[x,y], end:[x,y], thickness, v:{base,top,…} | a:{…}, b:{…}, stations:[{at, top, topOffset}], structural, material, name} · ' +
    'door|window {wall, offset (arranque a lo largo del muro), width, height, sill} · ' +
    'opening {wall, offset, width, height, sill} (vano sin carpintería) · ' +
    'column {at:[x,y], w, d, circular, rotation, v:{base,top}} · ' +
    'floor {zone | outline:[[x,y]…], holes, thickness} · void {floor, hole:[[x,y]…]} · ' +
    'vertical {id, v | a, b, stations} · station {wall, at, top, topOffset, base, baseOffset} (at sin top = quitarla) · ' +
    'sill {id (puerta/ventana), sill} · props {id, set:{clave: valor}} · delete {id} · split {wall, at} · merge {wall, with} (une tramos alineados; el común pasa a estación si quiebra)',
  undo: 'Deshace el último paso.',
  redo: 'Rehace.',
  section: '{ a:[x,y], b:[x,y] } lo que corta esa línea (piezas rayadas del corte).',
  columnView: '{ id } alzado desdoblado de una columna: caras y lo que las atraviesa.',
  ui: '{ action: fit | select {id} | elevation {wall} | column {id} | section {a, b} | close | tool {id} }: mueve la pantalla para revisar a ojo.',
  exportIfc: 'IFC del espacio (el mismo del menú) como texto.',
} as const;

export async function runBridgeCommand(ctx: BridgeContext, cmd: string, args: Args = {}): Promise<unknown> {
  switch (cmd) {
    case 'help':
      return HELP;
    case 'ping':
      return { ok: true, projectId: ctx.projectId, spaceId: ctx.spaceId };
    case 'projects':
      return listProjects(ctx);
    case 'open':
      return open(ctx, args);
    case 'levels':
      return levels(ctx);
    case 'setLevels':
      return setLevels(ctx, args);
    case 'objects':
      return objects(ctx);
    case 'ops':
      return ops(ctx, args);
    case 'undo':
      await editorOf(ctx).undo();
      return { ok: true };
    case 'redo':
      await editorOf(ctx).redo();
      return { ok: true };
    case 'section': {
      const [ax, ay] = args.a as Xy;
      const [bx, by] = args.b as Xy;
      return sectionProjection(ctx.services, scope(ctx).spaceId as never, await markers(ctx, 'level'), { x: ax, y: ay }, { x: bx, y: by });
    }
    case 'columnView': {
      const c = await ctx.services.store.readObject(revitObjectId(String(args.id)));
      if (!(c instanceof Column)) throw new Error(`"${String(args.id)}" no es una columna.`);
      return columnProjection(ctx.services, scope(ctx).spaceId as never, await markers(ctx, 'level'), c);
    }
    case 'ui': {
      const fn = ctx.ui?.[String(args.action)];
      if (!fn) throw new Error(`Acción de pantalla desconocida. Disponibles: ${Object.keys(ctx.ui ?? {}).join(', ')}.`);
      return (await fn(args)) ?? { ok: true };
    }
    case 'exportIfc':
      if (!ctx.exportIfc) throw new Error('Abre un espacio para exportar su IFC.');
      return { ifc: await ctx.exportIfc() };
    default:
      throw new Error(`Comando desconocido: ${cmd}. Prueba "help".`);
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

async function listProjects(ctx: BridgeContext) {
  const out = [];
  for (const p of await ctx.services.projectStore.listProjects()) {
    const spaces = await ctx.services.projectStore.listSpaces(p.id);
    out.push({
      id: p.id as string,
      name: p.name,
      code: p.bimCode,
      spaces: spaces.map((s) => ({ id: s.roomId as string, name: s.name, code: s.bimCode })),
    });
  }
  return out;
}

async function open(ctx: BridgeContext, args: Args) {
  if (!ctx.open) throw new Error('La app no permite navegar desde el puente.');
  const all = await listProjects(ctx);
  const want = String(args.project ?? '');
  const p = all.find((x) => x.id === want || x.name === want || x.code === want);
  if (!p) throw new Error(`No hay proyecto "${want}".`);
  const sw = String(args.space ?? '');
  const s = p.spaces.find((x) => x.id === sw || x.name === sw || x.code === sw) ?? (sw ? undefined : p.spaces[0]);
  if (!s) throw new Error(`El proyecto ${p.name} no tiene el espacio "${sw}".`);
  await ctx.open(p.id, s.id);
  return { project: p.name, space: s.name, spaceId: s.id };
}

async function markers(ctx: BridgeContext, kind: 'level' | 'phase'): Promise<ProjectMarker[]> {
  const { projectId, spaceId } = scope(ctx);
  return ctx.services.markers.list({ projectId, spaceId }, kind);
}

async function levels(ctx: BridgeContext) {
  const [lv, ph] = await Promise.all([markers(ctx, 'level'), markers(ctx, 'phase')]);
  return {
    levels: lv.map((m) => ({ id: m.id, name: m.name, value: m.value, base: m.isBase })),
    phases: ph.map((m) => ({ id: m.id, name: m.name, value: m.value, base: m.isBase })),
  };
}

async function setLevels(ctx: BridgeContext, args: Args) {
  const sc = scope(ctx);
  const want = (args.levels as { name: string; value: number }[] | undefined) ?? [];
  let current = await markers(ctx, 'level');
  for (const l of want) {
    // La cota 0 es la base: se renombra. Las demás se buscan por nombre o se crean.
    let m = current.find((x) => x.name === l.name) ?? (Math.abs(l.value) < 1e-9 ? current.find((x) => x.isBase) : undefined);
    if (!m) {
      m = await ctx.services.markers.add(sc, 'level', l.name);
      current = await markers(ctx, 'level');
    }
    if (m.name !== l.name) await ctx.services.markers.rename(sc, m.id, l.name);
    if (!m.isBase && Math.abs(m.value - l.value) > 1e-9) {
      const r = await ctx.services.markers.setValue(sc, m.id, l.value);
      if (!r.ok) throw new Error(`No se pudo poner ${l.name} a ${l.value} m (${r.reason}).`);
    }
  }
  await ctx.editor?.reload();
  return levels(ctx);
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const xy = (p: Point2D): Xy => [r3(p.x), r3(p.y)];

async function objects(ctx: BridgeContext) {
  const { spaceId } = scope(ctx);
  const lv = await markers(ctx, 'level');
  const elev = new Map(lv.map((m) => [m.id, m.value] as [string, number]));
  const name = (id: string | null) => (id === null ? null : lv.find((m) => m.id === id)?.name ?? id);
  const base = lv.find((m) => m.isBase)?.id ?? '';
  const ext = (e: VerticalExtent) => ({
    base: name(e.baseLevelId),
    ...(e.baseOffset ? { baseOffset: e.baseOffset } : {}),
    top: name(e.topLevelId),
    ...(e.topOffset ? { topOffset: e.topOffset } : {}),
    ...(e.topLevelId === null ? { height: e.unconnectedHeight } : {}),
  });
  const all = await ctx.services.store.listObjects(spaceId as never);
  const elevations = await ctx.services.elevations.listElevations(spaceId as never);
  const sillOf = new Map<string, number>();
  const bare: unknown[] = [];
  for (const e of elevations) {
    for (const o of e.openings) {
      if (o.vanoId) sillOf.set(o.vanoId, o.sillHeight);
      else if (all.some((w) => (w.id as string) === e.wallId))
        bare.push({ id: o.id, wall: e.wallId, offset: r3(o.xOffset), width: o.width, height: o.height, sill: o.sillHeight });
    }
  }
  const zones = await ctx.services.zones.list(spaceId as string);
  return {
    walls: all
      .filter((o): o is Wall => o instanceof Wall)
      .map((w) => {
        const v = wallVerticalOf(w, base, LEVEL_PROP);
        const p = resolveWallProfile(v, elev, w.length as number);
        return {
          id: w.id,
          name: w.properties.name,
          start: xy(w.startPoint),
          end: xy(w.endPoint),
          length: r3(w.length as number),
          thickness: w.thickness,
          structural: w.isStructural,
          a: ext(v.start),
          b: ext(v.end),
          ...(v.stations?.length ? { stations: v.stations.map((s) => ({ at: s.at, ...ext(s.ext) })) } : {}),
          tops: [r3(p.start.top), ...(p.stations ?? []).map((s) => r3(s.top)), r3(p.end.top)],
        };
      }),
    doors: all.filter((o): o is Door => o instanceof Door).map((d) => vanoRow(d, sillOf)),
    windows: all.filter((o): o is Window => o instanceof Window).map((d) => vanoRow(d, sillOf)),
    openings: bare,
    columns: all
      .filter((o): o is Column => o instanceof Column)
      .map((c) => {
        const e = resolveExtent(c.vertical ?? extent({ baseLevelId: base, unconnectedHeight: c.height as number }), elev);
        return {
          id: c.id,
          at: xy(c.position),
          w: c.dimensionX,
          d: c.sectionShape === 'circular' ? undefined : c.dimensionY ?? c.dimensionX,
          circular: c.sectionShape === 'circular',
          rotation: c.rotation,
          ...(c.vertical ? ext(c.vertical) : {}),
          bottom: r3(e.base),
          top: r3(e.top),
        };
      }),
    floors: all
      .filter((o): o is Floor => o instanceof Floor)
      .map((f) => ({
        id: f.id,
        name: f.properties.name,
        zone: floorZoneId(f),
        thickness: f.thickness,
        ...(f.outline ? { outline: f.outline.map(xy) } : {}),
        ...(f.holes?.length ? { holes: f.holes.map((h) => h.map(xy)) } : {}),
      })),
    zones: zones.map((z) => ({ id: z.id, number: z.number, name: z.name, level: name(z.levelId) })),
  };
}

function vanoRow(v: Door | Window, sillOf: ReadonlyMap<string, number>) {
  return {
    id: v.id,
    wall: v.parentWallId,
    offset: r3(v.offsetAlongWall as number),
    width: v.width,
    height: v.height,
    sill: sillOf.get(v.id as string) ?? (v instanceof Door ? 0 : undefined),
  };
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

async function ops(ctx: BridgeContext, args: Args) {
  const list = (args.list as Args[] | undefined) ?? [];
  const editor = editorOf(ctx);
  const lv = await markers(ctx, 'level');
  const elev: LevelElevations = new Map(lv.map((m) => [m.id, m.value] as [string, number]));
  const base = lv.find((m) => m.isBase)?.id ?? '';
  const levelId = (ref: string | undefined | null, fallback: string | null): string | null => {
    if (ref === undefined) return fallback;
    if (ref === null) return null;
    const m = lv.find((x) => x.id === ref || x.name === ref);
    if (!m) throw new Error(`No hay nivel "${ref}". Niveles: ${lv.map((x) => x.name).join(', ')}.`);
    return m.id;
  };
  const toExtent = (s: ExtentSpec | undefined, dflt?: VerticalExtent): VerticalExtent =>
    extent({
      baseLevelId: levelId(s?.base, dflt?.baseLevelId ?? base) ?? base,
      baseOffset: s?.baseOffset ?? (s?.base === undefined ? dflt?.baseOffset : 0),
      topLevelId: levelId(s?.top, dflt?.topLevelId ?? null),
      topOffset: s?.topOffset ?? (s?.top === undefined ? dflt?.topOffset : 0),
      unconnectedHeight: s?.height ?? dflt?.unconnectedHeight ?? 2.8,
    });
  const verticalOf = (o: Args, current?: WallVertical): WallVertical => {
    const start = o.v || o.a ? toExtent((o.v ?? o.a) as ExtentSpec, current?.start) : current?.start ?? toExtent(undefined);
    const end = o.v || o.b ? toExtent((o.v ?? o.b) as ExtentSpec, current?.end) : current?.end ?? start;
    let v: WallVertical = { start, end, ...(current?.stations ? { stations: current.stations } : {}) };
    for (const s of (o.stations as (ExtentSpec & { at: number })[] | undefined) ?? []) {
      v = withStation(v, { at: s.at, ext: toExtent(s, start) });
    }
    return v;
  };
  const wallOf = async (id: unknown): Promise<Wall> => {
    const w = await ctx.services.store.readObject(revitObjectId(String(id)));
    if (!(w instanceof Wall)) throw new Error(`"${String(id)}" no es un muro.`);
    return w;
  };
  const checkProfile = (v: WallVertical, length: number): number => {
    const p = resolveWallProfile(v, elev, length);
    const problem = profileProblem(p);
    if (problem) throw new Error(problem);
    return profileHeight(p);
  };
  // Lo que se escribe en el alzado entra en la historia como en la pantalla (un paso de deshacer).
  const undoable = (before: WallElevation, after: WallElevation) =>
    ctx.services.commandStack.execute(
      new ElevationSnapshotCommand((e) => ctx.services.elevations.saveElevation(e), { elevation: before, vanos: new Map() }, { elevation: after, vanos: new Map() }),
    );
  const setSill = async (wall: Wall, vanoId: string, sill: number) => {
    const e = await ctx.services.elevations.getElevation(wall);
    const o = e.openings.find((x) => x.vanoId === vanoId);
    if (!o) return;
    const r = await ctx.services.elevations.updateOpening(e, wall, o.id as WallOpeningId, { sillHeight: sill });
    await undoable(e, r.elevation);
  };
  const roomId = scope(ctx).spaceId as never;

  const results: unknown[] = [];
  try {
    for (const [i, o] of list.entries()) {
      try {
        results.push(await runOp(o));
      } catch (err) {
        const msg = (err as { userMessage?: string }).userMessage ?? (err as Error).message ?? String(err);
        throw new Error(`op ${i} (${String(o.op)}): ${msg}`);
      }
    }
  } finally {
    await editor.reload();
  }
  return results;

  async function runOp(o: Args): Promise<unknown> {
    switch (o.op) {
      case 'wall': {
        const v = verticalOf(o);
        const [sx, sy] = o.start as Xy;
        const [ex, ey] = o.end as Xy;
        const len = Math.hypot(ex - sx, ey - sy);
        const height = checkProfile(v, len);
        const { wall } = await ctx.services.useCases.createWall.execute({
          roomId,
          startPoint: { x: sx, y: sy },
          endPoint: { x: ex, y: ey },
          thickness: meters(Number(o.thickness ?? 0.15)),
          height: meters(height),
          material: o.material as string | undefined,
          vertical: v,
          properties: { ...editor.creationProps(hostLevelOf(v, elev, len)), ...(o.name ? { name: String(o.name) } : {}) },
        });
        if (o.structural === false) {
          await ctx.services.useCases.updateObjectProperty.execute({ objectId: wall.id, property: 'isStructural', newValue: false });
        }
        return wall.id;
      }
      case 'door':
      case 'window': {
        const wall = await wallOf(o.wall);
        const params = {
          roomId,
          parentWallId: toWallId(wall.id as string),
          offsetAlongWall: meters(Number(o.offset)),
          offsetPerpendicular: meters(0),
          width: meters(Number(o.width)),
          height: meters(Number(o.height)),
          properties: editor.creationProps(wall.properties[LEVEL_PROP] as string | undefined),
        };
        const id =
          o.op === 'door'
            ? (await ctx.services.useCases.createDoor.execute(params)).door.id
            : (await ctx.services.useCases.createWindow.execute(params)).window.id;
        if (o.sill !== undefined) await setSill(wall, id as string, Number(o.sill));
        return id;
      }
      case 'opening': {
        const wall = await wallOf(o.wall);
        const e = await ctx.services.elevations.getElevation(wall);
        const r = await ctx.services.elevations.addOpening(e, wall, {
          type: 'opening',
          xOffset: Number(o.offset),
          width: Number(o.width),
          height: Number(o.height),
          sillHeight: Number(o.sill ?? 0),
        });
        await undoable(e, r.elevation);
        return r.opening.id;
      }
      case 'sill': {
        const v = await ctx.services.store.readObject(revitObjectId(String(o.id)));
        if (!(v instanceof Door) && !(v instanceof Window)) throw new Error(`"${String(o.id)}" no es puerta ni ventana.`);
        await setSill(await wallOf(v.parentWallId), v.id as string, Number(o.sill));
        return v.id;
      }
      case 'column': {
        const e = toExtent(o.v as ExtentSpec | undefined);
        const r = resolveExtent(e, elev);
        if (r.top - r.base < 0.1) throw new Error('El tope de la columna queda por debajo de su base.');
        const [x, y] = o.at as Xy;
        const { column } = await ctx.services.useCases.createColumn.execute({
          roomId,
          position: { x, y },
          diameter: meters(Number(o.w ?? 0.25)),
          dimensionY: o.d !== undefined ? meters(Number(o.d)) : undefined,
          sectionShape: o.circular ? 'circular' : 'rectangular',
          height: meters(r.top - r.base),
          vertical: e,
          properties: { ...editor.creationProps(e.baseLevelId), ...(o.name ? { name: String(o.name) } : {}) },
        });
        if (o.rotation) {
          await ctx.services.useCases.updateObjectProperty.execute({ objectId: column.id, property: 'rotation', newValue: Number(o.rotation) });
        }
        return column.id;
      }
      case 'floor': {
        const { floor } = await ctx.services.useCases.createFloor.execute({
          roomId,
          zoneId: o.zone as string | undefined,
          outline: (o.outline as Xy[] | undefined)?.map(([x, y]) => ({ x, y })),
          thickness: meters(Number(o.thickness ?? 0.1)),
          properties: { ...editor.creationProps(), ...(o.name ? { name: String(o.name) } : {}) },
        });
        if (o.holes) {
          await ctx.services.useCases.updateObjectProperty.execute({
            objectId: floor.id,
            property: 'holes',
            newValue: (o.holes as Xy[][]).map((h) => h.map(([x, y]) => ({ x, y }))),
          });
        }
        return floor.id;
      }
      case 'void': {
        const f = await ctx.services.store.readObject(revitObjectId(String(o.floor)));
        if (!(f instanceof Floor)) throw new Error(`"${String(o.floor)}" no es un suelo.`);
        const hole = (o.hole as Xy[]).map(([x, y]) => ({ x, y }));
        await ctx.services.useCases.updateObjectProperty.execute({ objectId: f.id, property: 'holes', newValue: [...(f.holes ?? []), hole] });
        return f.id;
      }
      case 'vertical':
      case 'station': {
        const id = o.op === 'vertical' ? o.id : o.wall;
        const obj = await ctx.services.store.readObject(revitObjectId(String(id)));
        if (obj instanceof Column) {
          const e = toExtent(o.v as ExtentSpec, obj.vertical);
          const r = resolveExtent(e, elev);
          await ctx.services.useCases.updateObjectProperty.execute({ objectId: obj.id, property: 'vertical', newValue: e, also: { height: meters(r.top - r.base) } });
          return obj.id;
        }
        if (!(obj instanceof Wall)) throw new Error(`"${String(id)}" no es un muro ni una columna.`);
        const current = wallVerticalOf(obj, base, LEVEL_PROP);
        let next: WallVertical;
        if (o.op === 'vertical') {
          next = verticalOf(o, o.stations === null ? { start: current.start, end: current.end } : current);
        } else if (o.top === undefined && o.base === undefined && o.topOffset === undefined) {
          const rest = (current.stations ?? []).filter((s) => Math.abs(s.at - Number(o.at)) > 1e-3);
          next = rest.length ? { ...current, stations: rest } : { start: current.start, end: current.end };
        } else {
          next = withStation(current, { at: Number(o.at), ext: toExtent(o as ExtentSpec, current.start) });
        }
        const height = checkProfile(next, obj.length as number);
        await ctx.services.useCases.updateObjectProperty.execute({ objectId: obj.id, property: 'vertical', newValue: next, also: { height: meters(height) } });
        return obj.id;
      }
      case 'props': {
        const id = revitObjectId(String(o.id));
        const obj = await ctx.services.store.readObject(id);
        if (!obj) throw new Error(`No existe "${String(o.id)}".`);
        // Campos propios del objeto van directos; el resto (nombre, nivel, fase…) a `properties`, como el panel.
        const free: Record<string, unknown> = {};
        for (const [k, val] of Object.entries((o.set as Args) ?? {})) {
          const key = k === 'level' ? LEVEL_PROP : k === 'phase' ? PHASE_PROP : k;
          if (OWN_FIELDS.has(key)) await ctx.services.useCases.updateObjectProperty.execute({ objectId: id, property: key, newValue: val });
          else free[key] = val;
        }
        if (Object.keys(free).length) {
          await ctx.services.useCases.updateObjectProperty.execute({ objectId: id, property: 'properties', newValue: { ...obj.properties, ...free } });
        }
        return o.id;
      }
      case 'delete':
        await ctx.services.useCases.deleteObject.execute({ objectId: revitObjectId(String(o.id)) });
        return o.id;
      case 'merge': {
        const a = await wallOf(o.wall);
        const b = await wallOf(o.with);
        const r = await ctx.services.useCases.mergeWalls.execute({
          keepId: a.id,
          removeId: b.id,
          keepVertical: wallVerticalOf(a, base, LEVEL_PROP),
          removeVertical: wallVerticalOf(b, base, LEVEL_PROP),
          levels: elev,
        });
        return { id: a.id, length: r.length, mismatch: r.mismatch };
      }
      case 'split': {
        const wall = await wallOf(o.wall);
        const r = await ctx.services.useCases.splitWall.execute({
          wallId: wall.id,
          distance: Number(o.at),
          vertical: wallVerticalOf(wall, base, LEVEL_PROP),
          levels: elev,
        });
        return r.newWallId;
      }
      default:
        throw new Error(`op desconocida: ${String(o.op)}`);
    }
  }
}

// ---------------------------------------------------------------------------

function scope(ctx: BridgeContext): { projectId: string; spaceId: string } {
  if (!ctx.projectId || !ctx.spaceId) throw new Error('No hay un espacio abierto: usa "open".');
  return { projectId: ctx.projectId, spaceId: ctx.spaceId };
}

function editorOf(ctx: BridgeContext): EditorController {
  if (!ctx.editor) throw new Error('No hay un levantamiento abierto: usa "open".');
  return ctx.editor;
}

