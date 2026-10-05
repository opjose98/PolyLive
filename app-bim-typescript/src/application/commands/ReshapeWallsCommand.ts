// =============================================================================
// ReshapeWallsCommand.ts — Mover extremos de varios muros en UN paso de deshacer
// =============================================================================
//
// Mover un extremo arrastra los extremos unidos y los encuentros en T (ver
// domain/topology/joints.ts): un solo gesto cambia varios muros. Deshacer
// tiene que devolverlos TODOS, o la esquina quedaría abierta a medias.
// =============================================================================

import { Command } from './Command';
import { IObjectStore, revitObjectId } from '../../domain/objects';
import type { Point2D } from '../../domain/geometry/types';

export interface WallEndsSnapshot {
  readonly id: string;
  readonly before: { readonly start: Point2D; readonly end: Point2D };
  readonly after: { readonly start: Point2D; readonly end: Point2D };
}

export class ReshapeWallsCommand extends Command {
  readonly type = 'ReshapeWalls' as const;

  constructor(private readonly walls: readonly WallEndsSnapshot[]) {
    super();
  }

  /** Escribe la posición nueva (idempotente con lo que ya escribió el UseCase; reaplica en Rehacer). */
  async execute(store: IObjectStore): Promise<void> {
    await this.write(store, 'after');
  }

  async undo(store: IObjectStore): Promise<void> {
    await this.write(store, 'before');
  }

  private async write(store: IObjectStore, which: 'before' | 'after'): Promise<void> {
    for (const w of this.walls) await writeEnds(store, w.id, w[which].start, w[which].end);
  }
}

/** Reescribe los extremos de un muro recto (eje y geometría incluidos). */
export async function writeEnds(store: IObjectStore, id: string, start: Point2D, end: Point2D): Promise<void> {
  await store.updateObject(revitObjectId(id), {
    startPoint: start,
    endPoint: end,
    geometry_json: JSON.stringify({ startPoint: start, endPoint: end }),
  } as never);
}
