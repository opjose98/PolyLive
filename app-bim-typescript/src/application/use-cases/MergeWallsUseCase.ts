// =============================================================================
// MergeWallsUseCase.ts — Unir dos muros colineales que comparten un extremo
// =============================================================================

import { Column, Door, RevitObjectId, Wall, Window } from '../../domain/objects';
import { LevelElevations, WallVertical, profileHeight, resolveWallProfile } from '../../domain/objects/vertical';
import { planWallMerge } from '../../domain/objects/wall-merge';
import type { WallOpening } from '../../domain/objects/wall-elevation';
import type { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import type { WallElevationService } from '../elevation/WallElevationService';
import { CommandStack } from '../state/CommandStack';
import { SplitChild } from '../commands/SplitWallCommand';
import { MergeWallsCommand } from '../commands/MergeWallsCommand';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

interface MergeWallsInput {
  /** El muro que queda (conserva id, fotos y mediciones). */
  readonly keepId: RevitObjectId;
  readonly removeId: RevitObjectId;
  /** Restricciones de cada uno (las del editor, que resuelve muros sin ellas). */
  readonly keepVertical: WallVertical;
  readonly removeVertical: WallVertical;
  readonly levels: LevelElevations;
}

export class MergeWallsUseCase {
  constructor(
    private readonly store: ObjectStore,
    private readonly commandStack: CommandStack,
    private readonly elevations: WallElevationService,
  ) {}

  async execute(input: MergeWallsInput): Promise<{ length: number }> {
    const a = await this.store.readObject(input.keepId);
    const b = await this.store.readObject(input.removeId);
    if (!(a instanceof Wall) || !(b instanceof Wall)) throw invalid('Solo se unen muros.');
    if (!a.isStraight || !b.isStraight) throw invalid('Solo se unen muros rectos.');
    if (Math.abs((a.thickness as number) - (b.thickness as number)) > 1e-6) throw invalid('Los muros tienen espesores distintos.');
    const plan = planWallMerge(
      { start: a.startPoint, end: a.endPoint, vertical: input.keepVertical },
      { start: b.startPoint, end: b.endPoint, vertical: input.removeVertical },
      input.levels,
    );
    if (typeof plan === 'string') throw invalid(plan);

    // Un tramo invertido se recorre al revés: el vano [x, x+w] arranca en map(x + w).
    const span = (x: number, w: number, map: (v: number) => number, flip: boolean) => (flip ? map(x + w) : map(x));
    const children: SplitChild[] = [];
    for (const o of await this.store.listObjects(a.roomId)) {
      if (o instanceof Door || o instanceof Window) {
        const onA = (o.parentWallId as string) === (a.id as string);
        const onB = (o.parentWallId as string) === (b.id as string);
        if (!onA && !onB) continue;
        const x = span(o.offsetAlongWall as number, o.width as number, onA ? plan.mapA : plan.mapB, onA ? plan.flipA : plan.flipB);
        if (onA && Math.abs(x - (o.offsetAlongWall as number)) < 1e-9) continue;
        children.push({
          id: o.id as string,
          before: { parentWallId: o.parentWallId, offsetAlongWall: o.offsetAlongWall },
          after: { parentWallId: a.id, offsetAlongWall: x },
        });
      } else if (o instanceof Column && (o.embeddedInWallId as string | undefined) === (b.id as string)) {
        children.push({ id: o.id as string, before: { embeddedInWallId: b.id }, after: { embeddedInWallId: a.id } });
      }
    }

    const ea = await this.elevations.getElevation(a);
    const eb = await this.elevations.getElevation(b);
    const move = (o: WallOpening, map: (v: number) => number, flip: boolean): WallOpening => ({ ...o, xOffset: span(o.xOffset, o.width, map, flip) });
    const keepAfter = {
      ...ea,
      openings: [...ea.openings.map((o) => move(o, plan.mapA, plan.flipA)), ...eb.openings.map((o) => move(o, plan.mapB, plan.flipB))],
    };

    const height = profileHeight(resolveWallProfile(plan.vertical, input.levels));
    await this.commandStack.execute(
      new MergeWallsCommand((e) => this.elevations.saveElevation(e), {
        keepId: a.id as string,
        removeId: b.id as string,
        before: { start: a.startPoint, end: a.endPoint, vertical: input.keepVertical, height: a.height as number },
        after: { start: plan.start, end: plan.end, vertical: plan.vertical, height },
        children,
        elevation: { keepBefore: ea, removeBefore: eb, keepAfter },
      }),
    );
    return { length: plan.length };
  }
}

function invalid(userMessage: string): AppError {
  return new AppError({ code: AppErrorCode.VALIDATION_FAILED, technicalDetail: `MergeWalls: ${userMessage}`, userMessage });
}
