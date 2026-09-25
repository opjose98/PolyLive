// =============================================================================
// CapturePhotoUseCase.ts — Captura foto y registra en store
// Basado en: CapturePhotoUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import {
  IObjectStore,
  RoomId,
  AuditPhotoId,
  AuditPhoto,
  generateId,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { CapturePhotoCommand } from '../commands/CapturePhotoCommand';
import { CommandId } from '../commands/Command';

export interface CapturePhotoInput {
  roomId: RoomId;
  photoData: Buffer;
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
    const photoId = generateId() as unknown as AuditPhotoId;
    const timestamp = Date.now();

    const photo = new AuditPhoto({
      id: photoId,
      roomId: input.roomId,
      foto: input.photoData,
      metadata_json: JSON.stringify({ timestamp, filename: `room-${input.roomId}-${timestamp}.jpg` }),
    });

    await (this.store as any).createAuditPhoto(photo);

    const command = new CapturePhotoCommand(photoId);
    await this.commandStack.execute(command);

    return { photoId, commandId: command.id };
  }
}
