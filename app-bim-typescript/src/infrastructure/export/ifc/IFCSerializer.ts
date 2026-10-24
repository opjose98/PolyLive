// =============================================================================
// IFCSerializer.ts — Recinto + niveles del proyecto → IFC4 (STEP) para Revit
// Basado en: ExportRoomIfcUseCase.md, ExportRoomIfcUseCase-detalles.md
//
// Flujo:
//   1. Validar Room (IFC Compatibility Gate — 8 criterios)
//   2. Filtrar objetos soft-deleted
//   3. Contexto, proyecto, sitio, edificio y UN PISO POR NIVEL del proyecto
//   4. Espacio (Room) y losa en el piso base; muros, columnas y vanos en el
//      piso de su restricción de base, con sus restricciones como propiedades
//   5. Retornar contenido IFC como string
//
// Sin dependencias externas: ISO 10303-21 es texto plano. La forma de cada
// entidad se explica en step-writer.ts.
// =============================================================================

import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { RevitObjectBase } from '../../../domain/objects/base';
import { LEVEL_PROP, PHASE_PROP } from '../../../domain/objects/marker';
import { floorZoneId } from '../../../domain/objects/floor';
import { columnForExport, toLocal, wallForExport } from '../../../domain/geometry/handedness';
import { LevelElevations, VerticalExtent, WallProfile, columnVerticalOf, isRectangularProfile, profileArea, profileBottom, profileOutline, profileTop, resolveExtent, resolveWallProfile, revitConstraints, wallVerticalOf } from '../../../domain/objects/vertical';
import { SerializeInput, GateValidationResult, IfcLevelInput } from './types';
import { IfcValue, StepWriter, ref, stepReal, stepString } from './step-writer';
import { stableGuid } from './guid-generator';
import { validate8Criteria } from './compatibility-gate';

/**
 * Resultado de la serialización IFC.
 */
interface SerializeResult {
  /** Contenido STEP completo, listo para escribir a archivo .ifc */
  readonly content: string;
  /** Resultado de la validación Compatibility Gate */
  readonly validation: GateValidationResult;
  /** Cantidad de productos IFC generados (proyecto, pisos, espacio, elementos). */
  readonly entityCount: number;
}

/** Contenido de un espacio (lo que va dentro del proyecto). */
export type SpaceContent = Pick<
  SerializeInput,
  'room' | 'walls' | 'doors' | 'windows' | 'columns' | 'floor' | 'zones' | 'zoneFloors' | 'members' | 'openingSills' | 'bareOpenings'
> & {
  /** Ubicación del espacio en el proyecto (amarre): x, y (m, Y arriba) y giro (rad). */
  readonly placement?: { readonly x: number; readonly y: number; readonly rotation: number };
  /** Niveles y fases del espacio (son de cada espacio); sin niveles, un único «Nivel 0». */
  readonly levels?: readonly IfcLevelInput[];
  readonly phaseNames?: ReadonlyMap<string, string>;
};

/** El proyecto: datos comunes (niveles, fases, georreferencia) y sus espacios. */
export type ProjectSerializeInput = Omit<SerializeInput, keyof SpaceContent> & { readonly spaces: readonly SpaceContent[] };

interface ProjectSerializeResult extends SerializeResult {
  /** Espacios escritos y omitidos (por no pasar la validación). */
  readonly spaces: number;
  readonly skipped: readonly { readonly name: string; readonly validation: GateValidationResult }[];
}

/** Nombre del conjunto de propiedades que lee el plugin de Revit. */
export const REVIT_CONSTRAINTS_PSET = 'PolyLive_RevitConstraints';

/** Piso de respaldo cuando el proyecto no trae niveles. */
const DEFAULT_LEVEL: IfcLevelInput = { id: '__base__', name: 'Nivel 0', elevation: 0, isBase: true };

interface Storey {
  readonly level: IfcLevelInput;
  readonly entity: number;
  readonly placement: number;
  readonly elements: number[];
}

interface HostWall {
  readonly entity: number;
  readonly placement: number;
  readonly thickness: number;
  readonly length: number;
  readonly profile: WallProfile;
  readonly storey: Storey;
}

export class IFCSerializer {
  /** Un espacio en su propio archivo (el contenido y el proyecto en un solo input). */
  async serialize(input: SerializeInput): Promise<SerializeResult> {
    const r = await this.serializeProject({ ...input, spaces: [input] });
    return { content: r.content, validation: r.validation, entityCount: r.entityCount };
  }

