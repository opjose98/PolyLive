// =============================================================================
// CreateControlPointCommand.ts — Comando (SimpleCommand) para la creación
// de un SurveyControlPoint (Spike #7)
// =============================================================================

import { SimpleCommand } from './SimpleCommand';
import { IObjectStore } from '../../domain/objects/base';
import { SurveyControlPoint, SurveyControlPointId } from '../../domain/objects/survey';

/**
 * execute() es no-op — el SurveyControlPoint ya fue persistido por
 * CreateControlPointUseCase, mismo patrón que CreateColumnCommand /
 * CreateWallCommand (Command.ts).
 *
 * undo() sí revierte de forma real (soft-delete), a diferencia de
 * DefineSiteCoordinateSystemCommand: no hay ninguna invariante de dominio
 * que impida "deshacer" la captura de un mojón mal tomado.
 *
 * NOTA: por decisión documentada en matriz-reglas-de-negocio.md §3, este
 * comando NO se registra en CommandStack desde CreateControlPointUseCase —
 * ver SimpleCommand.ts para el detalle completo de esa decisión.
 */
export class CreateControlPointCommand implements SimpleCommand {
  readonly type = 'CreateControlPoint' as const;
  private readonly pointId: SurveyControlPointId;

  constructor(
    point: SurveyControlPoint,
    private readonly store: IObjectStore,
  ) {
    this.pointId = point.id;
  }

  async execute(): Promise<void> {
    // Ya persistido por CreateControlPointUseCase
  }

  async undo(): Promise<void> {
    await (this.store as any).deleteSurveyControlPoint(this.pointId);
  }

  canUndo(): boolean {
    return true;
  }

  describe(): string {
    return 'Crear punto de control';
  }
}
