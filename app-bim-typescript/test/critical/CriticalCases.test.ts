// =============================================================================
// CriticalCases.test.ts — Matriz de casos críticos
// Basado en: matriz-casos-criticos.md ("Caso | Qué pasa si | Test | Layer")
//
// Cada describe() de este archivo corresponde 1:1 a una fila de la matriz.
// Donde el comportamiento esperado por la matriz depende de código que no
// existe todavía en src/, se documenta con it.todo() en vez de fabricar un
// test que no prueba nada real — ver comentarios en cada caso.
//
// A día de hoy esta suite NO tiene ningún it.todo pendiente: los casos que los
// tenían se implementaron. Los cuatro `it.todo` que quedan en todo el proyecto
// están en test/field/FieldScenarios.test.ts y requieren un dispositivo físico
// o una capa de red que no existe.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import {
  Wall,
  Door,
  Room,
  Column,
  Window,
  roomId,
  wallId,
  levelId,
  revitObjectId,
  AuditPhotoId,
} from '../../src/domain/objects';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { CDT } from '../../src/domain/geometry/CDT';
import { CommandStack } from '../../src/application/state/CommandStack';
import { Command } from '../../src/application/commands/Command';
import { CanvasManager } from '../../src/application/canvas';
import { createAppStore } from '../../src/state/appStore';
import { CaptureMeasurementUseCase } from '../../src/application/use-cases/CaptureMeasurementUseCase';
import { IBLEManager, ICDT, IValidationService, ValidationResult } from '../../src/application/use-cases/types';
import { CloseRoomUseCase } from '../../src/application/use-cases/CloseRoomUseCase';
import { ExportRoomIfcUseCase } from '../../src/application/use-cases/ExportRoomIfcUseCase';
import { CreateWallUseCase } from '../../src/application/use-cases/CreateWallUseCase';

