// =============================================================================
// UpdateObjectPropertyUseCase.ts — Actualiza cualquier propiedad de un objeto BIM
// Basado en: UpdateObjectPropertyUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { ValidationWarning } from '../../domain/geometry/types';
import {
  IObjectStore,
  RevitObjectBase,
  RevitObjectId,
  Wall,
  Column,
  Door,
} from '../../domain/objects';
import { Window } from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { UpdateObjectPropertyCommand } from '../commands/UpdateObjectPropertyCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ValidationError, ValidationResult } from './types';

export interface UpdateObjectPropertyInput {
  objectId: RevitObjectId;
  property: string;
  newValue: unknown;
}

export interface UpdateObjectPropertyOutput {
  object: RevitObjectBase;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

export class UpdateObjectPropertyUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
  ) {}

  async execute(input: UpdateObjectPropertyInput): Promise<UpdateObjectPropertyOutput> {
    // 1. Leer objeto
    const object = await this.store.readObject(input.objectId);
    if (!object) throw new Error('Objeto no existe');

    // 2. Guardar valor anterior
    const oldValue = (object as any)[input.property];

    // 3. Aplicar nuevo valor
    (object as any)[input.property] = input.newValue;

    // 4. Validar según tipo
    const validationResult = this.validateByType(object);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 5. Persistir
    await this.store.updateObject(input.objectId, {
      [input.property]: input.newValue,
    } as any);

    // 6. Comando (con oldValue para undo)
    const command = new UpdateObjectPropertyCommand(
      input.objectId,
      input.property,
      oldValue,
      input.newValue,
    );
    await this.commandStack.execute(command);

    return {
      object,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }

  private validateByType(obj: RevitObjectBase): ValidationResult {
    if (obj instanceof Wall) return this.validationService.validateWall(obj);
    if (obj instanceof Column) return this.validationService.validateColumn(obj);
    if (obj instanceof Door) return this.validationService.validateDoor(obj);
    if (obj instanceof Window) return this.validationService.validateWindow(obj);
    // Otros tipos: validación mínima (siempre válido)
    return { valid: true, warnings: [] };
  }
}
