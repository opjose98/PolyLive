// =============================================================================
// CreateControlPointUseCase.ts — Crea un SurveyControlPoint (Spike #7)
// Basado en: SurveyControlPoint.md (Obsidian 01-Dominio/survey),
//            arquitectura-aplicacion-v1.md §3 (módulo Topografía)
// =============================================================================

import { IObjectStore, generateId } from '../../domain/objects/base';
import {
  SiteId,
  SurveyControlPoint,
  SurveyControlPointId,
  GpsCoordinates,
} from '../../domain/objects/survey';
import { Point3D } from '../../domain/geometry/types';

export interface CreateControlPointInput {
  siteId: SiteId;
  localCoordinates: Point3D;
  gpsCoordinates: GpsCoordinates;
  name?: string;
  notes?: string;
}

export interface CreateControlPointOutput {
  point: SurveyControlPoint;
}

/**
 * Orquesta la captura de un punto de control topográfico.
 *
 * A diferencia de CreateWallUseCase/CreateColumnUseCase (que operan sobre
 * RevitObjectBase y pasan por CommandStack), este UseCase persiste
 * directamente y NO construye ni ejecuta un Command a través del
 * CommandStack — ver `application/commands/SimpleCommand.ts` para la
 * justificación completa (matriz-reglas-de-negocio.md §3: crear un
 * SurveyControlPoint no entra a Undo/Redo).
 *
 * Validación: la propia clase de dominio `SurveyControlPoint` rechaza en su
 * constructor un `gpsCoordinates.accuracy` que no sea > 0 (invariante de
 * SurveyControlPoint.md) — no se duplica esa validación aquí.
 */
export class CreateControlPointUseCase {
  constructor(private readonly store: IObjectStore) {}

  async execute(input: CreateControlPointInput): Promise<CreateControlPointOutput> {
    const point = new SurveyControlPoint({
      id: generateId() as unknown as SurveyControlPointId,
      siteId: input.siteId,
      localCoordinates: input.localCoordinates,
      gpsCoordinates: input.gpsCoordinates,
      name: input.name,
      notes: input.notes,
    });

    // createSurveyControlPoint no es parte de IObjectStore (el punto de
    // control pertenece a una Sede, no a un Room) — mismo patrón de cast que
    // CapturePhotoUseCase usa para createAuditPhoto().
    await (this.store as any).createSurveyControlPoint(point);

    return { point };
  }
}
