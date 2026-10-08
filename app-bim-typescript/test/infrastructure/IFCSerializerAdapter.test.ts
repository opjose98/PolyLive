// =============================================================================
// IFCSerializerAdapter.test.ts — Adapta IFCSerializer al contrato IIFCSerializer
// =============================================================================

import { IFCSerializerAdapter } from '../../src/infrastructure/export/ifc/IFCSerializerAdapter';
import { Room, Wall, roomId, revitObjectId, levelId } from '../../src/domain/objects';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { AppError, AppErrorCode } from '../../src/shared/errors/AppError';

const ROOM_ID = roomId('ifc-adapter-room');

function makeClosedRoom(): Room {
  return new Room({
    id: revitObjectId(ROOM_ID as unknown as string),
    roomId: ROOM_ID,
    levelId: levelId('level-1'),
    geometry: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
    isOpen: false,
    isClosed: true,
    area: squareMeters(16),
  });
}

function makeWall(): Wall {
  return new Wall({
    id: revitObjectId('wall-1'),
    roomId: ROOM_ID,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 4, y: 0 },
    thickness: meters(0.15),
    height: meters(2.8),
  });
}

describe('IFCSerializerAdapter', () => {
  it('retorna un string STEP plano (no el objeto SerializeResult envolvente)', async () => {
    const adapter = new IFCSerializerAdapter();
    const content = await adapter.serialize({
      room: makeClosedRoom(),
      walls: [makeWall()],
      doors: [],
      windows: [],
      columns: [],
      floor: null,
    });

    expect(typeof content).toBe('string');
    expect(content).toContain('ISO-10303-21');
    expect(content).toContain('IFCWALL(');
  });

  it('lanza AppError EXPORT_FAILED cuando el Compatibility Gate rechaza el Recinto, en vez de retornar contenido vacío silenciosamente', async () => {
    const adapter = new IFCSerializerAdapter();

    // Criterio 2 del Compatibility Gate (error, no warning): un Room con menos
    // de 3 vértices es geometría inválida para IFC.
    const invalidRoom = new Room({
      id: revitObjectId(ROOM_ID as unknown as string),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      isOpen: true,
      isClosed: false,
      area: null,
    });

    let error: unknown;
    try {
      await adapter.serialize({ room: invalidRoom, walls: [], doors: [], windows: [], columns: [], floor: null });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(AppErrorCode.EXPORT_FAILED);
  });
});
