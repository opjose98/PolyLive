// =============================================================================
// DefineSiteCoordinateSystemUseCase.ts — Escribe Site.coordinateSystem (Spike #7)
// Basado en: SiteCoordinateSystem.md (Obsidian 01-Dominio/survey),
//            arquitectura-aplicacion-v1.md §3 (módulo Topografía)
// =============================================================================

import { IObjectStore } from '../../domain/objects/base';
import { SiteId, SiteCoordinateSystem, OperatorId } from '../../domain/objects/survey';
import { Point3D, Degrees } from '../../domain/geometry/types';

export interface DefineSiteCoordinateSystemInput {
  siteId: SiteId;
  origin: Point3D;
  northRotation: Degrees;
  definedBy: OperatorId;
}

export interface DefineSiteCoordinateSystemOutput {
  coordinateSystem: SiteCoordinateSystem;
}

/**
 * Orquesta la definición del sistema de coordenadas de una Sede — paso
 * obligatorio antes de trazar el primer Recinto (Maestro §4.3.1).
 *
 * NO pasa por CommandStack (ver `application/commands/SimpleCommand.ts`):
 * más allá de la decisión documentada en matriz-reglas-de-negocio.md §3, el
 * propio SiteCoordinateSystem es INMUTABLE una vez definido — no existe una
 * operación de "deshacer" segura para esta acción.
 *
 * La inmutabilidad se hace cumplir en la capa de persistencia:
 * `ObjectStore.defineSiteCoordinateSystem()` lanza si la Sede ya tiene un
 * sistema de coordenadas definido, en vez de sobrescribirlo silenciosamente.
 */
export class DefineSiteCoordinateSystemUseCase {
  constructor(private readonly store: IObjectStore) {}

  async execute(input: DefineSiteCoordinateSystemInput): Promise<DefineSiteCoordinateSystemOutput> {
    const coordinateSystem: SiteCoordinateSystem = {
      siteId: input.siteId,
      origin: input.origin,
      northRotation: input.northRotation,
      definedAt: new Date(),
      definedBy: input.definedBy,
    };

    // defineSiteCoordinateSystem no es parte de IObjectStore (pertenece a la
    // Sede, no a un objeto RevitObjectBase) — mismo patrón de cast que
    // CapturePhotoUseCase usa para createAuditPhoto(). Lanza si la Sede ya
    // tiene un sistema definido (invariante de inmutabilidad).
    await (this.store as any).defineSiteCoordinateSystem(coordinateSystem);

    return { coordinateSystem };
  }
}