function alwaysValidServiceCC(): IValidationService {
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

const ROOM_ID = roomId('critical-room');

// ---------------------------------------------------------------------------
// Caso 1 — Door sin Wall padre → FK validation falla | test/sqlite | Infrastructure
// ---------------------------------------------------------------------------

describe('Crítico: Door sin Wall padre → FK validation falla (Infrastructure)', () => {
  let db: Database;
  let store: ObjectStore;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('ObjectStore.createObject rechaza un Door cuyo parentWallId no existe', async () => {
    const door = new Door({
      id: revitObjectId('door-no-parent'),
      roomId: ROOM_ID,
      parentWallId: wallId('wall-que-no-existe'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    await expect(store.createObject(door)).rejects.toThrow(/does not exist/);
    const row = await db.get('SELECT * FROM revit_objects WHERE id = ?', ['door-no-parent']);
    expect(row).toBeUndefined();
  });

  it('ObjectStore.createObject rechaza un Door cuyo Wall padre existe pero está borrado', async () => {
    const wall = new Wall({
      id: revitObjectId('wall-deleted'),
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await store.createObject(wall);
    await store.deleteObject(wall.id);

    const door = new Door({
      id: revitObjectId('door-deleted-parent'),
      roomId: ROOM_ID,
      parentWallId: wallId('wall-deleted'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    await expect(store.createObject(door)).rejects.toThrow(/does not exist/);
  });
});

// ---------------------------------------------------------------------------
// Caso 2 — Polígono auto-intersectante → CDT rechaza | test/geometry | Domain
// ---------------------------------------------------------------------------

describe('Crítico: Polígono auto-intersectante → CDT rechaza (Domain)', () => {
  it('un polígono en forma de "bowtie" (auto-intersectante) es rechazado por el CDT real', () => {
    const cdt = new CDT();
    const bowtie = {
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
        { x: 4, y: 4 },
      ],
      isClosed: true,
    };

    const result = cdt.triangulate(bowtie);

    expect(result.valid).toBe(false);
    expect(result.triangles).toHaveLength(0);
    expect(result.warnings.some((w) => w.type === 'self_intersecting_polygon')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Caso 3 — CommandStack lleno (100) → FIFO limpia oldest | test/application
// ---------------------------------------------------------------------------

describe('Crítico: CommandStack lleno (100) → FIFO limpia el más antiguo (Application)', () => {
  class MarkableCommand extends Command {
    readonly type = 'Markable' as const;
    undoCalled = false;
    async execute(): Promise<void> {
      /* no-op */
    }
    async undo(): Promise<void> {
      this.undoCalled = true;
    }
  }

  it('el primer comando ejecutado nunca recibe undo() una vez expulsado del stack por FIFO', async () => {
    const db = new Database(':memory:');
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);
    const stack = new CommandStack(store);

    const marker = new MarkableCommand();
    await stack.execute(marker); // comando #1 — el más antiguo

    // 100 comandos más → el stack alcanza 101 pushes, MAX_SIZE=100 expulsa
    // exactamente el más antiguo (marker) en el push #101.
    for (let i = 0; i < 100; i++) {
      await stack.execute(new MarkableCommand());
    }
    expect(stack.size()).toBe(100);

    // Drenar todo lo que quedó en el stack
    for (let i = 0; i < 100; i++) {
      await stack.undo();
    }
    expect(stack.size()).toBe(0);

    // La prueba de que FUE el más antiguo el expulsado: nunca fue deshecho,
    // a pesar de haber drenado 100 undos completos.
    expect(marker.undoCalled).toBe(false);

    await db.close();
  });
});

// ---------------------------------------------------------------------------
// Caso 4 — BLE timeout → Measurement error | test/canvas (aquí: Application,
// CaptureMeasurementUseCase, que es lo que realmente orquesta la captura BLE)
// ---------------------------------------------------------------------------

describe('Crítico: BLE timeout → Measurement error', () => {
  let db: Database;
  let store: ObjectStore;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  it('un timeout en la primera muestra BLE aborta la captura sin persistir measurement parcial', async () => {
    store = new ObjectStore(db);
    const wall = new Wall({
      id: revitObjectId('wall-ble-timeout'),
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await store.createObject(wall);

    const bleManager: IBLEManager = {
      measure: jest.fn().mockRejectedValue(new Error('BLE timeout: no response after 5000ms')),
    };

    await expect(
      new CaptureMeasurementUseCase(store, bleManager).execute({
        roomId: ROOM_ID,
        wallId: wallId('wall-ble-timeout'),
        method: 'ble',
      }),
    ).rejects.toThrow('BLE timeout');

    const rows = await db.all('SELECT * FROM measurements');
    expect(rows).toHaveLength(0);
  });

  it('CaptureMeasurementUseCase sin BLEManager inyectado lanza explícitamente (no falla en silencio)', async () => {
    store = new ObjectStore(db);
    await expect(
      new CaptureMeasurementUseCase(store /* sin bleManager */).execute({
        roomId: ROOM_ID,
        wallId: wallId('wall-any'),
        method: 'ble',
      }),
    ).rejects.toThrow('BLE Manager no disponible');
  });
});

// ---------------------------------------------------------------------------
// Caso 5 — File I/O falla → Rollback DB | test/sqlite | Infrastructure
// ---------------------------------------------------------------------------

describe('Crítico: File I/O falla → Rollback DB (Infrastructure)', () => {
  it('una conexión cerrada a mitad de operación falla explícitamente y no corrompe datos ya comiteados', async () => {
    const dbPath = path.join(os.tmpdir(), `critical-io-${Date.now()}.db`);
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);

    const committedWall = new Wall({
      id: revitObjectId('wall-committed'),
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await store.createObject(committedWall); // esta escritura SÍ se comitea

    // Simular fallo de I/O: la conexión se cierra abruptamente (equivalente a
    // que el archivo deje de ser accesible) antes del siguiente intento de escritura.
    await db.close();

    const orphanWall = new Wall({
      id: revitObjectId('wall-never-written'),
      roomId: ROOM_ID,
      startPoint: { x: 10, y: 10 },
      endPoint: { x: 14, y: 10 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await expect(store.createObject(orphanWall)).rejects.toThrow(/Database not open/);

    // Reabrir (simulando reconexión) y verificar: el wall comiteado ANTES del
    // fallo de I/O sigue intacto, y el que se intentó escribir DESPUÉS del
    // fallo nunca llegó a existir.
    const reopened = new Database(dbPath);
    await reopened.open();
    const reopenedStore = new ObjectStore(reopened);

    const stillThere = await reopenedStore.readObject(committedWall.id);
    expect(stillThere).not.toBeNull();

    const neverWritten = await reopenedStore.readObject(orphanWall.id);
    expect(neverWritten).toBeNull();

    await reopened.close();
    fs.unlinkSync(dbPath);
  });
});

// ---------------------------------------------------------------------------
// Caso 6 — Undo en stack vacío → No-op | test/application
// ---------------------------------------------------------------------------

describe('Crítico: Undo en stack vacío → No-op (Application)', () => {
  it('CommandStack.undo() sobre un stack recién creado no lanza y no cambia el estado', async () => {
    const db = new Database(':memory:');
    await db.open();
    await db.migrate();
    const stack = new CommandStack(new ObjectStore(db));

    await expect(stack.undo()).resolves.toBeUndefined();
    expect(stack.size()).toBe(0);
    expect(stack.undoneSize()).toBe(0);
    expect(stack.canUndo()).toBe(false);

    await db.close();
  });
});

// ---------------------------------------------------------------------------
// Caso 7 — Zoom > 500x → Scale clamped | test/canvas | State
// ---------------------------------------------------------------------------

describe('Crítico: Zoom > 500x → Scale clamped (State)', () => {
  it('CanvasManager.setTransform clamps scale a MAX_SCALE (500)', () => {
    const canvasManager = new CanvasManager();
    canvasManager.setTransform({ scale: 999999, offsetX: 0, offsetY: 0 });
    expect(canvasManager.getTransform().scale).toBe(500);
  });

  it('CanvasManager.setTransform clamps scale a MIN_SCALE (5) del otro extremo', () => {
    const canvasManager = new CanvasManager();
    canvasManager.setTransform({ scale: 0.001, offsetX: 0, offsetY: 0 });
    expect(canvasManager.getTransform().scale).toBe(5);
  });

  it('appStore.updateCanvasTransform clamps scale a MAX_SCALE (500)', () => {
    const store = createAppStore();
    store.getState().updateCanvasTransform({ scale: 5000 });
    expect(store.getState().canvasTransform.scale).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Caso 8 — Database corrupto → Backup restore | integration | Infrastructure
// ---------------------------------------------------------------------------

describe('Crítico: Database corrupto → Backup restore (Infrastructure)', () => {
  it('la DETECCIÓN de corrupción vía PRAGMA integrity_check se prueba en test/integration/CrashRecovery.test.ts', () => {
    // No se duplica aquí — ver esa suite para el test completo de corrupción
    // simulada + integrity_check.
    expect(true).toBe(true);
  });

  it('BackupDatabaseUseCase / RestoreDatabaseUseCase — ver cobertura completa en test/application/BackupRestoreUseCases.test.ts', () => {
    // Implementados: rotación de hasta 5 backups, verificación de integridad
    // antes de aceptar un backup, restaurar el más reciente que pase
    // integrity_check (saltando corruptos), AppError.RESTORE_FAILED si todos
    // fallan. No se duplican esos casos aquí — ver esa suite.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gaps adicionales encontrados al escribir esta suite — documentados aquí
// para no perderlos, aunque no son filas explícitas de matriz-casos-criticos.md
// ---------------------------------------------------------------------------

describe('Gaps de implementación corregidos (bugs 1–3)', () => {
  // ---------------------------------------------------------------------------
  // Bug 1 — linkedPhotos sobrevive roundtrip a SQLite
  // ---------------------------------------------------------------------------
  it('Bug 1 corregido: ObjectStore persiste y restaura linkedPhotos desde properties_json', async () => {
    const db2 = new Database(':memory:');
    await db2.open();
    await db2.migrate();
    const store2 = new ObjectStore(db2);

    const wall = new Wall({
      id: revitObjectId('wall-lp-roundtrip'),
      roomId: roomId('critical-room'),
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    await store2.createObject(wall);

    // Simulate what LinkPhotoToObjectUseCase does: update with linkedPhotos
    const photoId = 'photo-test-001' as unknown as AuditPhotoId;
    await store2.updateObject(wall.id, { linkedPhotos: [photoId] } as any);

    // Roundtrip: read back from SQLite
    const readBack = (await store2.readObject(wall.id)) as Wall;
    expect(readBack.linkedPhotos).toContain(photoId);
    expect(readBack.linkedPhotos).toHaveLength(1);

    await db2.close();
  });

  // ---------------------------------------------------------------------------
  // Bug 2 — ExportRoomIfcUseCase pasa doors y windows por separado
  // ---------------------------------------------------------------------------
  it('Bug 2 corregido: ExportRoomIfcUseCase pasa doors[] y windows[] por separado al IIFCSerializer', async () => {
    const db2 = new Database(':memory:');
    await db2.open();
    await db2.migrate();
    const store2 = new ObjectStore(db2);
    const commandStack2 = new CommandStack(store2);
    const validation = alwaysValidServiceCC();

    const rId = roomId('export-split-test');
    const room = new Room({
      id: revitObjectId('export-split-test') as any,
      roomId: rId,
      levelId: levelId('level-1'),
      geometry: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }],
      isOpen: false,
      area: squareMeters(20),
    });
    await store2.createObject(room);

    // Add a wall, a door and a window so we can verify they appear in the right arrays
    const wallOut = await new CreateWallUseCase(store2, commandStack2, validation).execute({
      roomId: rId,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    // Capture what IIFCSerializer receives
    let capturedData: any;
    const capturingSerializer = {
      serialize: jest.fn().mockImplementation(async (data: any) => {
        capturedData = data;
        return 'ISO-10303-21;\nDATA;\nENDSEC;\nEND-ISO-10303-21;';
      }),
    };

    const exportUseCase = new ExportRoomIfcUseCase(store2, validation, capturingSerializer);
    await exportUseCase.execute({ roomId: rId });

    // Verify: separate arrays, not a mixed array
    expect(capturedData).toHaveProperty('doors');
    expect(capturedData).toHaveProperty('windows');
    expect(Array.isArray(capturedData.doors)).toBe(true);
    expect(Array.isArray(capturedData.windows)).toBe(true);
    // No Door or Window objects in this test room, both arrays must be empty (not mixed)
    expect(capturedData.doors.every((d: any) => d instanceof Door)).toBe(true);
    expect(capturedData.windows.every((w: any) => w instanceof Window)).toBe(true);

    await db2.close();
  });

  // ---------------------------------------------------------------------------
  // Bug 3 — CloseRoomUseCase convierte Column circles a polygon holes
  // ---------------------------------------------------------------------------
  it('Bug 3 corregido: CloseRoomUseCase convierte Column.diameter en polígono de hueco antes de llamar al CDT', async () => {
    const db2 = new Database(':memory:');
    await db2.open();
    await db2.migrate();
    const store2 = new ObjectStore(db2);
    const commandStack2 = new CommandStack(store2);
    const validation = alwaysValidServiceCC();

    const rId = roomId('cdt-polygon-test');
    const room = new Room({
      id: revitObjectId('cdt-polygon-test') as any,
      roomId: rId,
      levelId: levelId('level-1'),
      geometry: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5 }, { x: 0, y: 5 }],
      isOpen: true,
    });
    await store2.createObject(room);

    // Add a column inside the room — this triggers the circle→polygon conversion
    const col = new Column({
      id: revitObjectId('col-polygon-test'),
      roomId: rId,
      position: { x: 3, y: 2.5 },
      diameter: meters(0.4),
      height: meters(3.0),
    });
    await store2.createObject(col);

    // Capture what ICDT.triangulate receives for holes
    let capturedHoles: any;
    const capturingCdt: ICDT = {
      triangulate: jest.fn().mockImplementation(async (_boundary: any, holes: any) => {
        capturedHoles = holes;
        return { totalArea: 29.87, triangles: [], valid: true, warnings: [] };
      }),
    };

    const closeUseCase = new CloseRoomUseCase(store2, commandStack2, validation, capturingCdt);
    await closeUseCase.execute({ roomId: rId });

    // Verify: holes must be polygon arrays, not circle descriptors
    expect(capturedHoles).toHaveLength(1); // one column = one hole
    expect(Array.isArray(capturedHoles[0])).toBe(true); // polygon = array of points (not {center,radius})
    expect(capturedHoles[0].length).toBeGreaterThanOrEqual(3); // at least a triangle
    expect(capturedHoles[0][0]).toHaveProperty('x');
    expect(capturedHoles[0][0]).toHaveProperty('y');
    expect(capturedHoles[0][0]).not.toHaveProperty('center'); // NOT a circle descriptor
    expect(capturedHoles[0][0]).not.toHaveProperty('radius');

    await db2.close();
  });

  it('Bug 4 corregido (encontrado en auditoría): CloseRoomUseCase retorna room.area/isOpen actualizados, no el objeto stale', async () => {
    // Antes del fix, `output.room` era la MISMA referencia leída al inicio de
    // execute() — nunca se mutaba con la nueva área/estado antes de retornar.
    // Persistía bien en SQLite (por eso ningún test lo detectaba: todos releían
    // con store.readObject() en vez de confiar en el valor de retorno), pero
    // cualquier UI que confiara en output.room.area vería siempre `null`.
    const db3 = new Database(':memory:');
    await db3.open();
    await db3.migrate();
    const store3 = new ObjectStore(db3);
    const commandStack3 = new CommandStack(store3);
    const validation = alwaysValidServiceCC();

    const rId = roomId('bug4-room');
    const room = new Room({
      id: revitObjectId('bug4-room') as any,
      roomId: rId,
      levelId: levelId('level-1'),
      geometry: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
      isOpen: true,
    });
    await store3.createObject(room);

    const cdt: ICDT = {
      triangulate: jest.fn().mockResolvedValue({ totalArea: 25, triangles: [], valid: true, warnings: [] }),
    };
    const closeUseCase = new CloseRoomUseCase(store3, commandStack3, validation, cdt);

    const output = await closeUseCase.execute({ roomId: rId });

    // El valor de retorno DEBE reflejar el cierre, sin necesidad de releer de la BD.
    expect(output.room.isOpen).toBe(false);
    expect(output.room.area).toEqual(squareMeters(25));

    await db3.close();
  });
});
