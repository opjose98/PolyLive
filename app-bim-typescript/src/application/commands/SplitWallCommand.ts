// =============================================================================
// SplitWallCommand.ts — Partir un muro en dos, en UN paso de deshacer (H-74)
// =============================================================================
//
// Partir toca el muro (extremo final y restricción), crea el segundo tramo,
// re-cuelga vanos y columnas embebidas, reparte el alzado y copia las
// mediciones. El comando guarda el antes y el después de todo eso.
//
// Orden: al deshacer, los vanos vuelven al muro ANTES de borrar el tramo nuevo,
// porque borrar un muro borra en cascada los vanos que cuelgan de él.
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, revitObjectId } from '../../domain/objects';
import type { Point2D } from '../../domain/geometry/types';
import type { MeasurementId } from '../../domain/objects/base';
import type { WallVertical } from '../../domain/objects/vertical';
import type { WallElevation } from '../../domain/objects/wall-elevation';

export interface SplitWallState {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly vertical: WallVertical;
  readonly height: number;
}

/** Vano o columna re-colgada: qué campos tenía y cuáles tiene tras partir. */
export interface SplitChild {
  readonly id: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
}

export interface SplitWallDeps {
  readonly saveElevation: (e: WallElevation) => Promise<void>;
  readonly deleteMeasurement: (id: MeasurementId) => Promise<void>;
  readonly restoreMeasurement: (id: MeasurementId) => Promise<void>;
}

export class SplitWallCommand extends Command {
  readonly type = 'SplitWall' as const;

  constructor(
    private readonly deps: SplitWallDeps,
    private readonly p: {
      readonly wallId: string;
      readonly newWallId: string;
      readonly before: SplitWallState;
      readonly after: SplitWallState;
      readonly children: readonly SplitChild[];
      readonly elevation: { readonly before: WallElevation; readonly first: WallElevation; readonly second: WallElevation };
      readonly measurementCopies: readonly MeasurementId[];
    },
  ) {
    super();
  }

  /** Idempotente: en la primera ejecución el tramo nuevo y las copias ya existen. */
  async execute(store: IObjectStore): Promise<void> {
    await store.restoreObject(revitObjectId(this.p.newWallId));
    await writeWall(store, this.p.wallId, this.p.after);
    for (const c of this.p.children) await store.updateObject(c.id as RevitObjectId, c.after as never);
    await this.deps.saveElevation(this.p.elevation.first);
    await this.deps.saveElevation(this.p.elevation.second);
    for (const id of this.p.measurementCopies) await this.deps.restoreMeasurement(id);
  }

  async undo(store: IObjectStore): Promise<void> {
    for (const c of this.p.children) await store.updateObject(c.id as RevitObjectId, c.before as never);
    await writeWall(store, this.p.wallId, this.p.before);
    await store.deleteObject(revitObjectId(this.p.newWallId));
    await this.deps.saveElevation(this.p.elevation.before);
    await this.deps.saveElevation({ ...this.p.elevation.second, openings: [] });
    for (const id of this.p.measurementCopies) await this.deps.deleteMeasurement(id);
  }
}

async function writeWall(store: IObjectStore, id: string, s: SplitWallState): Promise<void> {
  await store.updateObject(revitObjectId(id), {
    startPoint: s.start,
    endPoint: s.end,
    vertical: s.vertical,
    height: s.height,
    geometry_json: JSON.stringify({ startPoint: s.start, endPoint: s.end }),
  } as never);
}
