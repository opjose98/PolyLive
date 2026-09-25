// =============================================================================
// SaveRoomDraftUseCase.ts — Persiste el progreso de un trazo en curso
// Basado en: escenarios-recuperación.md, Maestro §7.10
// =============================================================================
//
// Compañero de escritura de RecoverRoomDraftUseCase: sin esto, la tabla
// polygon_drafts nunca se llena y la recuperación no tiene nada que
// recuperar. Se llama tras cada vértice agregado durante el trazo de un
// Recinto (estado CREATING) para que un crash a mitad de trazo no pierda
// más que el último vértice no guardado.
// =============================================================================

import { RoomId } from '../../domain/objects';
import { Point2D } from '../../domain/geometry/types';
import { persistenceError } from '../../shared/errors/AppError';

/** Subconjunto de ObjectStore que este UseCase necesita — ver ObjectStore.saveDraft(). */
export interface IDraftStore {
  saveDraft(roomId: RoomId, vertices: Point2D[], isClosed: boolean): Promise<string>;
}

export interface SaveRoomDraftInput {
  roomId: RoomId;
  vertices: Point2D[];
  isClosed: boolean;
}

export interface SaveRoomDraftOutput {
  draftId: string;
}

export class SaveRoomDraftUseCase {
  constructor(private readonly store: IDraftStore) {}

  async execute(input: SaveRoomDraftInput): Promise<SaveRoomDraftOutput> {
    try {
      const draftId = await this.store.saveDraft(input.roomId, input.vertices, input.isClosed);
      return { draftId };
    } catch (cause) {
      throw persistenceError('SaveRoomDraftUseCase', cause);
    }
  }
}
