// =============================================================================
// ExportRoomIfcUseCase.ts — Exporta un Recinto cerrado a IFC
// Basado en: ExportRoomIfcUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { ValidationWarning } from '../../domain/geometry/types';
import {
  IObjectStore,
  Room,
  Wall,
  Door,
  Column,
  Floor,
  RoomId,
  RevitObjectId,
} from '../../domain/objects';
import { Window } from '../../domain/objects';
import { floorZoneId } from '../../domain/objects/floor';
import { IValidationService, IIFCSerializer, ValidationError } from './types';
import type { IfcMapConversionInput, IfcZoneInput } from '../../infrastructure/export/ifc/types';

export interface ExportRoomIfcInput {
  roomId: RoomId;
  /** Niveles del proyecto: cada uno será un piso (IfcBuildingStorey). */
  levels?: readonly { id: string; name: string; elevation: number; isBase?: boolean }[];
  /** Nombre de cada fase por id. */
  phaseNames?: ReadonlyMap<string, string>;
  /** Antepecho de cada vano (id de Door/Window → m sobre la base del muro). */
  openingSills?: ReadonlyMap<string, number>;
  projectName?: string;
  /** Clave estable del proyecto (su id): fija el GUID de IfcProject. */
  projectKey?: string;
  author?: string;
  /** Recintos con identidad: un IfcSpace por recinto (T0). */
  zones?: readonly IfcZoneInput[];
  /** Georreferencia del proyecto (M2b). */
  mapConversion?: IfcMapConversionInput;
}

export interface ExportRoomIfcOutput {
  ifcContent: string;
  warnings: ValidationWarning[];
  exportTime: number; // ms
}

/**
 * Exporta un Recinto cerrado a IFC.
 * NO emite comando al CommandStack — la exportación no es reversible.
 */
export class ExportRoomIfcUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly validationService: IValidationService,
    private readonly ifcSerializer: IIFCSerializer,
  ) {}

  async execute(input: ExportRoomIfcInput): Promise<ExportRoomIfcOutput> {
    const startTime = Date.now();

    // 1. Validar
    const room = await this.store.readObject(input.roomId as unknown as RevitObjectId);
    if (!room || !(room instanceof Room)) throw new Error('Room no existe');

    const validationResult = this.validationService.validateExport(room);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 2. Recolectar objetos
    const allObjects = await this.store.listObjects(input.roomId);
    const walls = allObjects.filter((o) => o instanceof Wall) as Wall[];
    const doors = allObjects.filter((o) => o instanceof Door) as Door[];
    const windows = allObjects.filter((o) => o instanceof Window) as Window[];
    const columns = allObjects.filter((o) => o instanceof Column) as Column[];
    const floors = allObjects.filter((o): o is Floor => o instanceof Floor);
    // El suelo "del espacio" anterior a F6a es el que no está ligado a un recinto.
    const floor = floors.find((f) => floorZoneId(f) === null);

    // 3. Generar IFC
    const ifcContent = await this.ifcSerializer.serialize({
      room,
      walls,
      doors,
      windows,
      columns,
      floor: floor ?? null,
      levels: input.levels,
      phaseNames: input.phaseNames,
      openingSills: input.openingSills,
      projectName: input.projectName,
      projectKey: input.projectKey,
      author: input.author,
      zones: input.zones,
      mapConversion: input.mapConversion,
      zoneFloors: floors.filter((f) => floorZoneId(f) !== null),
    });

    const exportTime = Date.now() - startTime;

    return {
      ifcContent,
      warnings: validationResult.warnings,
      exportTime,
    };
  }
}