  /**
   * El PROYECTO completo en un solo IFC: un IfcProject, un sitio, un edificio,
   * un piso por nivel, y los elementos de TODOS los espacios, cada espacio
   * colocado con su ubicación en el proyecto (la del amarre). Revit lo abre
   * como un modelo (antes: N archivos, uno por espacio, para vincular a mano).
   * Un espacio que no pasa la validación se omite y queda en `skipped`.
   */
  async serializeProject(input: ProjectSerializeInput): Promise<ProjectSerializeResult> {
    // ------------------------------------------------------------------
    // 1. Validar cada espacio con el Compatibility Gate (8 criterios)
    // ------------------------------------------------------------------
    const valid: SpaceContent[] = [];
    const skipped: { name: string; validation: GateValidationResult }[] = [];
    let validation: GateValidationResult | null = null;
    for (const sp of input.spaces) {
      const v = validate8Criteria(sp.room, [...sp.walls, ...sp.doors, ...sp.windows, ...sp.columns, ...(sp.floor ? [sp.floor] : [])]);
      validation ??= v;
      if (v.valid) valid.push(sp);
      else skipped.push({ name: (sp.room.properties.name as string | undefined) ?? (sp.room.id as string), validation: v });
    }
    if (!valid.length) return { content: '', validation: validation ?? skipped[0]?.validation, entityCount: 0, spaces: 0, skipped };

    const w = new StepWriter();
    let products = 0;

    // ------------------------------------------------------------------
    // 3. Contexto, proyecto, sitio, edificio, pisos
    // ------------------------------------------------------------------
    // Los niveles son de cada espacio: el IFC lleva un piso por COTA distinta, y cada
    // espacio cuelga sus elementos del piso de la cota de su nivel.
    const levelsOf = (sp: SpaceContent) =>
      [...(sp.levels?.length ? sp.levels : [DEFAULT_LEVEL])].sort((a, b) => a.elevation - b.elevation);
    const baseOf = (lv: readonly IfcLevelInput[]) => lv.find((l) => l.isBase) ?? lv.find((l) => l.elevation === 0) ?? lv[0];
    let levels = levelsOf(valid[0]);
    let baseLevel = baseOf(levels);
    let elevations: LevelElevations = new Map();

    const context = w.writeContext(input.author ?? '');
    const units = w.writeUnits();
    if (input.mapConversion) w.mapConversion(context, { ...input.mapConversion, geodeticDatum: 'MAGNA-SIRGAS' });
    const oh = ref(w.ownerHistory);
    const projectName = input.projectName ?? 'PolyLive Project';
    const project = w.add(
      `IFCPROJECT('${stableGuid(`project:${input.projectKey ?? projectName}`)}',${oh},${stepString(projectName)},$,$,$,$,(${ref(context)}),${ref(units)})`,
    );

    const sitePlacement = w.placementAt(null, 0, 0, 0);
    const site = w.add(
      `IFCSITE('${stableGuid(`site:${input.projectKey ?? projectName}`)}',${oh},${stepString(input.siteName ?? 'Sitio')},$,$,${ref(sitePlacement)},$,$,.ELEMENT.,$,$,$,$,$)`,
    );
    const buildingPlacement = w.placementAt(sitePlacement, 0, 0, 0);
    const building = w.add(
      `IFCBUILDING('${stableGuid(`building:${input.projectKey ?? projectName}`)}',${oh},${stepString(input.buildingName ?? 'Edificio')},$,$,${ref(buildingPlacement)},$,$,.ELEMENT.,$,$,$)`,
    );

    const storeys = new Map<number, Storey>();
    const guidSources = new Set<string>();
    for (const level of valid.flatMap(levelsOf).sort((a, b) => a.elevation - b.elevation)) {
      if (storeys.has(level.elevation)) continue;
      // El GUID sale del id del nivel; dos espacios pueden compartir id con cotas distintas.
      let source = `storey:${level.id}`;
      if (guidSources.has(source)) source = `storey:${level.id}@${level.elevation}`;
      guidSources.add(source);
      const placement = w.placementAt(buildingPlacement, 0, 0, level.elevation);
      const entity = w.add(
        `IFCBUILDINGSTOREY('${stableGuid(source)}',${oh},${stepString(level.name)},$,$,${ref(placement)},$,$,.ELEMENT.,${stepReal(level.elevation)})`,
      );
      storeys.set(level.elevation, { level, entity, placement, elements: [] });
    }
    let baseStorey = storeys.get(baseLevel.elevation)!;
    const storeyOf = (levelId: string) => storeys.get(elevations.get(levelId) ?? NaN) ?? baseStorey;
    products += 3 + storeys.size;

    w.aggregates(`project:${project}`, project, [site]);
    w.aggregates(`site:${site}`, site, [building]);
    w.aggregates(`building:${building}`, building, [...storeys.values()].map((s) => s.entity));

    const levelName = (id: string | null) => (id === null ? 'Unconnected' : levels.find((l) => l.id === id)?.name ?? baseLevel.name);
    const phaseName = (o: RevitObjectBase) => {
      const id = o.properties?.[PHASE_PROP];
      return typeof id === 'string' ? phaseNames?.get(id) ?? '' : '';
    };
    let phaseNames: ReadonlyMap<string, string> | undefined;

    let spacesWritten = 0;
    for (const sp of valid) {
      levels = levelsOf(sp);
      baseLevel = baseOf(levels);
      elevations = new Map(levels.map((l) => [l.id, l.elevation] as [string, number]));
      baseStorey = storeys.get(baseLevel.elevation)!;
      phaseNames = sp.phaseNames;
      // IFC usa Y hacia arriba (norte); el modelo, Y hacia abajo (ver handedness.ts).
      const walls = sp.walls.filter((wl) => !wl.is_deleted).map(wallForExport);
      const doors = sp.doors.filter((d) => !d.is_deleted);
      const windows = sp.windows.filter((wn) => !wn.is_deleted);
      const columns = sp.columns.filter((c) => !c.is_deleted).map(columnForExport);
      const floor = sp.floor && !sp.floor.is_deleted ? sp.floor : null;
      // Ubicación del espacio en el proyecto (amarre): una colocación por piso, bajo la del piso.
      const pl = sp.placement;
      const moved = !!pl && (pl.x !== 0 || pl.y !== 0 || pl.rotation !== 0);
      const byStorey = new Map<Storey, number>();
      const P = (st: Storey): number => {
        if (!moved) return st.placement;
        let id = byStorey.get(st);
        if (id === undefined) {
          id = w.placementAt(st.placement, pl!.x, pl!.y, 0, { x: Math.cos(pl!.rotation), y: Math.sin(pl!.rotation) });
          byStorey.set(st, id);
        }
        return id;
      };
      // ------------------------------------------------------------------
      // 4a. Espacio (Room) y losa, en el piso base
      // ------------------------------------------------------------------
      /** Alto libre de un espacio: hasta el nivel de arriba, o 3 m en el último. */
      const heightAbove = (storey: Storey) => {
        const above = levels.find((l) => l.elevation > storey.level.elevation);
        return above ? above.elevation - storey.level.elevation : 3;
      };
      const zones = (sp.zones ?? []).filter((z) => z.netPolygon.length >= 3);
      // Un IfcSpace por recinto (habitación de Revit), en el piso de su nivel y a cara interior.
      const spacesByStorey = new Map<Storey, number[]>();
      for (const z of zones) {
        const storey = storeyOf(z.levelId);
        const height = heightAbove(storey);
        const body = w.bodyShape([w.extrusion(w.polygonProfile(z.netPolygon.map(toLocal)), w.origin3Axis, height)]);
        const placement = w.placementAt(P(storey), 0, 0, 0);
        const space = w.add(
          `IFCSPACE('${stableGuid(`zone:${z.id}`)}',${oh},${stepString(z.code)},$,${z.use ? stepString(z.use) : '$'},${ref(placement)},${ref(w.productShape([body]))},${stepString(z.name)},.ELEMENT.,.INTERNAL.,$)`,
        );
        spacesByStorey.set(storey, [...(spacesByStorey.get(storey) ?? []), space]);
        w.propertySet(`zone:${z.id}`, 'Pset_SpaceCommon', space, [
          ['Reference', { identifier: z.code }],
          ['IsExternal', { bool: false }],
          ['NetPlannedArea', { area: z.netArea }],
          ['GrossPlannedArea', { area: z.grossArea }],
        ]);
        w.propertySet(`zone-pl:${z.id}`, REVIT_CONSTRAINTS_PSET, space, [['PolyLiveId', { identifier: z.id }]]);
        w.quantities(`zone:${z.id}`, 'Qto_SpaceBaseQuantities', space, {
          lengths: [
            ['Height', height],
            ['NetPerimeter', z.perimeter],
          ],
          areas: [
            ['NetFloorArea', z.netArea],
            ['GrossFloorArea', z.grossArea],
          ],
        });
        products++;
      }
      for (const [storey, spaces] of spacesByStorey) w.aggregates(`spaces:${storey.entity}:${sp.room.id as string}`, storey.entity, spaces);

      // Suelos ligados a recintos: losa con el contorno neto, bajo la cota del piso.
      const zonesById = new Map(zones.map((z) => [z.id, z]));
      let zoneSlabs = 0;
      for (const f of sp.zoneFloors ?? []) {
        if (f.is_deleted) continue;
        const z = zonesById.get(floorZoneId(f) ?? '');
        if (!z) continue;
        const storey = storeyOf(z.levelId);
        const thickness = (f.thickness as number) || 0.1;
        const body = w.bodyShape([w.extrusion(w.polygonProfile(z.netPolygon.map(toLocal)), w.origin3Axis, thickness)]);
        const placement = w.placementAt(P(storey), 0, 0, -thickness);
        const name = (f.properties.name as string | undefined) ?? `Suelo ${z.code}`;
        const slab = w.add(
          `IFCSLAB('${stableGuid(f.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(w.productShape([body]))},$,.FLOOR.)`,
        );
        storey.elements.push(slab);
        if (f.material) w.associateMaterial(f.id as string, [slab], w.materialLayerSet(f.material, thickness));
        w.quantities(f.id as string, 'Qto_SlabBaseQuantities', slab, {
          lengths: [['Depth', thickness], ['Perimeter', z.perimeter]],
          areas: [['NetArea', z.netArea]],
        });
        zoneSlabs++;
        products++;
      }

      const polygon = sp.room.geometry.map(toLocal);
      if (polygon.length >= 3) {
        if (zones.length === 0) {
          const spaceHeight = heightAbove(baseStorey);
          const body = w.bodyShape([w.extrusion(w.polygonProfile(polygon), w.origin3Axis, spaceHeight)]);
          const placement = w.placementAt(P(baseStorey), 0, 0, 0);
          const name = (sp.room.properties.name as string | undefined) ?? 'Recinto';
          const space = w.add(
            `IFCSPACE('${stableGuid(sp.room.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(w.productShape([body]))},${stepString(name)},.ELEMENT.,.INTERNAL.,$)`,
          );
          w.aggregates(`space:${space}`, baseStorey.entity, [space]);
          products++;
        }

        if (floor && zoneSlabs === 0) {
          const thickness = (floor.thickness as number) || 0.2;
          const slabBody = w.bodyShape([w.extrusion(w.polygonProfile(polygon), w.origin3Axis, thickness)]);
          const slabPlacement = w.placementAt(P(baseStorey), 0, 0, -thickness);
          const slab = w.add(
            `IFCSLAB('${stableGuid(floor.id as string)}',${oh},${stepString((floor.properties.name as string | undefined) ?? 'Losa')},$,$,${ref(slabPlacement)},${ref(w.productShape([slabBody]))},$,.FLOOR.)`,
          );
          baseStorey.elements.push(slab);
          products++;
        }
      }

      // ------------------------------------------------------------------
      // 4b. Muros
      // ------------------------------------------------------------------
      const hosts = new Map<string, HostWall>();
      walls.forEach((wall, i) => {
        const dx = wall.endPoint.x - wall.startPoint.x;
        const dy = wall.endPoint.y - wall.startPoint.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) return; // degenerado: no hay dirección

        const vertical = wallVerticalOf(wall, baseLevel.id, LEVEL_PROP);
        const profile = resolveWallProfile(vertical, elevations);
        const rc = revitConstraints(vertical, elevations);
        const storey = storeyOf(rc.baseLevelId);
        const bottom = profileBottom(profile);
        const thickness = wall.thickness as number;
        const rectangular = isRectangularProfile(profile);
        const name = (wall.properties.name as string | undefined) ?? `Muro ${i + 1}`;
        const material = wall.material ?? (wall.isStructural ? 'Muro portante' : 'Tabique');
        // Huecos de puertas y ventanas de ESTE muro: el área lateral neta los descuenta.
        const openingArea =
          [...doors, ...windows]
            .filter((o) => (o.parentWallId as string) === (wall.id as string))
            .reduce((a, o) => a + (o.width as number) * (o.height as number), 0) +
          (sp.bareOpenings ?? []).filter((o) => o.wallId === (wall.id as string)).reduce((a, o) => a + o.width * o.height, 0);

        const placement = w.placementAt(
          P(storey),
          wall.startPoint.x,
          wall.startPoint.y,
          bottom - storey.level.elevation,
          { x: dx / length, y: dy / length },
        );

        let body: number;
        if (rectangular) {
          // Planta del muro (largo × espesor, centrada en el eje) extruida su altura.
          const plan = w.rectangleProfile(length / 2, 0, length, thickness);
          body = w.bodyShape([w.extrusion(plan, w.origin3Axis, profileTop(profile) - bottom)]);
        } else {
          // Alzado (trapecio) en el plano vertical del muro, extruido a través del espesor.
          const elev = w.polygonProfile(profileOutline(profile, length).map((q) => ({ x: q.x, y: q.z - bottom })));
          body = w.bodyShape([w.extrusion(elev, w.wallPlaneAxis(0, thickness / 2, 0), thickness)]);
        }
        const shape = w.productShape([body, w.axisShape(length)]);
        const type = wall.isStructural ? '.STANDARD.' : '.PARTITIONING.';
        const entity = w.add(
          // IfcWall siempre: IfcWallStandardCase está desaconsejado en IFC4 (los validadores lo marcan).
          `IFCWALL('${stableGuid(wall.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(shape)},$,${type})`,
        );
        storey.elements.push(entity);
        products++;

        const layerSet = w.materialLayerSet(material, thickness);
        w.associateMaterial(wall.id as string, [entity], rectangular ? w.layerSetUsage(layerSet, thickness) : layerSet);

        w.propertySet(wall.id as string, 'Pset_WallCommon', entity, [
          ['Reference', { identifier: name }],
          ['LoadBearing', { bool: wall.isStructural }],
        ]);
        w.propertySet(wall.id as string, REVIT_CONSTRAINTS_PSET, entity, [
          ['PolyLiveId', { identifier: wall.id as string }],
          ['BaseConstraint', { label: levelName(rc.baseLevelId) }],
          ['BaseOffset', { length: rc.baseOffset }],
          ['TopConstraint', { label: levelName(rc.topLevelId) }],
          ['TopOffset', { length: rc.topOffset }],
          ['UnconnectedHeight', { length: rc.unconnectedHeight }],
          ['ProfileEdited', { bool: rc.profileEdited }],
          ...endProps('Start', vertical.start, profile.start, levelName, (id) => elevations.has(id)),
          ...endProps('End', vertical.end, profile.end, levelName, (id) => elevations.has(id)),
          ['Phase', { label: phaseName(wall) }],
        ]);
        const gross = profileArea(profile, length);
        w.quantities(wall.id as string, 'Qto_WallBaseQuantities', entity, {
          lengths: [
            ['Length', length],
            ['Width', thickness],
            ['Height', profileTop(profile) - bottom],
          ],
          areas: [
            ['GrossSideArea', gross],
            ['NetSideArea', Math.max(0, gross - openingArea)],
          ],
          volumes: [
            ['GrossVolume', gross * thickness],
            ['NetVolume', Math.max(0, gross - openingArea) * thickness],
          ],
        });

        hosts.set(wall.id as string, { entity, placement, thickness, length, profile, storey });
      });

      // ------------------------------------------------------------------
      // 4c. Puertas y ventanas (vano + relleno), relativos a su muro
      // ------------------------------------------------------------------
      // El hueco que recorta el muro; lo comparten puertas, ventanas y vanos sin carpintería.
      const cutOpening = (id: string, wallId: string, offset: number, width: number, height: number, sill: number) => {
        const host = hosts.get(wallId);
        if (!host) return null;
        const along = Math.max(0, Math.min(offset, host.length - Math.min(width, host.length)));
        // La base del muro puede subir o bajar a lo largo del eje: el antepecho
        // se mide desde la base en el centro del vano.
        const t = host.length > 0 ? (along + width / 2) / host.length : 0;
        const bottom = profileBottom(host.profile);
        const floorAt = host.profile.start.base + (host.profile.end.base - host.profile.start.base) * t - bottom;
        const z = floorAt + sill;
        const clearance = 0.05;

        const openingPlacement = w.placementAt(host.placement, along, 0, z);
        const cut = w.rectangleProfile(width / 2, height / 2, width, height);
        const openingBody = w.bodyShape([
          w.extrusion(cut, w.wallPlaneAxis(0, host.thickness / 2 + clearance, 0), host.thickness + 2 * clearance),
        ]);
        const opening = w.add(
          `IFCOPENINGELEMENT('${stableGuid(`opening:${id}`)}',${oh},'Vano',$,$,${ref(openingPlacement)},${ref(w.productShape([openingBody]))},$,.OPENING.)`,
        );
        w.add(`IFCRELVOIDSELEMENT('${stableGuid(`voids:${id}`)}',${oh},$,$,${ref(host.entity)},${ref(opening)})`);
        return { host, along, opening, openingPlacement };
      };

      const writeFilling = (vano: Door | Window, kind: 'door' | 'window') => {
        const width = vano.width as number;
        const height = vano.height as number;
        const sill = sp.openingSills?.get(vano.id as string) ?? (kind === 'door' ? 0 : 0.9);
        const cutResult = cutOpening(vano.id as string, vano.parentWallId as string, vano.offsetAlongWall as number, width, height, sill);
        if (!cutResult) return;
        const { host, along, opening, openingPlacement } = cutResult;

        // El relleno: un panel delgado en el plano del muro, para que se vea.
        const panelDepth = Math.min(0.05, host.thickness);
        const panel = w.rectangleProfile(width / 2, height / 2, width, height);
        const fillBody = w.bodyShape([w.extrusion(panel, w.wallPlaneAxis(0, panelDepth / 2, 0), panelDepth)]);
        const fillPlacement = w.placementAt(openingPlacement, 0, 0, 0);
        const name = (vano.properties.name as string | undefined) ?? (kind === 'door' ? 'Puerta' : 'Ventana');
        const fill =
          kind === 'door'
            ? w.add(
                `IFCDOOR('${stableGuid(vano.id as string)}',${oh},${stepString(name)},$,$,${ref(fillPlacement)},${ref(w.productShape([fillBody]))},$,${stepReal(height)},${stepReal(width)},.DOOR.,.NOTDEFINED.,$)`,
              )
            : w.add(
                `IFCWINDOW('${stableGuid(vano.id as string)}',${oh},${stepString(name)},$,$,${ref(fillPlacement)},${ref(w.productShape([fillBody]))},$,${stepReal(height)},${stepReal(width)},.WINDOW.,.SINGLE_PANEL.,$)`,
              );
        w.add(`IFCRELFILLSELEMENT('${stableGuid(`fills:${vano.id}`)}',${oh},$,$,${ref(opening)},${ref(fill)})`);
        host.storey.elements.push(fill);
        // Propiedades y cantidades estándar (las que leen Revit y los cuadros de carpintería).
        w.propertySet(`common:${vano.id}`, kind === 'door' ? 'Pset_DoorCommon' : 'Pset_WindowCommon', fill, [
          ['Reference', { identifier: name }],
          ['IsExternal', { bool: false }],
        ]);
        w.quantities(`qto:${vano.id}`, kind === 'door' ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities', fill, {
          lengths: [
            ['Height', height],
            ['Width', width],
          ],
          areas: [['Area', width * height]],
        });
        w.propertySet(vano.id as string, REVIT_CONSTRAINTS_PSET, fill, [
          ['PolyLiveId', { identifier: vano.id as string }],
          ['HostWallId', { identifier: vano.parentWallId as string }],
          ['OffsetAlongWall', { length: along }],
          ['SillHeight', { length: sill }],
          ['Phase', { label: phaseName(vano) }],
        ]);
        products += 2;
      };
      for (const d of doors) writeFilling(d, 'door');
      for (const win of windows) writeFilling(win, 'window');
      // Vanos sin carpintería: solo el hueco, sin relleno (H-70).
      for (const o of sp.bareOpenings ?? []) {
        if (cutOpening(o.id, o.wallId, o.xOffset, o.width, o.height, o.sillHeight)) products += 1;
      }

