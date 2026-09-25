// =============================================================================
// CapturePhotoUseCase.test.ts — Captura foto y registra AuditPhoto
// =============================================================================
//
// No existía un test unitario dedicado para este UseCase — encontrado
// durante la auditoría al construir el selector de vinculación de fotos en
// GalleryScreen. Cubre en particular el filename pasado explícitamente
// (GAP CORREGIDO: antes el UseCase inventaba su propio filename,
// desconectado del que usa la capa de filesystem para guardar el archivo).
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { CommandStack } from '../../src/application/state/CommandStack';
import { CapturePhotoUseCase } from '../../src/application/use-cases/CapturePhotoUseCase';
import { roomId } from '../../src/domain/objects';

const ROOM_ID = roomId('photo-room');

describe('CapturePhotoUseCase', () => {
  let db: Database;
  let store: ObjectStore;
  let commandStack: CommandStack;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
    commandStack = new CommandStack(store);
  });

  afterEach(async () => {
    await db.close();
  });

  it('persiste el filename EXACTO pasado por el llamador (correlación con el archivo en disco)', async () => {
    const useCase = new CapturePhotoUseCase(store, commandStack);
    const result = await useCase.execute({
      roomId: ROOM_ID,
      photoData: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      filename: 'photo-1234567890.jpg', // el nombre que ExpoFileSystem.savePhoto() realmente usó
    });

    const saved = await store.readAuditPhoto(result.photoId);
    expect(saved).not.toBeNull();
    expect(saved!.metadata.filename).toBe('photo-1234567890.jpg');
  });

  it('genera un filename propio si el llamador no pasa uno (comportamiento previo, preservado como fallback)', async () => {
    const useCase = new CapturePhotoUseCase(store, commandStack);
    const result = await useCase.execute({
      roomId: ROOM_ID,
      photoData: new Uint8Array([1, 2, 3]),
    });

    const saved = await store.readAuditPhoto(result.photoId);
    expect(saved!.metadata.filename).toContain(String(ROOM_ID));
  });

  it('persiste los bytes de la foto sin pérdida (roundtrip)', async () => {
    const useCase = new CapturePhotoUseCase(store, commandStack);
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    const result = await useCase.execute({ roomId: ROOM_ID, photoData: bytes, filename: 'x.jpg' });

    const saved = await store.readAuditPhoto(result.photoId);
    expect(Array.from(saved!.foto!)).toEqual(Array.from(bytes));
  });

  it('emite un CapturePhotoCommand en el CommandStack', async () => {
    const useCase = new CapturePhotoUseCase(store, commandStack);
    await useCase.execute({ roomId: ROOM_ID, photoData: new Uint8Array([1]), filename: 'x.jpg' });

    expect(commandStack.size()).toBe(1);
  });
});
