// =============================================================================
// CreateColumnUseCase.ts — Orquesta creación de una columna
// Basado en: CreateColumnUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Point2D, Meters, ValidationWarning } from '../../domain/geometry/types';
import {
  IObjectStore,
  Column,
  RoomId,
  WallId,
  generateId,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { CreateColumnCommand } from '../commands/CreateColumnCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ValidationError } from './types';

export interface CreateColumnInput {
  roomId: RoomId;
  position: Point2D;
  diameter: Meters;
  height: Meters;
  /** Por defecto circular (`diameter` es el diámetro). Rectangular: `diameter` es el ancho. */
  sectionShape?: 'circular' | 'rectangular';
  /** Canto de una rectangular; si falta, cuadrada. */
  dimensionY?: Meters;
  embeddedInWallId?: WallId;
  material?: string;
}

export interface CreateColumnOutput {
  column: Column;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

export class CreateColumnUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
  ) {}

  async execute(input: CreateColumnInput): Promise<CreateColumnOutput> {
    const column = new Column({
      id: generateId(),
      roomId: input.roomId,
      position: input.position,
      diameter: input.diameter,
      sectionShape: input.sectionShape,
      dimensionY: input.dimensionY,
      height: input.height,
      embeddedInWallId: input.embeddedInWallId,
      material: input.material,
    });

    const validationResult = this.validationService.validateColumn(column);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    await this.store.createObject(column);

    const command = new CreateColumnCommand(column);
    await this.commandStack.execute(command);

    return {
      column,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }
}
