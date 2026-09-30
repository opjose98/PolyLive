// =============================================================================
// ElevationSnapshotCommand.ts — Deshacer/rehacer una edición del alzado
// =============================================================================
//
// Una edición del alzado toca DOS modelos: la fila de `wall_elevations` y los
// vanos (Door/Window) que proyecta en planta, que el servicio crea, mueve o
// borra por su cuenta. En vez de un comando por cada efecto, este guarda una
// instantánea de antes y de después de ambos y restaura la que toque. Así una
// edición del alzado es UN paso de la historia compartida con la planta.
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId } from '../../domain/objects';
import type { WallElevation } from '../../domain/objects/wall-elevation';

/** Estado de un vano en la instantánea: `null` si no existía (o estaba borrado). */
export interface VanoSnapshot {
  readonly offsetAlongWall: number;
  readonly width: number;
  readonly height: number;
}

export interface ElevationSnapshot {
  readonly elevation: WallElevation;
  readonly vanos: ReadonlyMap<string, VanoSnapshot | null>;
}

export class ElevationSnapshotCommand extends Command {
  readonly type = 'ElevationSnapshot' as const;

  constructor(
    private readonly save: (e: WallElevation) => Promise<void>,
    private readonly before: ElevationSnapshot,
    private readonly after: ElevationSnapshot,
  ) {
    super();
  }

  async execute(store: IObjectStore): Promise<void> {
    await this.apply(store, this.after);
  }

  async undo(store: IObjectStore): Promise<void> {
    await this.apply(store, this.before);
  }

  private async apply(store: IObjectStore, snap: ElevationSnapshot): Promise<void> {
    const ids = new Set([...this.before.vanos.keys(), ...this.after.vanos.keys()]);
    for (const id of ids) {
      const target = snap.vanos.get(id) ?? null;
      const oid = id as unknown as RevitObjectId;
      const current = await store.readObject(oid);
      if (target === null) {
        if (current) await store.deleteObject(oid);
        continue;
      }
      if (!current) await store.restoreObject(oid);
      await store.updateObject(oid, target as never);
    }
    await this.save(snap.elevation);
  }
}
