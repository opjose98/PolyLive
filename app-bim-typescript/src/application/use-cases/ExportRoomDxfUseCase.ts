// =============================================================================
// ExportRoomDxfUseCase.ts — Exporta un Recinto a DXF
// Portado de LevON: export/dxf_exporter.dart
// =============================================================================
//
// Mismo reparto que la exportación IFC: este UseCase produce el CONTENIDO y la
// capa Native lo escribe a disco (ver native/export/ExportRoomDxfToFileUseCase).
// No emite comando al CommandStack — exportar no es una operación reversible.
//
// DIFERENCIA DE CRITERIO CON IFC, deliberada: `ExportRoomIfcUseCase` exige que
// el Recinto esté CERRADO y falla si no lo está, porque un IFC con un espacio
// abierto no es un modelo válido. DXF no: un DXF es un DIBUJO, y exportar un
// levantamiento a medias para seguir delineándolo en el despacho es justo uno
// de los motivos para tener DXF. Se exporta lo que haya.
// =============================================================================

import { RoomId, IObjectStore, revitObjectId } from '../../domain/objects/base';
import { Room } from '../../domain/objects/room';
import { Wall } from '../../domain/objects/wall';
import { Column } from '../../domain/objects/column';

import type { WallElevation } from '../../domain/objects/wall-elevation';
import { DXFSerializer, DXFExportData } from '../../infrastructure/export/dxf/DXFSerializer';

interface ExportRoomDxfInput {
  roomId: RoomId;
  /** Nombre del dibujo. Por defecto, el nombre del Recinto. */
  title?: string;
  /** Decimales de las coordenadas. */
  precision?: number;
  /**
   * Elevaciones para proyectar los huecos en planta. El llamador las pasa
   * porque viven en otro store; sin ellas el DXF sale sin puertas ni ventanas.
   */
  elevations?: readonly WallElevation[];
  /** Recintos con identidad: contorno y rótulo por recinto. */
  zones?: DXFExportData['zones'];
  /** Dibujo técnico de la planta (F6b), en coordenadas del modelo. */
  drafting?: DXFExportData['drafting'];
}

interface ExportRoomDxfOutput {
  dxfContent: string;
  /** Cifras para que la UI diga QUÉ se exportó, no solo que se exportó. */
  stats: {
    walls: number;
    columns: number;
    openings: number;
    roomClosed: boolean;
  };
  exportTime: number;
}

export class ExportRoomDxfUseCase {
  constructor(private readonly store: IObjectStore) {}

  async execute(input: ExportRoomDxfInput): Promise<ExportRoomDxfOutput> {
    const startTime = Date.now();

    const room = (await this.store.readObject(
      revitObjectId(input.roomId),
    )) as Room | null;

    const objects = await this.store.listObjects(input.roomId);
    const walls = objects.filter((o): o is Wall => o instanceof Wall);
    const columns = objects.filter((o): o is Column => o instanceof Column);

    const title =
      input.title ??
      (room?.properties.name as string | undefined) ??
      `Recinto ${input.roomId as string}`;

    const data: DXFExportData = {
      title,
      room,
      walls,
      columns,
      elevations: input.elevations,
      precision: input.precision,
      zones: input.zones,
      drafting: input.drafting,
    };

    const dxfContent = new DXFSerializer().serialize(data);

    return {
      dxfContent,
      stats: {
        walls: walls.length,
        columns: columns.length,
        openings: (input.elevations ?? []).reduce((sum, e) => sum + e.openings.length, 0),
        roomClosed: room?.isOpen === false,
      },
      exportTime: Date.now() - startTime,
    };
  }
}
