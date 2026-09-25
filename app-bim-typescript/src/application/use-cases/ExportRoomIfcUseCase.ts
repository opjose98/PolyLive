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
import { IValidationService, IIFCSerializer, ValidationError } from './types';

export interface ExportRoomIfcInput {
  roomId: RoomId;
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
    const floor = allObjects.find((o) => o instanceof Floor) as Floor | undefined;

    // 3. Generar IFC
    const ifcContent = await this.ifcSerializer.serialize({
      room,
      walls,
      doors,
      windows,
      columns,
      floor: floor ?? null,
    });

    const exportTime = Date.now() - startTime;

    return {
      ifcContent,
      warnings: validationResult.warnings,
      exportTime,
    };
  }
}
