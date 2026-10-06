// =============================================================================
// CapturePhotoUseCase.ts — Captura foto y registra en store
// Basado en: CapturePhotoUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { sealPhoto } from '../../domain/evidence/seal';
import {
  auditPhotoId,
  IObjectStore,
  RoomId,
  AuditPhotoId,
  AuditPhoto,
  generateId,
} from '../../domain/objects';
import type { PhotoMetadata } from '../../domain/objects/audit-photo';
import { CommandStack } from '../state/CommandStack';
import { CapturePhotoCommand, PhotoLifecycle } from '../commands/CapturePhotoCommand';
import { CommandId } from '../commands/Command';

export interface CapturePhotoInput {
  roomId: RoomId;
  /** `Uint8Array`, no `Buffer` — ver el comentario en domain/objects/audit-photo.ts. */
  photoData: Uint8Array;
  /**
   * Nombre del archivo tal como lo guardó la capa de filesystem (ej.
   * ExpoFileSystem.savePhoto()). GAP CORREGIDO durante auditoría: antes este
   * UseCase inventaba su propio filename (`room-{roomId}-{timestamp}.jpg`),
   * completamente desconectado del que realmente usa el archivo en disco
   * (`photo-{Date.now()}.jpg`) — dos timestamps independientes que ni
   * siquiera coincidían entre sí. Sin este dato, no hay forma de que la UI
   * correlacione un archivo de la grilla con su AuditPhoto en SQLite para
   * vincularlo a un objeto BIM (LinkPhotoToObjectUseCase). Si se omite, se
   * genera un filename propio como antes — pero el llamador debería pasarlo
   * siempre que ya haya guardado el archivo.
   */
  filename?: string;
  /**
   * Metadata adicional de campo: marcador en planta, código BIM, GPS,
   * operador, notas. Se funde con `timestamp` y `filename`, que siempre los
   * pone este UseCase.
   *
   * Existe porque la metadata de una foto se conoce EN EL MOMENTO de tomarla
   * (dónde se estaba, quién la tomó) y escribirla después exigiría un UPDATE
   * extra por cada foto, con la ventana de tiempo correspondiente en la que la
   * foto está guardada sin contexto.
   */
  metadata?: Partial<PhotoMetadata>;
}

export interface CapturePhotoOutput {
  photoId: AuditPhotoId;
  commandId: CommandId;
}

export class CapturePhotoUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: CapturePhotoInput): Promise<CapturePhotoOutput> {
    const photoId = auditPhotoId(generateId());
    const timestamp = Date.now();
    const filename = input.filename ?? `room-${input.roomId}-${timestamp}.jpg`;

    const photo = new AuditPhoto({
      id: photoId,
      roomId: input.roomId,
      foto: input.photoData,
      // `timestamp` y `filename` van DESPUÉS del spread: son responsabilidad de
      // este UseCase y no deben poder pisarse desde fuera.
      metadata_json: JSON.stringify({
        ...input.metadata,
        timestamp,
        filename,
        // Sello de evidencia: imagen + código + operador + fecha + GPS (domain/evidence/seal.ts).
        seal: sealPhoto(input.photoData, { bimCode: input.metadata?.bimCode, operator: input.metadata?.operator, timestamp, geo: input.metadata?.geo }),
      }),
    });

    await (this.store as any).createAuditPhoto(photo);

    const command = new CapturePhotoCommand(photoId, this.store as unknown as PhotoLifecycle);
    await this.commandStack.execute(command);

    return { photoId, commandId: command.id };
  }
}
