// =============================================================================
// CDTAdapter.ts — Adapta domain/geometry/CDT (síncrono, tipo Polygon) al
// contrato ICDT (asíncrono, boundary + holes sueltos) que consumen los
// UseCases — ej. CloseRoomUseCase.
//
// GAP CERRADO: CloseRoomUseCase.ts recibe un `ICDT` por inyección de
// dependencias, pero ningún archivo en src/ implementaba esa interfaz contra
// el motor CDT real — solo los tests lo mockeaban. Sin este adapter,
// CloseRoomUseCase no tenía nada real que ejecutar en producción.
// =============================================================================

import { CDT } from '../../domain/geometry/CDT';
import { Point2D } from '../../domain/geometry/types';
import { ICDT } from '../../application/use-cases/types';

export class CDTAdapter implements ICDT {
  private readonly cdt = new CDT();

  async triangulate(
    boundary: Point2D[],
    holes?: Point2D[][],
  ): Promise<{ totalArea: number; triangles: any[]; valid: boolean; warnings: any[] }> {
    const result = this.cdt.triangulate({
      vertices: boundary,
      isClosed: true,
      holes: (holes ?? []).map((h) => ({ vertices: h, isClosed: true })),
    });

    return {
      totalArea: result.totalArea as number,
      triangles: result.triangles,
      valid: result.valid,
      warnings: result.warnings,
    };
  }
}
