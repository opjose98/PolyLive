// =============================================================================
// CapturePhotoCommand.ts — Comando para capturar una foto de auditoría
// =============================================================================

import { Command } from './Command';
import { IObjectStore, AuditPhotoId, RevitObjectId } from '../../domain/objects';

/**
 * Captura y guarda foto. Undo marca la foto como borrada.
 */
export class CapturePhotoCommand extends Command {
  readonly type = 'CapturePhoto' as const;
  private readonly photoId: AuditPhotoId;

  constructor(photoId: AuditPhotoId) {
    super();
    this.photoId = photoId;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // Ya ejecutado por CapturePhotoUseCase
  }

  async undo(store: IObjectStore): Promise<void> {
    // Soft-delete la foto (no se puede borrar físicamente el archivo fácilmente)
    await store.updateObject(this.photoId as unknown as RevitObjectId, {
      is_deleted: true,
    } as any);
  }
}
