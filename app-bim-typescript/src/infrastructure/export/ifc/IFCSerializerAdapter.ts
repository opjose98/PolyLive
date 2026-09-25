// =============================================================================
// IFCSerializerAdapter.ts — Adapta IFCSerializer (Promise<SerializeResult>) al
// contrato IIFCSerializer (Promise<string>) que espera ExportRoomIfcUseCase.
//
// GAP CERRADO: `IFCSerializer.serialize()` (esta misma carpeta) retorna
// `{ content, validation, entityCount }` — necesario para que quien llame
// directamente a IFCSerializer pueda inspeccionar el resultado del
// Compatibility Gate (8 criterios) sin tener que parsear el STEP. Pero
// `ExportRoomIfcUseCase` (application/use-cases/types.ts, IIFCSerializer)
// espera `Promise<string>` — el contenido STEP puro. Sin este adapter,
// `ExportRoomIfcUseCase.execute()` ejecutado contra `new IFCSerializer()`
// directamente asignaría el objeto ENTERO a `ifcContent: string`, y
// escribir eso a un archivo .ifc produciría literalmente el texto
// "[object Object]" en vez de STEP válido.
//
// El propio test/integration/EndToEnd.test.ts (Flujo 4, "ExportIfc") ya
// necesitaba construir este puente a mano dentro del test porque no existía
// en src/ — este archivo es esa pieza de infraestructura, ahora reutilizable
// desde AppServices.ts en vez de reimplementarse por cada llamador.
// =============================================================================

import { IFCSerializer } from './IFCSerializer';
import { IIFCSerializer } from '../../../application/use-cases/types';
import { AppError, AppErrorCode } from '../../../shared/errors/AppError';

export class IFCSerializerAdapter implements IIFCSerializer {
  constructor(private readonly serializer: IFCSerializer = new IFCSerializer()) {}

  async serialize(data: {
    room: any;
    walls: any[];
    doors: any[];
    windows: any[];
    columns: any[];
    floor: any;
  }): Promise<string> {
    const result = await this.serializer.serialize(data);

    if (!result.validation.valid) {
      // El Compatibility Gate (8 criterios) rechazó la exportación — sin este
      // chequeo explícito, ExportRoomIfcUseCase devolvería `ifcContent: ''`
      // como si la exportación hubiera tenido éxito (ver IFCSerializer.ts:71-78,
      // que retorna content vacío en vez de lanzar).
      throw new AppError({
        code: AppErrorCode.EXPORT_FAILED,
        userMessage: 'El Recinto no cumple los requisitos para exportar a IFC.',
        technicalDetail: `IFC Compatibility Gate rejected export: ${JSON.stringify(result.validation)}`,
        context: { validation: result.validation },
      });
    }

    return result.content;
  }
}
