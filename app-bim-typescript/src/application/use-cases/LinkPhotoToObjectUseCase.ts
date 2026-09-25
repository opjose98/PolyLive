// =============================================================================
// LinkPhotoToObjectUseCase.ts — Vincula foto a un objeto BIM
// Basado en: LinkPhotoToObjectUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import {
  IObjectStore,
  RevitObjectId,
  AuditPhotoId,
} from '../../domain/objects';
import { CommandStack } from '../state/CommandStack';
import { LinkPhotoCommand } from '../commands/LinkPhotoCommand';
import { CommandId } from '../commands/Command';

export interface LinkPhotoToObjectInput {
  photoId: AuditPhotoId;
  objectId: RevitObjectId;
}

export interface LinkPhotoToObjectOutput {
  success: boolean;
  commandId: CommandId;
}

export class LinkPhotoToObjectUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  async execute(input: LinkPhotoToObjectInput): Promise<LinkPhotoToObjectOutput> {
    // 1. Verificar objeto existe
    const object = await this.store.readObject(input.objectId);
    if (!object) throw new Error('Objeto no existe');

    // 2. Agregar photoId a linkedPhotos
    if (!object.linkedPhotos) object.linkedPhotos = [];
    object.linkedPhotos.push(input.photoId);

    // 3. Persistir
    await this.store.updateObject(input.objectId, {
      linkedPhotos: object.linkedPhotos,
    } as any);

    // 4. Comando
    const command = new LinkPhotoCommand(input.objectId, input.photoId);
    await this.commandStack.execute(command);

    return { success: true, commandId: command.id };
  }
}
