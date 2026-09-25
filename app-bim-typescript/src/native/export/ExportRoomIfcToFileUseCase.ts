// =============================================================================
// ExportRoomIfcToFileUseCase.ts — Exporta un Recinto a IFC y lo escribe a disco
// Basado en: ExportRoomIfcUseCase.md, filesystem-photo-storage.md (mismo
// patrón de directorio dedicado dentro de documentDirectory)
// =============================================================================
//
// GAP CERRADO: ExportRoomIfcUseCase (application/) genera el contenido STEP
// como string pero deliberadamente NO lo escribe a disco (ver su propio
// comentario: "NO emite comando... la exportación no es reversible" — la
// responsabilidad de I/O es de la capa Native, no de Application). Hasta
// ahora ningún archivo en src/native/ cerraba ese último paso, así que
// "exportar a IFC" no tenía ninguna forma de terminar en un archivo real en
// el dispositivo.
//
// El contenido STEP/IFC es texto ASCII plano (ISO 10303-21) — a diferencia
// de las fotos JPEG (binario, necesitan Base64), se escribe directamente
// con encoding UTF8, sin pasar por el codificador Base64.
// =============================================================================

import * as FileSystem from 'expo-file-system';
import { ExportRoomIfcUseCase } from '../../application/use-cases/ExportRoomIfcUseCase';
import { RoomId } from '../../domain/objects';
import { ValidationWarning } from '../../domain/geometry/types';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

export interface ExportRoomIfcToFileInput {
  roomId: RoomId;
  /** Carpeta de exportación — por defecto `${documentDirectory}exports/`. */
  exportDir?: string;
  /** Nombre de archivo — por defecto `recinto-{roomId}-{timestamp}.ifc`. */
  filename?: string;
}

export interface ExportRoomIfcToFileOutput {
  filePath: string;
  warnings: ValidationWarning[];
  exportTime: number;
}

export class ExportRoomIfcToFileUseCase {
  constructor(private readonly exportRoomIfc: ExportRoomIfcUseCase) {}

  async execute(input: ExportRoomIfcToFileInput): Promise<ExportRoomIfcToFileOutput> {
    const { ifcContent, warnings, exportTime } = await this.exportRoomIfc.execute({ roomId: input.roomId });

    const exportDir = input.exportDir ?? `${FileSystem.documentDirectory}exports/`;
    const filename = input.filename ?? `recinto-${input.roomId}-${Date.now()}.ifc`;
    const filePath = `${exportDir}${filename}`;

    try {
      await this.ensureDir(exportDir);
      // Generar el contenido COMPLETO en memoria primero (ya ocurrió arriba,
      // en exportRoomIfc.execute()) y solo entonces escribir — si la
      // generación hubiera fallado, nunca llegaríamos a este writeAsStringAsync
      // y no quedaría un .ifc parcial (mismo patrón verificado en
      // test/integration/CrashRecovery.test.ts, "Export falla a mitad de generación").
      await FileSystem.writeAsStringAsync(filePath, ifcContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      throw AppError.wrap(err, AppErrorCode.EXPORT_FAILED, 'No se pudo escribir el archivo IFC en el dispositivo.', {
        filePath,
      });
    }

    return { filePath, warnings, exportTime };
  }

  private async ensureDir(dir: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}
