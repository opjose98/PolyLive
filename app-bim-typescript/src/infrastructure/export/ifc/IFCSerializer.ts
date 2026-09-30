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

import { Wall } from '../../../domain/objects/wall';
import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { Column } from '../../../domain/objects/column';
import { RevitObjectBase } from '../../../domain/objects/base';
import { LEVEL_PROP, PHASE_PROP } from '../../../domain/objects/marker';
import { columnForExport, toLocal, wallForExport } from '../../../domain/geometry/handedness';
import {
  LevelElevations,
  VerticalExtent,
  WallProfile,
  columnVerticalOf,
  isRectangularProfile,
  profileBottom,
  profileTop,
  resolveExtent,
  resolveWallProfile,
  revitConstraints,
  wallVerticalOf,
} from '../../../domain/objects/vertical';
import { SerializeInput, GateValidationResult, IfcLevelInput } from './types';
import { IfcValue, StepWriter, ref, stepReal, stepString } from './step-writer';
import { stableGuid } from './guid-generator';
import { validate8Criteria } from './compatibility-gate';

/**
 * Resultado de la serialización IFC.
 */
export interface SerializeResult {
  /** Contenido STEP completo, listo para escribir a archivo .ifc */
  readonly content: string;
  /** Resultado de la validación Compatibility Gate */
  readonly validation: GateValidationResult;
  /** Cantidad de productos IFC generados (proyecto, pisos, espacio, elementos). */
  readonly entityCount: number;
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
  async serialize(input: SerializeInput): Promise<SerializeResult> {
    // ------------------------------------------------------------------
    // 1. Validar con IFC Compatibility Gate (8 criterios)
    // ------------------------------------------------------------------
    const allObjects: RevitObjectBase[] = [
      ...input.walls,
      ...input.doors,
      ...input.windows,
      ...input.columns,
      ...(input.floor ? [input.floor] : []),
    ];
    const validation = validate8Criteria(input.room, allObjects);
    if (!validation.valid) return { content: '', validation, entityCount: 0 };

    // ------------------------------------------------------------------
    // 2. Filtrar objetos soft-deleted (criterio 7)
    // ------------------------------------------------------------------
    // IFC usa Y hacia arriba (norte); el modelo, Y hacia abajo (ver handedness.ts).
    const walls = input.walls.filter((w) => !w.is_deleted).map(wallForExport);
    const doors = input.doors.filter((d) => !d.is_deleted);
    const windows = input.windows.filter((w) => !w.is_deleted);
    const columns = input.columns.filter((c) => !c.is_deleted).map(columnForExport);
    const floor = input.floor && !input.floor.is_deleted ? input.floor : null;

    const w = new StepWriter();
    let products = 0;

    // ------------------------------------------------------------------
    // 3. Contexto, proyecto, sitio, edificio, pisos
    // ------------------------------------------------------------------
    const levels = [...(input.levels?.length ? input.levels : [DEFAULT_LEVEL])].sort((a, b) => a.elevation - b.elevation);
    const baseLevel = levels.find((l) => l.isBase) ?? levels.find((l) => l.elevation === 0) ?? levels[0];
    const elevations: LevelElevations = new Map(levels.map((l) => [l.id, l.elevation] as [string, number]));

    const context = w.writeContext(input.author ?? '');
    const units = w.writeUnits();
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

    const storeys = new Map<string, Storey>();
    for (const level of levels) {
      const placement = w.placementAt(buildingPlacement, 0, 0, level.elevation);
      const entity = w.add(
        `IFCBUILDINGSTOREY('${stableGuid(`storey:${level.id}`)}',${oh},${stepString(level.name)},$,$,${ref(placement)},$,$,.ELEMENT.,${stepReal(level.elevation)})`,
      );
      storeys.set(level.id, { level, entity, placement, elements: [] });
    }
    const baseStorey = storeys.get(baseLevel.id)!;
    const storeyOf = (levelId: string) => storeys.get(levelId) ?? baseStorey;
    products += 3 + storeys.size;

    w.aggregates(`project:${project}`, project, [site]);
    w.aggregates(`site:${site}`, site, [building]);
    w.aggregates(`building:${building}`, building, [...storeys.values()].map((s) => s.entity));

    const levelName = (id: string | null) => (id === null ? 'Unconnected' : levels.find((l) => l.id === id)?.name ?? baseLevel.name);
    const phaseName = (o: RevitObjectBase) => {
      const id = o.properties?.[PHASE_PROP];
      return typeof id === 'string' ? input.phaseNames?.get(id) ?? '' : '';
    };

    // ------------------------------------------------------------------
    // 4a. Espacio (Room) y losa, en el piso base
    // ------------------------------------------------------------------
    const polygon = input.room.geometry.map(toLocal);
    if (polygon.length >= 3) {
      const above = levels.find((l) => l.elevation > baseLevel.elevation);
      const spaceHeight = above ? above.elevation - baseLevel.elevation : 3;
      const body = w.bodyShape([w.extrusion(w.polygonProfile(polygon), w.origin3Axis, spaceHeight)]);
      const placement = w.placementAt(baseStorey.placement, 0, 0, 0);
      const name = (input.room.properties.name as string | undefined) ?? 'Recinto';
      const space = w.add(
        `IFCSPACE('${stableGuid(input.room.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(w.productShape([body]))},${stepString(name)},.ELEMENT.,.INTERNAL.,$)`,
      );
      w.aggregates(`space:${space}`, baseStorey.entity, [space]);
      products++;

      if (floor) {
        const thickness = (floor.thickness as number) || 0.2;
        const slabBody = w.bodyShape([w.extrusion(w.polygonProfile(polygon), w.origin3Axis, thickness)]);
        const slabPlacement = w.placementAt(baseStorey.placement, 0, 0, -thickness);
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

      const placement = w.placementAt(
        storey.placement,
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
        const elev = w.polygonProfile([
          { x: 0, y: profile.start.base - bottom },
          { x: length, y: profile.end.base - bottom },
          { x: length, y: profile.end.top - bottom },
          { x: 0, y: profile.start.top - bottom },
        ]);
        body = w.bodyShape([w.extrusion(elev, w.wallPlaneAxis(0, thickness / 2, 0), thickness)]);
      }
      const shape = w.productShape([w.axisShape(length), body]);
      const type = wall.isStructural ? '.STANDARD.' : '.PARTITIONING.';
      const entity = w.add(
        `${rectangular ? 'IFCWALLSTANDARDCASE' : 'IFCWALL'}('${stableGuid(wall.id as string)}',${oh},${stepString(name)},$,$,${ref(placement)},${ref(shape)},$,${type})`,
      );
      storey.elements.push(entity);
      products++;

      const layerSet = w.materialLayerSet(material, thickness);
      w.associateMaterial(wall.id as string, [entity], rectangular ? w.layerSetUsage(layerSet, thickness) : layerSet);

      w.propertySet(wall.id as string, 'Pset_WallCommon', entity, [['LoadBearing', { bool: wall.isStructural }]]);
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
      const gross = (length * (profile.start.top - profile.start.base + (profile.end.top - profile.end.base))) / 2;
      w.quantities(wall.id as string, 'Qto_WallBaseQuantities', entity, {
        lengths: [
          ['Length', length],
          ['Width', thickness],
          ['Height', profileTop(profile) - bottom],
        ],
        areas: [['GrossSideArea', gross]],
      });

      hosts.set(wall.id as string, { entity, placement, thickness, length, profile, storey });
    });

    // ------------------------------------------------------------------
    // 4c. Puertas y ventanas (vano + relleno), relativos a su muro
    // ------------------------------------------------------------------
    const writeFilling = (vano: Door | Window, kind: 'door' | 'window') => {
      const host = hosts.get(vano.parentWallId as unknown as string);
      if (!host) return;
      const width = vano.width as number;
      const height = vano.height as number;
      const along = Math.max(0, Math.min(vano.offsetAlongWall as number, host.length - Math.min(width, host.length)));
      // La base del muro puede subir o bajar a lo largo del eje: el antepecho
      // se mide desde la base en el centro del vano.
      const t = host.length > 0 ? (along + width / 2) / host.length : 0;
      const bottom = profileBottom(host.profile);
      const floorAt = host.profile.start.base + (host.profile.end.base - host.profile.start.base) * t - bottom;
      const sill = input.openingSills?.get(vano.id as string) ?? (kind === 'door' ? 0 : 0.9);
      const z = floorAt + sill;
      const clearance = 0.05;

      const openingPlacement = w.placementAt(host.placement, along, 0, z);
      const cut = w.rectangleProfile(width / 2, height / 2, width, height);
      const openingBody = w.bodyShape([
        w.extrusion(cut, w.wallPlaneAxis(0, host.thickness / 2 + clearance, 0), host.thickness + 2 * clearance),
      ]);
      const opening = w.add(
        `IFCOPENINGELEMENT('${stableGuid(`opening:${vano.id}`)}',${oh},'Vano',$,$,${ref(openingPlacement)},${ref(w.productShape([openingBody]))},$,.OPENING.)`,
      );
      w.add(`IFCRELVOIDSELEMENT('${stableGuid(`voids:${vano.id}`)}',${oh},$,$,${ref(host.entity)},${ref(opening)})`);

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
      w.propertySet(vano.id as string, REVIT_CONSTRAINTS_PSET, fill, [
        ['PolyLiveId', { identifier: vano.id as string }],
        ['HostWallId', { identifier: vano.parentWallId as unknown as string }],
        ['OffsetAlongWall', { length: along }],
        ['SillHeight', { length: sill }],
        ['Phase', { label: phaseName(vano) }],
      ]);
      products += 2;
    };
    for (const d of doors) writeFilling(d, 'door');
    for (const win of windows) writeFilling(win, 'window');

    // ------------------------------------------------------------------
    // 4d. Columnas
    // ------------------------------------------------------------------
    columns.forEach((column, i) => {
      const v = columnVerticalOf(column, baseLevel.id, LEVEL_PROP);
      const e = resolveExtent(v, elevations);
      const storey = storeyOf(v.baseLevelId);
      const placement = w.placementAt(storey.placement, column.position.x, column.position.y, e.base - storey.level.elevation, {
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
      w.propertySet(column.id as string, 'Pset_ColumnCommon', entity, [['LoadBearing', { bool: true }]]);
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
    // 5. Contención por piso
    // ------------------------------------------------------------------
    for (const s of storeys.values()) {
      if (s.elements.length > 0) w.contained(`storey:${s.level.id}`, s.entity, s.elements);
    }

    const content = w.toString({ name: `${projectName}.ifc`, author: input.author ?? '' });
    return { content, validation, entityCount: products };
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
