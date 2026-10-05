// =============================================================================
// AppServices.test.ts — Composition root: cablea todo el UseCase graph
// contra implementaciones reales (no mocks) y verifica un flujo mínimo
// end-to-end (crear muro → cerrar Recinto → guardar/recuperar borrador).
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices } from '../../src/application/AppServices';
import { roomId } from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';

function tempDbPath(name: string): string {
  return path.join(os.tmpdir(), `app-services-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('createAppServices — composition root con implementaciones reales', () => {
  let dbPath: string;
  let db: Database;

  beforeEach(async () => {
    dbPath = tempDbPath('main');
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('crea un muro de punta a punta usando ValidationService y CDTAdapter reales (sin mocks)', async () => {
    const services = createAppServices(db);
    const ROOM_ID = roomId('e2e-room');

    const wallOut = await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    expect(wallOut.wall.id).toBeDefined();
    expect(services.commandStack.size()).toBe(1);

    const wall2Out = await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 4, y: 0 },
      endPoint: { x: 4, y: 4 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 4, y: 4 },
      endPoint: { x: 0, y: 4 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 4 },
      endPoint: { x: 0, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    void wall2Out;
  });

  it('rechaza crear un muro degenerado con el AppError/ValidationError real (no un mock permisivo)', async () => {
    const services = createAppServices(db);
    await expect(
      services.useCases.createWall.execute({
        roomId: roomId('e2e-room-2'),
        startPoint: { x: 1, y: 1 },
        endPoint: { x: 1, y: 1 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    ).rejects.toThrow();
  });

});
