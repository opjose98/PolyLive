// =============================================================================
// CreateWindowUseCase.ts — Orquesta creación de una ventana en un muro
// Basado en: CreateWindowUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { Meters, ValidationWarning } from '../../domain/geometry/types';
import {
  revitObjectId,
  IObjectStore,
  Wall,
  RoomId,
  WallId,
  RevitObjectId,
  generateId,
  ObjectProperties,
 Window } from '../../domain/objects';

import { CommandStack } from '../state/CommandStack';
import { CreateWindowCommand } from '../commands/CreateWindowCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ValidationError } from './types';

export interface CreateWindowInput {
  roomId: RoomId;
  parentWallId: WallId;
  offsetAlongWall: Meters;
  offsetPerpendicular: Meters;
  width: Meters;
  height: Meters;
  windowType?: string;
  frameType?: string;
  glazing?: string;
  /** Propiedades libres con que nace (nivel y fase activos, p. ej.). */
  properties?: ObjectProperties;
}

export interface CreateWindowOutput {
  window: Window;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

export class CreateWindowUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
  ) {}

  async execute(input: CreateWindowInput): Promise<CreateWindowOutput> {
    // 1. Verificar Wall padre
    const parentWall = await this.store.readObject(revitObjectId(input.parentWallId));
    if (!parentWall || !(parentWall instanceof Wall)) {
      throw new Error('Wall padre no existe o no es un Wall');
    }

    // 2. Crear ventana
    const window = new Window({
      id: generateId(),
      roomId: input.roomId,
      parentWallId: input.parentWallId,
      offsetAlongWall: input.offsetAlongWall,
      offsetPerpendicular: input.offsetPerpendicular,
      width: input.width,
      height: input.height,
      windowType: input.windowType,
      frameType: input.frameType,
      glazing: input.glazing,
      properties: input.properties,
    });

    // 3. Validar
    const validationResult = this.validationService.validateWindow(window, {
      walls: [parentWall],
    });
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 4. Persistir
    await this.store.createObject(window);

    // 5. Comando
    const command = new CreateWindowCommand(window);
    await this.commandStack.execute(command);

    return {
      window,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }
}
