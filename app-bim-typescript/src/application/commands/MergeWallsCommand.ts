// =============================================================================
// MergeWallsCommand.ts — Unir dos muros en UN paso de deshacer (inverso de partir)
// =============================================================================
//
// Orden: los vanos de B pasan a A ANTES de borrar B (borrar un muro borra en
// cascada sus vanos); al deshacer, B vuelve antes de devolverle sus vanos.
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, revitObjectId } from '../../domain/objects';
import type { WallElevation } from '../../domain/objects/wall-elevation';
import type { MeasurementId } from '../../domain/objects/base';
import { SplitChild, SplitWallDeps, SplitWallState, writeWall } from './SplitWallCommand';

export class MergeWallsCommand extends Command {
  readonly type = 'MergeWalls' as const;

  constructor(
    private readonly deps: SplitWallDeps,
    private readonly p: {
      readonly keepId: string;
      readonly removeId: string;
      readonly before: SplitWallState;
      readonly after: SplitWallState;
      readonly children: readonly SplitChild[];
      readonly elevation: { readonly keepBefore: WallElevation; readonly removeBefore: WallElevation; readonly keepAfter: WallElevation };
      /** Copias en A de las mediciones de B (B queda borrado). */
      readonly measurementCopies: readonly MeasurementId[];
    },
  ) {
    super();
  }

  async execute(store: IObjectStore): Promise<void> {
    for (const c of this.p.children) await store.updateObject(c.id as RevitObjectId, c.after as never);
    await writeWall(store, this.p.keepId, this.p.after);
    await this.deps.saveElevation(this.p.elevation.keepAfter);
    await this.deps.saveElevation({ ...this.p.elevation.removeBefore, openings: [] });
    for (const id of this.p.measurementCopies) await this.deps.restoreMeasurement(id);
    const removed = revitObjectId(this.p.removeId);
    if (await store.readObject(removed)) await store.deleteObject(removed);
  }

  async undo(store: IObjectStore): Promise<void> {
    await store.restoreObject(revitObjectId(this.p.removeId));
    await writeWall(store, this.p.keepId, this.p.before);
    for (const c of this.p.children) await store.updateObject(c.id as RevitObjectId, c.before as never);
    await this.deps.saveElevation(this.p.elevation.keepBefore);
    await this.deps.saveElevation(this.p.elevation.removeBefore);
    for (const id of this.p.measurementCopies) await this.deps.deleteMeasurement(id);
  }
}
