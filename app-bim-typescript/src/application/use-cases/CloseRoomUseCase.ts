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

/**
 * Approximates a circle as a regular polygon with `segments` vertices.
 * Used to convert Column holes (circle) to the polygon format that ICDT expects.
 */
function circleToPolygon(
  center: { x: number; y: number },
  radius: number,
  segments = 8,
): Array<{ x: number; y: number }> {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
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

    // Convert column circles to polygon holes before passing to ICDT.
    // ICDT.triangulate expects polygon vertices; each column is approximated as
    // a regular octagon (8 segments) derived from its center + radius.
    const polygonHoles = columns.map((col) =>
      circleToPolygon(col.position, (col.diameter as number) / 2),
    );

    // 2. Triangular
    const triangulation = await this.cdt.triangulate(room.geometry, polygonHoles);

    // 3. Validar
    const validationResult = this.validationService.validateRoom(room, triangulation);
    if (!validationResult.valid) {
      throw new ValidationError(validationResult.warnings);
    }

    // 4. Asignar área y cerrar
    //
    // BUG encontrado durante auditoría (no estaba en docs/07-BUGS-GAPS-COMPLETE.md):
    // el objeto `room` en memoria NUNCA se actualizaba con la nueva área/estado
    // antes de retornarlo — persistía correctamente en SQLite, pero cualquier
    // llamador que confiara en `output.room.area` (en vez de releer de la BD)
    // veía siempre `null`. Los tests existentes no lo detectaban porque
    // releían con `store.readObject()` en vez de usar `output.room` directamente
    // (ver test/application/UseCase.integration.test.ts, CloseRoomUseCase).
    // Se corrige mutando `room` para que quede consistente con lo persistido.
    room.area = squareMeters(triangulation.totalArea);
    room.isOpen = false;
    await this.store.updateObject(room.id, {
      area: room.area,
      isOpen: room.isOpen,
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