      // ------------------------------------------------------------------
      // 4d. Columnas
      // ------------------------------------------------------------------
      columns.forEach((column, i) => {
        const v = columnVerticalOf(column, baseLevel.id, LEVEL_PROP);
        const e = resolveExtent(v, elevations);
        const storey = storeyOf(v.baseLevelId);
        const placement = w.placementAt(P(storey), column.position.x, column.position.y, e.base - storey.level.elevation, {
          x: Math.cos(column.rotation),
          y: Math.sin(column.rotation),
        });
        const section = column.isCircular
          ? w.circleProfile((column.dimensionX as number) / 2)
          : w.rectangleProfile(0, 0, column.dimensionX as number, column.dimensionY as number);
        const body = w.bodyShape([w.extrusion(section, w.origin3Axis, Math.max(0.01, e.top - e.base))]);
        const name = (column.properties.name as string | undefined) ?? `Columna ${i + 1}`;
        const entity = w.add(
          `IFCCOLUMN('${stableGuid(column.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(w.productShape([body]))},$,.COLUMN.)`,
        );
        storey.elements.push(entity);
        products++;
        w.propertySet(column.id as string, 'Pset_ColumnCommon', entity, [
          ['Reference', { identifier: name }],
          ['LoadBearing', { bool: true }],
        ]);
        const dimX = column.dimensionX as number;
        const sectionArea = column.isCircular ? (Math.PI * dimX * dimX) / 4 : dimX * (column.dimensionY as number);
        const colHeight = Math.max(0.01, e.top - e.base);
        w.quantities(column.id as string, 'Qto_ColumnBaseQuantities', entity, {
          lengths: [['Length', colHeight]],
          areas: [['CrossSectionArea', sectionArea]],
          volumes: [['GrossVolume', sectionArea * colHeight]],
        });
        if (column.material) w.associateMaterial(column.id as string, [entity], w.material(column.material));
        const topKnown = v.topLevelId !== null && elevations.has(v.topLevelId);
        w.propertySet(column.id as string, REVIT_CONSTRAINTS_PSET, entity, [
          ['PolyLiveId', { identifier: column.id as string }],
          ['BaseConstraint', { label: levelName(v.baseLevelId) }],
          ['BaseOffset', { length: v.baseOffset }],
          ['TopConstraint', { label: levelName(topKnown ? v.topLevelId : null) }],
          ['TopOffset', { length: topKnown ? v.topOffset : 0 }],
          ['UnconnectedHeight', { length: e.top - e.base }],
          ['BaseElevation', { length: e.base }],
          ['TopElevation', { length: e.top }],
          ['Phase', { label: phaseName(column) }],
        ]);
      });

