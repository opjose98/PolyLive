// =============================================================================
// ReshapeWallsUseCase.ts — Aplica un plan de uniones (varios muros, un comando)
// =============================================================================

import { IObjectStore, RevitObjectId, Wall } from '../../domain/objects';
import type { WallEndsChange } from '../../domain/topology/joints';
import { CommandStack } from '../state/CommandStack';
import { ReshapeWallsCommand, WallEndsSnapshot, writeEnds } from '../commands/ReshapeWallsCommand';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

/** Longitud mínima que puede quedarle a un muro arrastrado por una unión. */
export const MIN_RESHAPED_LENGTH = 0.05;

export interface ReshapeWallsInput {
  readonly changes: readonly WallEndsChange[];
}

export class ReshapeWallsUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: ReshapeWallsInput): Promise<{ changed: number }> {
    const snapshots: WallEndsSnapshot[] = [];
    for (const c of input.changes) {
      const wall = await this.store.readObject(c.id as RevitObjectId);
      if (!(wall instanceof Wall)) continue;
      const after = { start: c.start ?? wall.startPoint, end: c.end ?? wall.endPoint };
      if (Math.hypot(after.end.x - after.start.x, after.end.y - after.start.y) < MIN_RESHAPED_LENGTH) {
        throw new AppError({
          code: AppErrorCode.VALIDATION_FAILED,
          technicalDetail: `ReshapeWalls: el muro ${c.id} quedaría degenerado`,
          userMessage: 'El cambio dejaría un muro unido sin longitud. Suelta la unión o mueve menos.',
        });
      }
      snapshots.push({ id: c.id, before: { start: wall.startPoint, end: wall.endPoint }, after });
    }
    if (snapshots.length === 0) return { changed: 0 };
    for (const s of snapshots) await writeEnds(this.store, s.id, s.after.start, s.after.end);
    await this.commandStack.execute(new ReshapeWallsCommand(snapshots));
    return { changed: snapshots.length };
  }
}
