// =============================================================================
// IFCSerializer.ts — Clase orquestadora de exportación IFC
// Basado en: ExportRoomIfcUseCase.md, ExportRoomIfcUseCase-detalles.md
//
// Flujo:
//   1. Validar Room (IFC Compatibility Gate — 8 criterios)
//   2. Filtrar objetos soft-deleted
//   3. Recolectar Wall, Door, Window, Column, Floor
//   4. Generar STEP completo (header → project → site → building → space → objetos → footer)
//   5. Retornar contenido IFC como string
//
// Sin dependencias externas: ISO 10303-21 es texto plano.
// =============================================================================

import { Wall } from '../../../domain/objects/wall';
import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { Column } from '../../../domain/objects/column';
import { RevitObjectBase } from '../../../domain/objects/base';
import { SerializeInput, GateValidationResult } from './types';
import { StepWriter } from './step-writer';
import { validate8Criteria } from './compatibility-gate';

/**
 * Resultado de la serialización IFC.
 */
export interface SerializeResult {
  /** Contenido STEP completo, listo para escribir a archivo .ifc */
  readonly content: string;
  /** Resultado de la validación Compatibility Gate */
  readonly validation: GateValidationResult;
  /** Cantidad de entidades IFC generadas */
  readonly entityCount: number;
}

/**
 * IFCSerializer — orquesta la generación de un archivo IFC (STEP/ISO 10303-21)
 * a partir de un Room y sus objetos BIM.
 *
 * Uso:
 *   const serializer = new IFCSerializer();
 *   const result = await serializer.serialize({
 *     room, walls, doors, windows, columns, floor
 *   });
 *   if (result.validation.valid) {
 *     fs.writeFileSync('output.ifc', result.content);
 *   }
 */
export class IFCSerializer {
  /**
   * Serializa un Room con todos sus objetos BIM a formato IFC (STEP).
   *
   * @param input — Room, Walls, Doors, Windows, Columns, Floor
   * @returns SerializeResult con contenido STEP, validación, y conteo de entidades
   * @throws Error si la validación tiene errores bloqueantes
   */
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

    if (!validation.valid) {
      // Errores bloqueantes: retornar con contenido vacío
      return {
        content: '',
        validation,
        entityCount: 0,
      };
    }

    // ------------------------------------------------------------------
    // 2. Filtrar objetos soft-deleted (criterio 7)
    // ------------------------------------------------------------------
    const walls = input.walls.filter((w) => !w.is_deleted);
    const doors = input.doors.filter((d) => !d.is_deleted);
    const windows = input.windows.filter((w) => !w.is_deleted);
    const columns = input.columns.filter((c) => !c.is_deleted);
    const floor = input.floor && !input.floor.is_deleted ? input.floor : null;

    // ------------------------------------------------------------------
    // 3. Generar STEP completo
    // ------------------------------------------------------------------
    const writer = new StepWriter();
    const parts: string[] = [];
    let entityCount = 0;

    // Header
    parts.push(writer.writeHeader('PolyLive BIM Survey Export'));

    // IfcProject (raíz)
    const project = writer.writeProject(input.projectName ?? 'PolyLive Project');
    parts.push(project.lines);
    entityCount++;

    // IfcSite
    const site = writer.writeSite(project.projectId, input.siteName ?? 'Survey Site');
    parts.push(site.lines);
    entityCount++;

    // IfcBuilding
    const building = writer.writeBuilding(site.siteId, input.buildingName ?? 'Building');
    parts.push(building.lines);
    entityCount++;

    // IfcSpace (Room)
    const space = writer.writeSpace(input.room, building.buildingId);
    parts.push(space.lines);
    entityCount++;

    // Mapa de wallId → wallStepId para vincular Doors/Windows
    const wallStepMap = new Map<string, number>();

    // IfcWallStandardCase para cada muro
    for (const wall of walls) {
      const wallResult = writer.writeWall(wall, space.spaceId);
      parts.push(wallResult.lines);
      wallStepMap.set(wall.id as string, wallResult.wallStepId);
      entityCount++;
    }

    // IfcDoor + IfcOpeningElement para cada puerta
    for (const door of doors) {
      const parentWallStepId = wallStepMap.get(door.parentWallId as string);
      if (parentWallStepId !== undefined) {
        const doorResult = writer.writeDoor(door, parentWallStepId);
        parts.push(doorResult.lines);
        entityCount += 2; // Opening + Door
      }
    }

    // IfcWindow + IfcOpeningElement para cada ventana
    for (const win of windows) {
      const parentWallStepId = wallStepMap.get(win.parentWallId as string);
      if (parentWallStepId !== undefined) {
        const winResult = writer.writeWindow(win, parentWallStepId);
        parts.push(winResult.lines);
        entityCount += 2; // Opening + Window
      }
    }

    // IfcColumn para cada columna
    for (const column of columns) {
      const colResult = writer.writeColumn(column, space.spaceId);
      parts.push(colResult.lines);
      entityCount++;
    }

    // IfcSlab (Floor) si existe
    if (floor) {
      const floorResult = writer.writeFloor(floor, input.room, space.spaceId);
      parts.push(floorResult.lines);
      entityCount++;
    }

    // Footer
    parts.push(writer.writeFooter());

    // ------------------------------------------------------------------
    // 4. Ensamblar contenido final
    // ------------------------------------------------------------------
    const content = parts.join('\n');

    return {
      content,
      validation,
      entityCount,
    };
  }
}
