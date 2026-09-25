// =============================================================================
// RecoverRoomDraftUseCase.ts — Reconstruye un trazo en progreso tras un crash
// Basado en: escenarios-recuperación.md, Maestro §7.10
//
// Cierra Gap #1 de docs/07-BUGS-GAPS-COMPLETE.md: hasta ahora la tabla
// polygon_drafts persistía correctamente (verificado por CrashRecovery.test.ts)
// pero ningún UseCase la leía de vuelta.
// =============================================================================
//
// ALCANCE REAL (documentado explícitamente, no oculto):
// - Lo que SÍ se recupera: los vértices del polígono en progreso — la parte
//   que persiste en polygon_drafts y que CrashRecovery.test.ts prueba que
//   sobrevive un cierre/reapertura de conexión.
// - Lo que NO se recupera: el CommandStack (undo/redo) de esa sesión. El
//   CommandStack vive solo en memoria (application/state/CommandStack.ts) y
//   no tiene persistencia — ver la nota en test/integration/CrashRecovery.test.ts.
//   "Continuar" el borrador aquí significa reanudar el trazo con un
//   CommandStack NUEVO (vacío), no restaurar el historial de undo anterior.
//   Persistir el CommandStack completo es un cambio de arquitectura mayor,
//   fuera del alcance de esta UseCase — documentado como limitación conocida
//   en docs/07-BUGS-GAPS-COMPLETE.md §5, no como bug de esta implementación.
// =============================================================================

import { RoomId } from '../../domain/objects';
import { Point2D } from '../../domain/geometry/types';
import { persistenceError } from '../../shared/errors/AppError';

/** Subconjunto de ObjectStore que este UseCase necesita — ver ObjectStore.{getLatestDraft,deleteDraft}(). */
export interface IDraftStore {
  getLatestDraft(
    roomId: RoomId,
  ): Promise<{ id: string; vertices: Point2D[]; isClosed: boolean; savedAt: Date } | null>;
  deleteDraft(draftId: string): Promise<void>;
}

export interface RecoverRoomDraftInput {
  roomId: RoomId;
}

export type RecoverRoomDraftOutput =
  | { hasDraft: false }
  | {
      hasDraft: true;
      draftId: string;
      vertices: Point2D[];
      isClosed: boolean;
      savedAt: Date;
    };

export class RecoverRoomDraftUseCase {
  constructor(private readonly store: IDraftStore) {}

  /**
   * Busca el borrador más reciente del Recinto. No lo borra — la decisión de
   * continuar o descartar es del usuario (diálogo "¿Restaurar último
   * levantamiento?"), así que la lectura es no-destructiva por diseño.
   */
  async execute(input: RecoverRoomDraftInput): Promise<RecoverRoomDraftOutput> {
    try {
      const draft = await this.store.getLatestDraft(input.roomId);
      if (!draft) return { hasDraft: false };

      return {
        hasDraft: true,
        draftId: draft.id,
        vertices: draft.vertices,
        isClosed: draft.isClosed,
        savedAt: draft.savedAt,
      };
    } catch (cause) {
      throw persistenceError('RecoverRoomDraftUseCase', cause);
    }
  }

  /** El usuario eligió "Continuar" — el borrador ya cumplió su función, se descarta. */
  async confirmContinue(draftId: string): Promise<void> {
    await this.store.deleteDraft(draftId);
  }

  /** El usuario eligió "Descartar" — mismo efecto de storage, nombre distinto por claridad de intención. */
  async discard(draftId: string): Promise<void> {
    await this.store.deleteDraft(draftId);
  }
}
