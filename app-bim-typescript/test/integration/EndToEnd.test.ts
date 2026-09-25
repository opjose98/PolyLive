// =============================================================================
// EndToEnd.test.ts — 8 flujos de integración completos
// Basado en: flujos-integración-documentados.md, estrategia-integration-testing.md
//
// A diferencia de test/application/UseCase.integration.test.ts (que mockea
// IObjectStore por completo), estos tests cruzan las capas reales descritas
// en flujos-integración-documentados.md: Canvas → UseCase → Validate →
// SQLite real (en memoria) → Command → State (Zustand). Solo se mockea lo
// que es genuinamente externo al código bajo prueba: IValidationService
// (para poder forzar warnings/errores deterministas) e IBLEManager (no hay
// hardware BLE en CI).
//
// Los pasos puramente de UI ("Canvas re-renders") no son verificables desde
// aquí — se documentan en el comentario de cada flujo y se omiten del assert.
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import {
  Wall,
  Door,
  Room,
  RevitObjectId,
  RoomId,
  WallId,
  roomId,
  wallId,
  levelId,
  revitObjectId,
} from '../../src/domain/objects';
import { meters, squareMeters, Point2D } from '../../src/domain/geometry/types';
import { CDT } from '../../src/domain/geometry/CDT';
import { CommandStack } from '../../src/application/state/CommandStack';
import { CanvasManager, canvasPoint } from '../../src/application/canvas';
import { createAppStore, AppStore } from '../../src/state/appStore';
import { IValidationService, ICDT, IBLEManager, ValidationResult } from '../../src/application/use-cases/types';
import { CreateWallUseCase } from '../../src/application/use-cases/CreateWallUseCase';
import { CreateDoorUseCase } from '../../src/application/use-cases/CreateDoorUseCase';
import { MoveObjectUseCase } from '../../src/application/use-cases/MoveObjectUseCase';
import { CloseRoomUseCase } from '../../src/application/use-cases/CloseRoomUseCase';
import { ExportRoomIfcUseCase } from '../../src/application/use-cases/ExportRoomIfcUseCase';
import { CaptureMeasurementUseCase } from '../../src/application/use-cases/CaptureMeasurementUseCase';
import { CapturePhotoUseCase } from '../../src/application/use-cases/CapturePhotoUseCase';
import { LinkPhotoToObjectUseCase } from '../../src/application/use-cases/LinkPhotoToObjectUseCase';
import { IFCSerializerAdapter } from '../../src/infrastructure/export/ifc/IFCSerializerAdapter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers compartidos
// ---------------------------------------------------------------------------

/**
 * Adapta el CDT real de dominio (domain/geometry/CDT.ts, que trabaja con
 * Polygon.holes como polígonos de vértices) a la interfaz ICDT que esperan
 * los UseCases (application/use-cases/types.ts, que describe huecos como
 * círculos {center, radius} derivados de Column.diameter).
 *
 * NOTA ACTUALIZADA: este comentario afirmaba que "no existe en src/ un
 * adaptador real que convierta huecos circulares a polígonos aproximados — es
 * un gap real del código actual". Ya no lo es: `CloseRoomUseCase.circleToPolygon`
 * aproxima cada columna como un octógono regular antes de llamar a ICDT, y
 * `infrastructure/geometry/CDTAdapter` implementa el contrato contra el motor
 * real. Este adapter de test sigue existiendo solo para no depender del
 * composition root dentro de una suite de flujos.
 */
class RealCdtAdapter implements ICDT {
  private readonly cdt = new CDT();

  async triangulate(
    boundary: Array<{ x: number; y: number }>,
    holes?: Array<Array<{ x: number; y: number }>>,
  ) {
    return this.cdt.triangulate({
      vertices: boundary as Point2D[],
      holes: holes?.map((h) => ({ vertices: h as Point2D[], isClosed: true })),
      isClosed: true,
    });
  }
}

function alwaysValidService(): IValidationService {
  const ok: ValidationResult = { valid: true, warnings: [] };
  return {
    validateWall: jest.fn().mockReturnValue(ok),
    validateColumn: jest.fn().mockReturnValue(ok),
    validateDoor: jest.fn().mockReturnValue(ok),
    validateWindow: jest.fn().mockReturnValue(ok),
    validateRoom: jest.fn().mockReturnValue(ok),
    validateExport: jest.fn().mockReturnValue(ok),
  };
}

