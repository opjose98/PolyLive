// =============================================================================
// CreateWallUseCase.ts — Orquesta creación de un muro
// Basado en: CreateWallUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Point2D, Meters, ValidationWarning } from '../../domain/geometry/types';
import {
  IObjectStore,
  Wall,
  RoomId,
  RevitObjectId,
  generateId,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { CreateWallCommand } from '../commands/CreateWallCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ValidationError } from './types';

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface CreateWallInput {
  roomId: RoomId;
  startPoint: Point2D;
  endPoint: Point2D;
  thickness: Meters;
  height: Meters;
  material?: string;
}

export interface CreateWallOutput {
  wall: Wall;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

// ---------------------------------------------------------------------------
// UseCase
// ---------------------------------------------------------------------------

export class CreateWallUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
  ) {}

  async execute(input: CreateWallInput): Promise<CreateWallOutput> {
    // 1. Crear objeto Wall temporal
    const wall = new Wall({
      id: generateId(),
      roomId: input.roomId,
      startPoint: input.startPoint,
      endPoint: input.endPoint,
      thickness: input.thickness,
      height: input.height,
      material: input.material,
    });

    // 2. Validar
    const validationResult = this.validationService.validateWall(wall);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 3. Persistir
    await this.store.createObject(wall);

    // 4. Emitir comando
    const command = new CreateWallCommand(wall);
    await this.commandStack.execute(command);

    // 5. Retornar
    return {
      wall,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }
}
