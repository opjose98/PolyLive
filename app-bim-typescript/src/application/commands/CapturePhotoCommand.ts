// =============================================================================
// CapturePhotoCommand.ts — Comando para capturar una foto de auditoría
// =============================================================================

import { Command } from './Command';
import { IObjectStore, AuditPhotoId } from '../../domain/objects';

/**
 * Las fotos viven en su propia tabla (`audit_photos`), fuera del contrato
 * genérico de objetos: el comando recibe explícitamente las dos operaciones
 * que necesita. Antes hacía `updateObject` sobre la tabla de objetos BIM, que
 * no contiene fotos, así que Deshacer no borraba nada.
 */
export interface PhotoLifecycle {
  deleteAuditPhoto(id: AuditPhotoId): Promise<void>;
  restoreAuditPhoto(id: AuditPhotoId): Promise<void>;
}

/** Captura y guarda foto. Undo la marca como borrada; redo la restaura. */
export class CapturePhotoCommand extends Command {
  readonly type = 'CapturePhoto' as const;
  private readonly photoId: AuditPhotoId;
  private readonly photos: PhotoLifecycle;

  constructor(photoId: AuditPhotoId, photos: PhotoLifecycle) {
    super();
    this.photoId = photoId;
    this.photos = photos;
  }

  async execute(_store: IObjectStore): Promise<void> {
    // La foto la persiste CapturePhotoUseCase; al rehacer se restaura. Es
    // idempotente sobre una foto que no está borrada.
    await this.photos.restoreAuditPhoto(this.photoId);
  }

  async undo(_store: IObjectStore): Promise<void> {
    await this.photos.deleteAuditPhoto(this.photoId);
  }
}