const ROOM_ID = roomId('e2e-room');
const LEVEL_ID = levelId('level-1');

// ---------------------------------------------------------------------------
// Setup / Teardown — SQLite real en memoria para cada test
// ---------------------------------------------------------------------------

let db: Database;
let store: ObjectStore;
let commandStack: CommandStack;
let validationService: IValidationService;

beforeEach(async () => {
  db = new Database(':memory:');
  await db.open();
  await db.migrate();
  store = new ObjectStore(db);
  commandStack = new CommandStack(store);
  validationService = alwaysValidService();
});

afterEach(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// 1. CreateWall — Canvas → UseCase → Validate → Persist → Command → State
// ---------------------------------------------------------------------------

describe('Flujo 1 — CreateWall', () => {
  it('screenToWorld → CreateWallUseCase → fila en SQLite + command en stack + Zustand refleja el nuevo objeto', async () => {
    // Canvas: el usuario arrastra en pantalla; CanvasManager convierte a coordenadas mundo.
    const canvasManager = new CanvasManager({ scale: 100, offsetX: 0, offsetY: 0 });
    const startWorld = canvasManager.screenToWorld(canvasPoint(0, 0));
    const endWorld = canvasManager.screenToWorld(canvasPoint(500, 0)); // 500px / 100px-per-m = 5m

    // Application: CreateWallUseCase.execute()
    const useCase = new CreateWallUseCase(store, commandStack, validationService);
    const output = await useCase.execute({
      roomId: ROOM_ID,
      startPoint: startWorld,
      endPoint: endWorld,
      thickness: meters(0.15),
      height: meters(2.8),
    });

    // Infrastructure: el muro existe en SQLite
    const persisted = (await store.readObject(output.wall.id)) as Wall;
    expect(persisted).not.toBeNull();
    expect(persisted.endPoint.x).toBeCloseTo(5, 6);

    // Application: comando en el stack
    expect(commandStack.size()).toBe(1);

    // State: simula lo que la capa UI haría tras recibir el output del UseCase
    // (no hay wiring automático UseCase → Zustand en el código actual).
    const appStore: AppStore = createAppStore();
    appStore.getState().setSelectedObjectId(output.wall.id);
    expect(appStore.getState().selectedObjectId).toBe(output.wall.id);

    // UI: re-render — fuera del alcance de un test sin runtime de React/Skia.
  });
});

// ---------------------------------------------------------------------------
// 2. MoveObject — Canvas drag → CanvasManager → MoveObjectUseCase → Persist → Command
// ---------------------------------------------------------------------------

describe('Flujo 2 — MoveObject', () => {
  it('drag en pantalla se traduce a un nuevo startPoint mundo y persiste el movimiento', async () => {
    const createWall = new CreateWallUseCase(store, commandStack, validationService);
    const wallOut = await createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    // Canvas: arrastre en píxeles convertido a mundo por CanvasManager, que es
    // el camino que recorre de verdad la app.
    //
    // La versión anterior de este test pasaba por `GestureHandler`, una capa de
    // eventos que ninguna pantalla llegó a usar: el canvas real traduce los
    // toques con `PanResponder` dentro de PlanCanvasView y se los entrega
    // directamente a EditorController. El test verificaba una tubería paralela
    // que no existía en la app, así que se eliminó junto con esa clase.
    const canvasManager = new CanvasManager({ scale: 100, offsetX: 0, offsetY: 0 });
    const dragStart = canvasManager.screenToWorld(canvasPoint(0, 0));
    const dragEnd = canvasManager.screenToWorld(canvasPoint(200, 200)); // 200px = 2m a 100px/m
    const deltaWorld = { x: dragEnd.x - dragStart.x, y: dragEnd.y - dragStart.y };

    const moveUseCase = new MoveObjectUseCase(store, commandStack);
    await moveUseCase.execute({
      objectId: wallOut.wall.id,
      newStartPoint: { x: deltaWorld.x, y: deltaWorld.y },
    });

    const moved = (await store.readObject(wallOut.wall.id)) as Wall;
    expect(moved.startPoint).toEqual({ x: 2, y: 2 });
    expect(moved.endPoint).toEqual({ x: 7, y: 2 }); // delta preservado
    expect(commandStack.size()).toBe(2); // create + move
  });
});

// ---------------------------------------------------------------------------
// 3. CloseRoom — UseCase → CDT (real) → Calculate area → Create Floor → Persist
// ---------------------------------------------------------------------------

describe('Flujo 3 — CloseRoom', () => {
  it('cierra un Room 4×3 usando el CDT real, calcula 12 m² y materializa el Floor implícito', async () => {
    const room = new Room({
      id: revitObjectId('e2e-room') as RevitObjectId,
      roomId: ROOM_ID,
      levelId: LEVEL_ID,
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      isOpen: true,
    });
    await store.createObject(room);

    const closeUseCase = new CloseRoomUseCase(store, commandStack, validationService, new RealCdtAdapter());
    const output = await closeUseCase.execute({ roomId: ROOM_ID });

    // Corregido durante auditoría (ver test/critical/CriticalCases.test.ts,
    // "Bug 4 corregido"): CloseRoomUseCase ahora muta `room.area`/`room.isOpen`
    // ANTES de persistir, así que `output.room` refleja el estado posterior al
    // cierre igual que lo que queda en SQLite — ya no hace falta releer del
    // store para obtener el área/estado correctos.
    expect(output.room.isOpen).toBe(false);
    expect(output.room.area).toEqual(squareMeters(12));
    expect(output.floor).not.toBeNull();
    expect(output.floor!.isImplicit).toBe(true);
    expect(commandStack.size()).toBe(1);

    const persistedRoom = (await store.readObject(room.id)) as Room;
    expect(persistedRoom.isOpen).toBe(false);
    expect(persistedRoom.area).toEqual(squareMeters(12));
  });
});

// ---------------------------------------------------------------------------
// 4. ExportIfc — UseCase → Compatibility gate → IFCSerializer → Write file
// ---------------------------------------------------------------------------

describe('Flujo 4 — ExportIfc', () => {
  it('exporta un Room cerrado a IFC (serializer real) y el contenido se puede escribir/leer de disco intacto', async () => {
    const rid = revitObjectId('e2e-room-export') as RevitObjectId;
    const exportRoomId = roomId('e2e-room-export');
    const room = new Room({
      id: rid,
      roomId: exportRoomId,
      levelId: LEVEL_ID,
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      isOpen: false,
      area: squareMeters(12),
    });
    await store.createObject(room);

    const createWall = new CreateWallUseCase(store, commandStack, validationService);
    await createWall.execute({
      roomId: exportRoomId,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    // IIFCSerializer real (no mockeado) — IFCSerializerAdapter envuelve
    // infrastructure/export/ifc/IFCSerializer.ts (que retorna
    // {content, validation, entityCount}) y expone el `Promise<string>` que
    // IIFCSerializer declara, lanzando AppError.EXPORT_FAILED si el
    // Compatibility Gate rechaza el Recinto. Antes de que este adapter
    // existiera en src/, este test tenía que construir ese puente a mano.
    // (Bug 2 de docs/07-BUGS-GAPS-COMPLETE.md — doors/windows mezclados en un
    // solo array — ya estaba corregido en ExportRoomIfcUseCase.ts antes de
    // esta wiring; el gap real y pendiente era solo este adapter de tipo.)
    const exportUseCase = new ExportRoomIfcUseCase(store, validationService, new IFCSerializerAdapter());

    const output = await exportUseCase.execute({ roomId: exportRoomId });

    expect(output.ifcContent).toContain('ISO-10303-21');
    expect(output.ifcContent).toContain('IFCWALLSTANDARDCASE');

    // Write file: el paso de escritura a disco no está en el UseCase (retorna el
    // string completo) — se simula aquí el paso que haría la capa de infraestructura.
    const tmpFile = path.join(os.tmpdir(), `e2e-export-${Date.now()}.ifc`);
    fs.writeFileSync(tmpFile, output.ifcContent, 'utf-8');
    const readBack = fs.readFileSync(tmpFile, 'utf-8');
    expect(readBack).toBe(output.ifcContent);
    fs.unlinkSync(tmpFile);

    // Export no es reversible — no debe emitir comando.
    expect(commandStack.size()).toBe(1); // solo el create wall; el export no agrega nada
  });
});

// ---------------------------------------------------------------------------
// 5. Undo/Redo — CommandStack.undo() → Command.undo() → Persist → State update
// ---------------------------------------------------------------------------

describe('Flujo 5 — Undo/Redo', () => {
  it('CommandStack.undo() revierte la persistencia y redo() la vuelve a aplicar', async () => {
    const createWall = new CreateWallUseCase(store, commandStack, validationService);
    const output = await createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    // Undo: el muro debe "desaparecer" (soft-delete → readObject retorna null)
    await commandStack.undo();
    expect(await store.readObject(output.wall.id)).toBeNull();
    expect(commandStack.size()).toBe(0);
    expect(commandStack.canRedo()).toBe(true);

    // Redo: el muro vuelve a aparecer, con su geometría intacta.
    //
    // ESTE TEST DOCUMENTABA UN BUG COMO SI FUERA EL CONTRATO. Su versión
    // anterior afirmaba que tras el redo el muro "sigue borrado", porque
    // `CreateWallCommand.execute()` era un no-op y CommandStack.redo() lo
    // reejecutaba sin efecto. Eso no es un gap aceptable: la UI enseña un
    // botón Rehacer habilitado que no hacía nada. Los `Create*Command` ahora
    // llaman a `store.restoreObject()`, la inversa exacta del soft-delete que
    // hace su `undo()`.
    await commandStack.redo();
    expect(commandStack.size()).toBe(1);

    const restored = (await store.readObject(output.wall.id)) as Wall | null;
    expect(restored).not.toBeNull();
    expect(restored!.startPoint).toEqual({ x: 0, y: 0 });
    expect(restored!.endPoint).toEqual({ x: 5, y: 0 });
    expect(restored!.thickness).toBeCloseTo(0.15);
  });

  it('el redo de un muro con vanos restaura también los vanos que el undo borró en cascada', async () => {
    const createWall = new CreateWallUseCase(store, commandStack, validationService);
    const wallOut = await createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    const doorOut = await new CreateDoorUseCase(store, commandStack, validationService).execute({
      roomId: ROOM_ID,
      parentWallId: wallId(wallOut.wall.id as string),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    // Deshacer la puerta y luego el muro deja los dos borrados.
    await commandStack.undo(); // la puerta
    await commandStack.undo(); // el muro
    expect(await store.readObject(wallOut.wall.id)).toBeNull();
    expect(await store.readObject(doorOut.door.id)).toBeNull();

    // Rehacer el muro restaura el muro. La puerta NO: su propio undo la borró
    // explícitamente antes, así que restaurarla aquí resucitaría algo que el
    // operador deshizo por separado. Se recupera con el siguiente redo.
    await commandStack.redo();
    expect(await store.readObject(wallOut.wall.id)).not.toBeNull();
    expect(await store.readObject(doorOut.door.id)).toBeNull();

    await commandStack.redo();
    expect(await store.readObject(doorOut.door.id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. BLE Measurement — Gesture (measure mode) → BLE capture 7x → Average → Store
// ---------------------------------------------------------------------------

describe('Flujo 6 — BLE Measurement', () => {
  it('captura 7 muestras BLE, calcula el promedio y lo persiste en measurements', async () => {
    const wallOut = await new CreateWallUseCase(store, commandStack, validationService).execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    const samples = [3.98, 4.02, 4.0, 4.01, 3.99, 4.0, 4.02];
    let call = 0;
    const bleManager: IBLEManager = {
      measure: jest.fn().mockImplementation(async () => samples[call++]),
    };

    const captureUseCase = new CaptureMeasurementUseCase(store, bleManager);
    const output = await captureUseCase.execute({
      roomId: ROOM_ID,
      wallId: wallId(wallOut.wall.id as unknown as string),
      method: 'ble',
    });

    expect(bleManager.measure).toHaveBeenCalledTimes(7);
    const expectedAvg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(output.average as unknown as number).toBeCloseTo(expectedAvg, 6);
    expect(output.outliers).toHaveLength(0);

    // Verificar persistencia real en la tabla measurements
    const row = await db.get<{ average: number; capture_method: string }>(
      'SELECT average, capture_method FROM measurements WHERE id = ?',
      [output.measurementId as unknown as string],
    );
    expect(row).toBeDefined();
    expect(row!.capture_method).toBe('ble');
    expect(row!.average).toBeCloseTo(expectedAvg, 6);
  });
});

// ---------------------------------------------------------------------------
// 7. Photo Capture + Link — CapturePhotoUseCase → Write file + DB record → LinkPhotoCommand
// ---------------------------------------------------------------------------

describe('Flujo 7 — Photo Capture + Link', () => {
  it('captura una foto, la persiste, y la vincula a un Wall existente', async () => {
    const wallOut = await new CreateWallUseCase(store, commandStack, validationService).execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    const capturePhotoUseCase = new CapturePhotoUseCase(store, commandStack);
    const photoOut = await capturePhotoUseCase.execute({
      roomId: ROOM_ID,
      photoData: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    // "Write file + DB record simultáneos": en la implementación actual la foto
    // se persiste como BLOB en SQLite (audit_photos), no en el filesystem —
    // PhotoRepository (filesystem) aún no existe en src/.
    const row = await db.get<{ foto: Buffer }>('SELECT foto FROM audit_photos WHERE id = ?', [
      photoOut.photoId as unknown as string,
    ]);
    expect(row).toBeDefined();
    expect(Buffer.isBuffer(row!.foto)).toBe(true);

    const linkUseCase = new LinkPhotoToObjectUseCase(store, commandStack);
    await linkUseCase.execute({
      photoId: photoOut.photoId,
      objectId: wallOut.wall.id,
    });

    // Bug 1 corregido: ObjectStore.ts ahora serializa y deserializa linkedPhotos
    // via properties_json — el link sobrevive el roundtrip a SQLite.
    const linkedWall = (await store.readObject(wallOut.wall.id)) as Wall;
    expect(linkedWall.linkedPhotos).toContain(photoOut.photoId);
    expect(commandStack.size()).toBe(3); // create wall + capture photo + link photo
  });
});

// ---------------------------------------------------------------------------
// 8. Multi-step transaction — CreateWall + CreateDoor + CloseRoom → 1 sesión,
//    undo reversa todos (en orden inverso)
// ---------------------------------------------------------------------------

describe('Flujo 8 — Multi-step transaction', () => {
  it('CreateWall + CreateDoor + CloseRoom, luego 3x undo revierte todo al estado original', async () => {
    const room = new Room({
      id: revitObjectId('e2e-room-multi') as RevitObjectId,
      roomId: roomId('e2e-room-multi'),
      levelId: LEVEL_ID,
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      isOpen: true,
    });
    await store.createObject(room);
    const multiRoomId = roomId('e2e-room-multi');

    const wallOut = await new CreateWallUseCase(store, commandStack, validationService).execute({
      roomId: multiRoomId,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    const doorOut = await new CreateDoorUseCase(store, commandStack, validationService).execute({
      roomId: multiRoomId,
      parentWallId: wallId(wallOut.wall.id as unknown as string),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    const closeOut = await new CloseRoomUseCase(
      store,
      commandStack,
      validationService,
      new RealCdtAdapter(),
    ).execute({ roomId: multiRoomId });

    expect(commandStack.size()).toBe(3);
    expect(closeOut.floor).not.toBeNull();

    // Undo x3, en orden inverso: CloseRoom, CreateDoor, CreateWall
    await commandStack.undo(); // deshace CloseRoom
    const reopenedRoom = (await store.readObject(room.id)) as Room;
    expect(reopenedRoom.isOpen).toBe(true);
    expect(reopenedRoom.area).toBeNull();
    expect(await store.readObject(closeOut.floor!.id)).toBeNull();

    await commandStack.undo(); // deshace CreateDoor
    expect(await store.readObject(doorOut.door.id)).toBeNull();

    await commandStack.undo(); // deshace CreateWall
    expect(await store.readObject(wallOut.wall.id)).toBeNull();

    expect(commandStack.size()).toBe(0);
    expect(commandStack.undoneSize()).toBe(3);
  });
});
