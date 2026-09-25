// =============================================================================
// LinkPhotoCommand.ts — Comando para vincular/desvincular foto a objeto BIM
// =============================================================================

import { Command } from './Command';
import { IObjectStore, RevitObjectId, AuditPhotoId } from '../../domain/objects';

/**
 * Vincula foto a objeto. Undo desvincula.
 */
export class LinkPhotoCommand extends Command {
  readonly type = 'LinkPhoto' as const;
  private readonly objectId: RevitObjectId;
  private readonly photoId: AuditPhotoId;

  constructor(objectId: RevitObjectId, photoId: AuditPhotoId) {
    super();
    this.objectId = objectId;
    this.photoId = photoId;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por LinkPhotoToObjectUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    const obj = await store.readObject(this.objectId);
    if (!obj) return;
    obj.linkedPhotos = obj.linkedPhotos.filter((p) => p !== this.photoId);
    await store.updateObject(this.objectId, {
      linkedPhotos: obj.linkedPhotos,
    } as any);
  }
}
