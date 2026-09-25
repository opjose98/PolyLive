// =============================================================================
// ExportRoomDxfToFileUseCase.ts — Escribe el DXF de un Recinto a disco
// =============================================================================
//
// Mismo patrón que ExportRoomIfcToFileUseCase: la capa Application genera el
// contenido completo en memoria y esta lo escribe. Si la generación falla,
// nunca se llega al `writeAsStringAsync` y no queda un .dxf parcial que
// alguien pueda confundir con un dibujo válido.
//
// DXF es texto plano ASCII con saltos LF, así que se escribe en UTF8 directo,
// sin pasar por Base64 (a diferencia de las fotos JPEG).
// =============================================================================

import * as FileSystem from 'expo-file-system';
import { ExportRoomDxfUseCase, ExportRoomDxfOutput } from '../../application/use-cases/ExportRoomDxfUseCase';
import { RoomId } from '../../domain/objects/base';
import type { WallElevation } from '../../domain/objects/wall-elevation';
import { sanitizeDxfFilename } from '../../infrastructure/export/dxf/DXFSerializer';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface ExportRoomDxfToFileInput {
  roomId: RoomId;
  title?: string;
  precision?: number;
  elevations?: readonly WallElevation[];
  /** Carpeta de exportación — por defecto `${documentDirectory}exports/`. */
  exportDir?: string;
  filename?: string;
}

export interface ExportRoomDxfToFileOutput extends ExportRoomDxfOutput {
  filePath: string;
}

export class ExportRoomDxfToFileUseCase {
  constructor(private readonly exportRoomDxf: ExportRoomDxfUseCase) {}

  async execute(input: ExportRoomDxfToFileInput): Promise<ExportRoomDxfToFileOutput> {
    const result = await this.exportRoomDxf.execute({
      roomId: input.roomId,
      title: input.title,
      precision: input.precision,
      elevations: input.elevations,
    });

    const exportDir = input.exportDir ?? `${FileSystem.documentDirectory}exports/`;
    const base = sanitizeDxfFilename(input.title ?? `recinto-${input.roomId as string}`);
    const filename = input.filename ?? `${base}-${Date.now()}.dxf`;
    const filePath = `${exportDir}${filename}`;

    try {
      const info = await FileSystem.getInfoAsync(exportDir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
      }
      await FileSystem.writeAsStringAsync(filePath, result.dxfContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      throw AppError.wrap(
        err,
        AppErrorCode.EXPORT_FAILED,
        'No se pudo escribir el archivo DXF en el dispositivo.',
        { filePath },
      );
    }

    return { ...result, filePath };
  }
}
