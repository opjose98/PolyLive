// =============================================================================
// CreateFloorUseCase.ts — Suelo ligado a un recinto (F6a)
// =============================================================================
//
// Un recinto tiene a lo sumo UN suelo vivo. El suelo toma el contorno neto de
// su recinto (ver Floor / FLOOR_ZONE_PROP); aquí solo se guarda el vínculo,
// el espesor y el material.
// =============================================================================

import { Meters } from '../../domain/geometry/types';
import { IObjectStore, RoomId, generateId } from '../../domain/objects';
import { Floor, FLOOR_ZONE_PROP, floorZoneId } from '../../domain/objects/floor';
import { CommandStack } from '../state/CommandStack';
import { CreateFloorCommand } from '../commands/CreateFloorCommand';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface CreateFloorInput {
  readonly roomId: RoomId;
  readonly zoneId: string;
  readonly thickness: Meters;
  readonly material?: string;
  /** Nivel y fase (como los demás objetos). */
  readonly properties?: Record<string, unknown>;
}

export class CreateFloorUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: CreateFloorInput): Promise<{ floor: Floor }> {
    if (!((input.thickness as number) > 0)) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        technicalDetail: 'CreateFloor: espesor no positivo',
        userMessage: 'El espesor del suelo tiene que ser mayor que cero.',
      });
    }
    const existing = await this.store.listObjects(input.roomId);
    if (existing.some((o) => o instanceof Floor && floorZoneId(o) === input.zoneId)) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        technicalDetail: `CreateFloor: el recinto ${input.zoneId} ya tiene suelo`,
        userMessage: 'Ese recinto ya tiene suelo.',
      });
    }
    const floor = new Floor({
      id: generateId(),
      roomId: input.roomId,
      isImplicit: false,
      thickness: input.thickness,
      material: input.material,
      properties: { ...input.properties, [FLOOR_ZONE_PROP]: input.zoneId },
    });
    await this.store.createObject(floor);
    await this.commandStack.execute(new CreateFloorCommand(floor.id));
    return { floor };
  }
}
