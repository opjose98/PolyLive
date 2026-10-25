// =============================================================================
// CreateFloorUseCase.ts — Suelo ligado a un recinto (F6a)
// =============================================================================
//
// Un recinto tiene a lo sumo UN suelo vivo. El suelo toma el contorno neto de
// su recinto (ver Floor / FLOOR_ZONE_PROP); aquí solo se guarda el vínculo,
// el espesor y el material.
// =============================================================================

import { Meters, Point2D } from '../../domain/geometry/types';
import { IObjectStore, RoomId, generateId } from '../../domain/objects';
import { Floor, FLOOR_ZONE_PROP, floorZoneId, netFloorArea } from '../../domain/objects/floor';

import { CommandStack } from '../state/CommandStack';
import { CreateFloorCommand } from '../commands/CreateFloorCommand';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

/** Área mínima de un suelo libre (m²): por debajo es un toque, no un andén. */
const MIN_FREE_FLOOR_AREA = 0.01;

interface CreateFloorInput {
  readonly roomId: RoomId;
  /** Suelo de un recinto (toma su contorno neto)… */
  readonly zoneId?: string;
  /** …o suelo libre (andén, patio) con contorno propio. */
  readonly outline?: readonly Point2D[];
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
    if (!input.zoneId && netFloorArea(input.outline ?? []) < MIN_FREE_FLOOR_AREA) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        technicalDetail: 'CreateFloor: suelo libre sin contorno o sin área',
        userMessage: 'El suelo necesita un contorno cerrado con área.',
      });
    }
    const existing = await this.store.listObjects(input.roomId);
    if (input.zoneId && existing.some((o) => o instanceof Floor && floorZoneId(o) === input.zoneId)) {
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
      outline: input.zoneId ? undefined : input.outline?.map((p) => ({ x: p.x, y: p.y })),
      properties: input.zoneId ? { ...input.properties, [FLOOR_ZONE_PROP]: input.zoneId } : { ...input.properties },
    });
    await this.store.createObject(floor);
    await this.commandStack.execute(new CreateFloorCommand(floor.id));
    return { floor };
  }
}
