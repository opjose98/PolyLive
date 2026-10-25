// =============================================================================
// SplitWallUseCase.ts — Partir un muro recto en un punto (H-74)
// =============================================================================

import { Column, Door, generateId, measurementId, Measurement, RevitObjectId, Wall, Window } from '../../domain/objects';
import type { MeasurementId } from '../../domain/objects/base';
import { LevelElevations, WallVertical, profileHeight, resolveWallProfile } from '../../domain/objects/vertical';
import { MIN_SPLIT_PIECE, placeSpan, planWallSplit, splitOpenings } from '../../domain/objects/wall-split';
import { projectPointToWall } from '../../domain/geometry/projections';
import type { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import type { WallElevationService } from '../elevation/WallElevationService';
import { CommandStack } from '../state/CommandStack';
import { SplitChild, SplitWallCommand } from '../commands/SplitWallCommand';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

interface SplitWallInput {
  readonly wallId: RevitObjectId;
  /** Metros desde el arranque del muro. */
  readonly distance: number;
  /** Restricción actual del muro (la del editor, que resuelve muros sin ella). */
  readonly vertical: WallVertical;
  readonly levels: LevelElevations;
}

export class SplitWallUseCase {
  constructor(
    private readonly store: ObjectStore,
    private readonly commandStack: CommandStack,
    private readonly elevations: WallElevationService,
  ) {}

  /** Parte el muro; devuelve el id del tramo nuevo y cuántos vanos se arrimaron para caber. */
  async execute(input: SplitWallInput): Promise<{ newWallId: RevitObjectId; clamped: number }> {
    const wall = await this.store.readObject(input.wallId);
    if (!(wall instanceof Wall)) throw invalid('El objeto no es un muro.');
    if (!wall.isStraight) throw invalid('Solo se pueden partir muros rectos.');
    const length = wall.length as number;
    const plan = planWallSplit(wall.startPoint, wall.endPoint, input.vertical, input.levels, input.distance);
    if (!plan) throw invalid(`Cada tramo debe medir al menos ${MIN_SPLIT_PIECE.toFixed(2)} m.`);

    const height = (v: WallVertical, len: number) => profileHeight(resolveWallProfile(v, input.levels, len));
    const second = new Wall({
      id: generateId(),
      roomId: wall.roomId,
      startPoint: plan.at,
      endPoint: wall.endPoint,
      thickness: wall.thickness,
      height: height(plan.second, plan.secondLength) as never,
      material: wall.material,
      isStructural: wall.isStructural,
      vertical: plan.second,
      notes: wall.notes,
      properties: { ...wall.properties },
    });

    // Vanos por su centro; columnas embebidas por su proyección sobre el eje.
    let clamped = 0;
    const children: SplitChild[] = [];
    for (const o of await this.store.listObjects(wall.roomId)) {
      if ((o instanceof Door || o instanceof Window) && (o.parentWallId as string) === (wall.id as string)) {
        const p = placeSpan({ xOffset: o.offsetAlongWall as number, width: o.width as number }, input.distance, length);
        if (p.clamped) clamped++;
        children.push({
          id: o.id as string,
          before: { parentWallId: o.parentWallId, offsetAlongWall: o.offsetAlongWall },
          after: { parentWallId: p.second ? second.id : wall.id, offsetAlongWall: p.xOffset },
        });
      } else if (o instanceof Column && (o.embeddedInWallId as string | undefined) === (wall.id as string)) {
        if (projectPointToWall(o.position, wall).offsetAlong >= input.distance) {
          children.push({ id: o.id as string, before: { embeddedInWallId: wall.id }, after: { embeddedInWallId: second.id } });
        }
      }
    }

    const before = await this.elevations.getElevation(wall);
    const parts = splitOpenings(before.openings, input.distance, length);

    // Las mediciones eran del muro entero: el segundo tramo lleva una copia (sin aplicar).
    const copies: MeasurementId[] = [];
    await this.store.createObject(second);
    for (const m of await this.store.listMeasurementsForWall(wall.id as never)) {
      if (m.reference === 'diagonal') continue;
      const copy = new Measurement({ ...m, id: measurementId(generateId() as string), wallId: second.id as never, appliedLength: null });
      copies.push(await this.store.createMeasurement(copy));
    }

    const command = new SplitWallCommand(
        {
          saveElevation: (e) => this.elevations.saveElevation(e),
          deleteMeasurement: (id) => this.store.deleteMeasurement(id),
          restoreMeasurement: (id) => this.store.restoreMeasurement(id),
        },
        {
          wallId: wall.id as string,
          newWallId: second.id as string,
          before: { start: wall.startPoint, end: wall.endPoint, vertical: input.vertical, height: wall.height as number },
          after: { start: wall.startPoint, end: plan.at, vertical: plan.first, height: height(plan.first, input.distance) },
          children,
          elevation: {
            before,
            first: { ...before, openings: parts.first },
            second: { ...before, wallId: second.id as string, openings: parts.second },
          },
          measurementCopies: copies,
        },
    );
    try {
      await this.commandStack.execute(command);
    } catch (err) {
      // Si algo falló a mitad, se devuelve todo (el tramo nuevo y las copias ya existían): sin huérfanos.
      await command.undo(this.store).catch(() => undefined);
      throw err;
    }
    return { newWallId: second.id, clamped };
  }
}

function invalid(userMessage: string): AppError {
  return new AppError({ code: AppErrorCode.VALIDATION_FAILED, technicalDetail: `SplitWall: ${userMessage}`, userMessage });
}