      // ------------------------------------------------------------------
      // 4e. Estructura dibujada (F6b): vigas, cerchas y correas
      // ------------------------------------------------------------------
      // Planta: eje en planta; la cara superior de la viga queda en el nivel de
      // encima (o, si no hay, en el tope más alto de los muros del nivel).
      // Alzado: (u, v) de la cara del muro → a lo largo del muro y altura sobre
      // su base más baja (v = 0 en el alzado), centrado en el espesor.
      const wallsById = new Map(walls.map((wl) => [wl.id as string, wl] as [string, typeof wl]));
      const topOfLevel = (levelId: string): number => {
        const lv = storeyOf(levelId).level;
        const above = levels.find((l) => l.elevation > lv.elevation + 1e-6);
        if (above) return above.elevation;
        let top = lv.elevation + 2.4;
        for (const h of hosts.values()) if (h.storey.level.id === lv.id) top = Math.max(top, profileTop(h.profile));
        return top;
      };
      const PURLIN_LENGTH = 1; // una correa en sección no trae su largo: se supone 1 m (ver pset)
      for (const m of sp.members ?? []) {
        let storey: Storey;
        let p: { x: number; y: number; z: number };
        let q: { x: number; y: number; z: number };
        let across = { x: 1, y: 0 }; // horizontal de respaldo para barras verticales
        if (m.view.kind === 'plan') {
          storey = storeyOf(m.levelId);
          const z = topOfLevel(m.levelId);
          const a = toLocal(m.a);
          const b = toLocal(m.b);
          p = { x: a.x, y: a.y, z };
          q = { x: b.x, y: b.y, z };
        } else {
          const wall = wallsById.get(m.view.wallId);
          const host = hosts.get(m.view.wallId);
          if (!wall || !host) continue; // el muro ya no existe
          storey = host.storey;
          const ux = (wall.endPoint.x - wall.startPoint.x) / host.length;
          const uy = (wall.endPoint.y - wall.startPoint.y) / host.length;
          across = { x: ux, y: uy };
          const z0 = profileBottom(host.profile);
          const at = (pt: { x: number; y: number }) => ({ x: wall.startPoint.x + ux * pt.x, y: wall.startPoint.y + uy * pt.x, z: z0 + pt.y });
          p = at(m.a);
          q = at(m.b);
          if (m.role === 'purlin') {
            // Sección en la cara: la correa sale perpendicular al muro, por el lado dibujado.
            // Lado A = normal (−uy, ux) del MODELO (Y abajo); con Y arriba esa normal es −(−uy, ux).
            const s = m.view.side === 'A' ? -1 : 1;
            const nx = -uy * s;
            const ny = ux * s;
            p = { x: p.x + nx * (host.thickness / 2), y: p.y + ny * (host.thickness / 2), z: p.z };
            q = { x: p.x + nx * PURLIN_LENGTH, y: p.y + ny * PURLIN_LENGTH, z: p.z };
          }
        }
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dz = q.z - p.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) continue;
        const d = { x: dx / len, y: dy / len, z: dz / len };
        // X local horizontal y perpendicular a la barra (arriba × d); Y local queda hacia arriba.
        let hx = -d.y;
        let hy = d.x;
        const hl = Math.hypot(hx, hy);
        if (hl < 1e-6) {
          hx = across.x;
          hy = across.y;
        } else {
          hx /= hl;
          hy /= hl;
        }
        const axis = w.axis3(w.point3(p.x, p.y, p.z - storey.level.elevation), w.direction3(d.x, d.y, d.z), w.direction3(hx, hy, 0));
        const placement = w.localPlacement(P(storey), axis);
        const section = w.rectangleProfile(0, m.topAligned ? -m.depth / 2 : 0, m.width, m.depth);
        const body = w.bodyShape([w.extrusion(section, w.origin3Axis, len)]);
        const shape = w.productShape([body]);
        const guid = stableGuid(`member:${m.id}`);
        const entity =
          m.role === 'beam'
            ? w.add(`IFCBEAM('${guid}',${oh},${stepString(m.name)},$,$,${ref(placement)},${ref(shape)},$,.BEAM.)`)
            : w.add(
                `IFCMEMBER('${guid}',${oh},${stepString(m.name)},$,$,${ref(placement)},${ref(shape)},$,${m.role === 'chord' ? '.CHORD.' : m.role === 'web' ? '.STRUT.' : '.PURLIN.'})`,
              );
        storey.elements.push(entity);
        products++;
        w.propertySet(`member:${m.id}`, REVIT_CONSTRAINTS_PSET, entity, [
          ['PolyLiveId', { identifier: m.id }],
          ['Section', { label: `${Math.round(m.width * 100)}x${Math.round(m.depth * 100)} cm` }],
          ['Length', { length: len }],
          ['DrawnIn', { label: m.view.kind === 'plan' ? 'Planta' : `Alzado ${m.view.side}` }],
          ...(m.role === 'purlin' ? ([['LengthAssumed', { bool: true }]] as [string, IfcValue][]) : []),
        ]);
        const isBeam = m.role === 'beam';
        w.propertySet(`member:${m.id}`, isBeam ? 'Pset_BeamCommon' : 'Pset_MemberCommon', entity, [
          ['Reference', { identifier: m.name }],
          ['LoadBearing', { bool: true }],
        ]);
        w.quantities(`member:${m.id}`, isBeam ? 'Qto_BeamBaseQuantities' : 'Qto_MemberBaseQuantities', entity, {
          lengths: [['Length', len]],
          areas: [['CrossSectionArea', m.width * m.depth]],
          volumes: [['GrossVolume', m.width * m.depth * len]],
        });
      }
      spacesWritten++;
    }

    // ------------------------------------------------------------------
    // 5. Contención por piso
    // ------------------------------------------------------------------
    for (const s of storeys.values()) {
      if (s.elements.length > 0) w.contained(`storey:${s.level.id}`, s.entity, s.elements);
    }

    const content = w.toString({ name: `${projectName}.ifc`, author: input.author ?? '' });
    return { content, validation: validation!, entityCount: products, spaces: spacesWritten, skipped };
  }
}

/** Restricción de un extremo del muro, desplegada en propiedades. */
function endProps(
  prefix: 'Start' | 'End',
  e: VerticalExtent,
  resolved: { base: number; top: number },
  levelName: (id: string | null) => string,
  levelKnown: (id: string) => boolean,
): [string, IfcValue][] {
  return [
    [`${prefix}BaseLevel`, { label: levelName(e.baseLevelId) }],
    [`${prefix}BaseOffset`, { length: e.baseOffset }],
    [`${prefix}TopLevel`, { label: levelName(e.topLevelId !== null && levelKnown(e.topLevelId) ? e.topLevelId : null) }],
    [`${prefix}TopOffset`, { length: e.topOffset }],
    [`${prefix}UnconnectedHeight`, { length: e.unconnectedHeight }],
    [`${prefix}BaseElevation`, { length: resolved.base }],
    [`${prefix}TopElevation`, { length: resolved.top }],
  ];
}
