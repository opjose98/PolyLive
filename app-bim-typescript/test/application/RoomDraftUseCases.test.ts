// =============================================================================
// RoomDraftUseCases.test.ts — SaveRoomDraftUseCase / RecoverRoomDraftUseCase
// Basado en: escenarios-recuperación.md, Maestro §7.10 — cierra Gap #1 de
// docs/07-BUGS-GAPS-COMPLETE.md.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { roomId } from '../../src/domain/objects';
import { SaveRoomDraftUseCase } from '../../src/application/use-cases/SaveRoomDraftUseCase';
import { RecoverRoomDraftUseCase } from '../../src/application/use-cases/RecoverRoomDraftUseCase';

const ROOM_ID = roomId('draft-room');

function tempDbPath(name: string): string {
  return path.join(os.tmpdir(), `room-draft-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('SaveRoomDraftUseCase + RecoverRoomDraftUseCase', () => {
  let dbPath: string;
  let db: Database;
  let store: ObjectStore;

  beforeEach(async () => {
    dbPath = tempDbPath('main');
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('recover retorna hasDraft: false cuando no se guardó ningún borrador', async () => {
    const recover = new RecoverRoomDraftUseCase(store);
    const result = await recover.execute({ roomId: ROOM_ID });
    expect(result).toEqual({ hasDraft: false });
  });

  it('save seguido de recover reconstruye exactamente los vértices guardados', async () => {
    const save = new SaveRoomDraftUseCase(store);
    const recover = new RecoverRoomDraftUseCase(store);

    const vertices = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
    ];
    await save.execute({ roomId: ROOM_ID, vertices, isClosed: false });

    const result = await recover.execute({ roomId: ROOM_ID });
    expect(result.hasDraft).toBe(true);
    if (result.hasDraft) {
      expect(result.vertices).toEqual(vertices);
      expect(result.isClosed).toBe(false);
    }
  });

  it('guardados sucesivos sobreescriben el mismo borrador (a lo sumo uno vivo por Recinto)', async () => {
    const save = new SaveRoomDraftUseCase(store);
    const recover = new RecoverRoomDraftUseCase(store);

    await save.execute({ roomId: ROOM_ID, vertices: [{ x: 0, y: 0 }], isClosed: false });
    await save.execute({
      roomId: ROOM_ID,
      vertices: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      isClosed: false,
    });

    const result = await recover.execute({ roomId: ROOM_ID });
    expect(result.hasDraft).toBe(true);
    if (result.hasDraft) {
      expect(result.vertices).toHaveLength(2);
    }

    // Verificación directa: solo debe existir UNA fila en polygon_drafts para este Recinto.
    const rows = await db.all('SELECT id FROM polygon_drafts WHERE room_id = ?', [ROOM_ID as unknown as string]);
    expect(rows).toHaveLength(1);
  });

  it('confirmContinue borra el borrador tras aceptarlo — no queda para recuperarse de nuevo', async () => {
    const save = new SaveRoomDraftUseCase(store);
    const recover = new RecoverRoomDraftUseCase(store);

    await save.execute({ roomId: ROOM_ID, vertices: [{ x: 0, y: 0 }], isClosed: false });
    const found = await recover.execute({ roomId: ROOM_ID });
    expect(found.hasDraft).toBe(true);
    if (!found.hasDraft) throw new Error('unreachable');

    await recover.confirmContinue(found.draftId);

    const after = await recover.execute({ roomId: ROOM_ID });
    expect(after).toEqual({ hasDraft: false });
  });

  it('discard borra el borrador sin necesidad de haberlo continuado', async () => {
    const save = new SaveRoomDraftUseCase(store);
    const recover = new RecoverRoomDraftUseCase(store);

    await save.execute({ roomId: ROOM_ID, vertices: [{ x: 1, y: 1 }], isClosed: false });
    const found = await recover.execute({ roomId: ROOM_ID });
    if (!found.hasDraft) throw new Error('unreachable');

    await recover.discard(found.draftId);

    const after = await recover.execute({ roomId: ROOM_ID });
    expect(after).toEqual({ hasDraft: false });
  });

  it('sobrevive cerrar y reabrir la conexión (crash real, no simulado en memoria)', async () => {
    const save = new SaveRoomDraftUseCase(store);
    const vertices = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
    ];
    await save.execute({ roomId: ROOM_ID, vertices, isClosed: false });
    await db.close();

    const db2 = new Database(dbPath);
    await db2.open();
    const store2 = new ObjectStore(db2);
    const recover2 = new RecoverRoomDraftUseCase(store2);

    const result = await recover2.execute({ roomId: ROOM_ID });
    expect(result.hasDraft).toBe(true);
    if (result.hasDraft) {
      expect(result.vertices).toEqual(vertices);
    }

    db = db2; // para que afterEach cierre la conexión correcta
  });
});
