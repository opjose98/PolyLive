// =============================================================================
// CloseRoomUseCase.ts — Cierra un Recinto: CDT, área, Floor implícito
// Basado en: CloseRoomUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { ValidationWarning, squareMeters } from '../../domain/geometry/types';
import {
  IObjectStore,
  Room,
  Floor,
  Column,
  RevitObjectId,
  RoomId,
  generateId,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { CloseRoomCommand } from '../commands/CloseRoomCommand';
import { CommandId } from '../commands/Command';
import { IValidationService, ICDT, ValidationError } from './types';

export interface CloseRoomInput {
  roomId: RoomId;
}

export interface CloseRoomOutput {
  room: Room;
  floor: Floor | null;
  warnings: ValidationWarning[];
  commandId: CommandId;
}

export class CloseRoomUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
    private readonly validationService: IValidationService,
    private readonly cdt: ICDT,
  ) {}

  async execute(input: CloseRoomInput): Promise<CloseRoomOutput> {
    const room = await this.store.readObject(input.roomId as unknown as RevitObjectId);
    if (!room || !(room instanceof Room)) throw new Error('Room no existe');

    // 1. Obtener columnas como huecos
    const allObjects = await this.store.listObjects(input.roomId);
    const columns = allObjects.filter((o) => o instanceof Column) as Column[];

    const holes = columns.map((col) => ({
      center: col.position,
      radius: (col.diameter as number) / 2,
    }));

    // 2. Triangular
    const triangulation = await this.cdt.triangulate(room.geometry, holes);

    // 3. Validar
    const validationResult = this.validationService.validateRoom(room, triangulation);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 4. Asignar área y cerrar
    await this.store.updateObject(room.id, {
      area: squareMeters(triangulation.totalArea),
      isOpen: false,
    } as any);

    // 5. Crear Floor implícito si no existe
    let floor: Floor | null = null;
    const floors = allObjects.filter((o) => o instanceof Floor) as Floor[];

    if (floors.length === 0) {
      floor = new Floor({
        id: generateId(),
        roomId: input.roomId,
        isImplicit: true,
        material: 'default',
      });
      await this.store.createObject(floor);
    }

    // 6. Comando
    const command = new CloseRoomCommand(room.id, floor?.id ?? null);
    await this.commandStack.execute(command);

    return {
      room,
      floor,
      warnings: validationResult.warnings,
      commandId: command.id,
    };
  }
}
