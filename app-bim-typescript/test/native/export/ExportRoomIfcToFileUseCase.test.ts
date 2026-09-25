// =============================================================================
// ExportRoomIfcToFileUseCase.test.ts — Exporta un Recinto a IFC y escribe a disco
// =============================================================================

const mockGetInfo = jest.fn();
const mockMakeDir = jest.fn();
const mockWriteString = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/com.polylivebim/documents/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: mockGetInfo,
  makeDirectoryAsync: mockMakeDir,
  writeAsStringAsync: mockWriteString,
}));

import { ExportRoomIfcToFileUseCase } from '../../../src/native/export/ExportRoomIfcToFileUseCase';
import { ExportRoomIfcUseCase } from '../../../src/application/use-cases/ExportRoomIfcUseCase';
import { roomId } from '../../../src/domain/objects';
import { AppError, AppErrorCode } from '../../../src/shared/errors/AppError';

const ROOM_ID = roomId('export-room');

function mockExportRoomIfcUseCase(overrides?: { throws?: unknown }): ExportRoomIfcUseCase {
  const execute = overrides?.throws
    ? jest.fn().mockRejectedValue(overrides.throws)
    : jest.fn().mockResolvedValue({
        ifcContent: "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;",
        warnings: [],
        exportTime: 12,
      });
  return { execute } as unknown as ExportRoomIfcUseCase;
}

describe('ExportRoomIfcToFileUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfo.mockResolvedValue({ exists: true, isDirectory: true });
  });

  it('escribe el contenido IFC generado a un archivo .ifc como texto UTF8', async () => {
    const useCase = new ExportRoomIfcToFileUseCase(mockExportRoomIfcUseCase());
    const result = await useCase.execute({ roomId: ROOM_ID });

    expect(mockWriteString).toHaveBeenCalledTimes(1);
    const [path, content, options] = mockWriteString.mock.calls[0];
    expect(path).toContain('exports/');
    expect(path.endsWith('.ifc')).toBe(true);
    expect(content).toContain('ISO-10303-21');
    expect(options).toEqual({ encoding: 'utf8' });
    expect(result.filePath).toBe(path);
  });

  it('crea el directorio de exportación si no existe', async () => {
    mockGetInfo.mockResolvedValue({ exists: false });
    const useCase = new ExportRoomIfcToFileUseCase(mockExportRoomIfcUseCase());

    await useCase.execute({ roomId: ROOM_ID });

    expect(mockMakeDir).toHaveBeenCalledWith(expect.any(String), { intermediates: true });
  });

  it('respeta exportDir y filename personalizados', async () => {
    const useCase = new ExportRoomIfcToFileUseCase(mockExportRoomIfcUseCase());
    const result = await useCase.execute({
      roomId: ROOM_ID,
      exportDir: 'file:///custom/dir/',
      filename: 'mi-recinto.ifc',
    });

    expect(result.filePath).toBe('file:///custom/dir/mi-recinto.ifc');
  });

  it('si ExportRoomIfcUseCase lanza (ej. Compatibility Gate rechaza), nunca se llega a escribir el archivo', async () => {
    const useCase = new ExportRoomIfcToFileUseCase(mockExportRoomIfcUseCase({ throws: new Error('gate rejected') }));

    await expect(useCase.execute({ roomId: ROOM_ID })).rejects.toThrow('gate rejected');
    expect(mockWriteString).not.toHaveBeenCalled();
  });

  it('lanza AppError EXPORT_FAILED si falla la escritura a disco (contenido ya generado, se pierde el escrito)', async () => {
    mockWriteString.mockRejectedValue(new Error('disk full'));
    const useCase = new ExportRoomIfcToFileUseCase(mockExportRoomIfcUseCase());

    let error: unknown;
    try {
      await useCase.execute({ roomId: ROOM_ID });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.EXPORT_FAILED);
  });
});
