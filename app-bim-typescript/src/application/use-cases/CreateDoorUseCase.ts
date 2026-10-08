// =============================================================================
// CreateDoorUseCase.ts — Orquesta creación de una puerta en un muro
// Basado en: CreateDoorUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Meters, ValidationWarning } from '../../domain/geometry/types';
import {
  revitObjectId,
  IObjectStore,
  Door,
  Wall,
  RoomId,
  WallId,
  generateId,
  ObjectProperties,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { CreateDoorCommand } from '../commands/CreateDoorCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ValidationError } from './types';

export interface CreateDoorInput {
  roomId: RoomId;
  parentWallId: WallId;
  offsetAlongWall: Meters;
  offsetPerpendicular: Meters;
  width: Meters;
  height: Meters;
  doorType?: string;
  material?: string;
  /** Propiedades libres con que nace (nivel y fase activos, p. ej.). */
  properties?: ObjectProperties;
}

export interface CreateDoorOutput {
  door: Door;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

export class CreateDoorUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
  ) {}

  async execute(input: CreateDoorInput): Promise<CreateDoorOutput> {
    // 1. Verificar Wall padre existe
    const parentWall = await this.store.readObject(revitObjectId(input.parentWallId));
    if (!parentWall || !(parentWall instanceof Wall)) {
      throw new Error('Wall padre no existe o no es un Wall');
    }

    // 2. Crear puerta
    const door = new Door({
      id: generateId(),
      roomId: input.roomId,
      parentWallId: input.parentWallId,
      offsetAlongWall: input.offsetAlongWall,
      offsetPerpendicular: input.offsetPerpendicular,
      width: input.width,
      height: input.height,
      doorType: input.doorType,
      material: input.material,
      properties: input.properties,
    });

    // 3. Validar
    const validationResult = this.validationService.validateDoor(door, {
      walls: [parentWall],
    });
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 4. Persistir
    await this.store.createObject(door);

    // 5. Comando
    const command = new CreateDoorCommand(door);
    await this.commandStack.execute(command);

    return {
      door,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }
}
