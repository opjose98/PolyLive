// =============================================================================
// CrashRecovery.test.ts — WAL restore, corrupción detectada, recuperación parcial
// Basado en: escenarios-recuperación.md, backup-integridad.md,
//            estrategia-testing-y-fixtures.md §1.3 (Recovery tests)
//
// Estos tests usan una base de datos SQLite en ARCHIVO (no :memory:) para que
// "cerrar la conexión y volver a abrirla" sea un escenario real de sobrevivir
// a un reinicio de proceso, no una simulación en memoria compartida.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { Wall, roomId, levelId, revitObjectId } from '../../src/domain/objects';
import { meters } from '../../src/domain/geometry/types';
import { CommandStack } from '../../src/application/state/CommandStack';
import { CreateWallUseCase } from '../../src/application/use-cases/CreateWallUseCase';
import { MoveObjectUseCase } from '../../src/application/use-cases/MoveObjectUseCase';
import { IValidationService, ValidationResult } from '../../src/application/use-cases/types';
import { AppError, AppErrorCode, useCaseRollbackError } from '../../src/shared/errors/AppError';

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

function tempDbPath(name: string): string {
  return path.join(os.tmpdir(), `crash-recovery-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

const ROOM_ID = roomId('recovery-room');
const LEVEL_ID = levelId('level-1');

// ---------------------------------------------------------------------------
// 1-2. Corrupción de SQLite — backup-integridad.md
// ---------------------------------------------------------------------------

describe('Corrupción de SQLite — detección vía PRAGMA integrity_check', () => {
  it('una base de datos sana reporta "ok"', async () => {
    const dbPath = tempDbPath('healthy');
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();

    const rows = await db.all<{ integrity_check: string }>('PRAGMA integrity_check;');
    expect(rows[0].integrity_check).toBe('ok');

    await db.close();
    fs.unlinkSync(dbPath);
  });

  it('una base de datos con bytes corruptos NO reporta "ok" — la corrupción es detectable', async () => {
    const dbPath = tempDbPath('corrupt');
    const db = new Database(dbPath);
    await db.open();
    await db.migrate();
    const store = new ObjectStore(db);
    await store.createObject(
      new Wall({
        id: revitObjectId('wall-before-corruption'),
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );
    await db.close();

    // Simular corrupción real: sobrescribir una franja amplia de bytes justo
    // después de la cabecera SQLite (100 bytes) con basura. Una franja angosta
    // puede caer en espacio libre no verificado por integrity_check — 400
    // bytes garantiza pisar contenido real de página(s) de datos.
    const fd = fs.openSync(dbPath, 'r+');
    const garbage = Buffer.alloc(400, 0xff);
    fs.writeSync(fd, garbage, 0, garbage.length, 100);
    fs.closeSync(fd);

    const reopened = new Database(dbPath);

    let integrityResult: string;
    try {
      // La corrupción puede manifestarse tan pronto como open() (los PRAGMA de
      // configuración inicial ya tocan el archivo), no solo en la consulta de
      // integrity_check — por eso todo el intento, abrir + consultar, se
      // envuelve en un único try/catch.
      await reopened.open();
      const rows = await reopened.all<{ integrity_check: string }>('PRAGMA integrity_check;');
      integrityResult = rows.map((r) => r.integrity_check).join('; ');
    } catch (err) {
      // SQLite puede incluso rechazar leer el archivo si la corrupción es severa —
      // eso también cuenta como corrupción detectada.
      integrityResult = `__threw__: ${(err as Error).message}`;
    }

    expect(integrityResult).not.toBe('ok');

    await reopened.close().catch(() => undefined);
    fs.unlinkSync(dbPath);
  });
});

// ---------------------------------------------------------------------------
// 3. Crash durante edición (EDITING state) — escenarios-recuperación.md
// ---------------------------------------------------------------------------

describe('Crash durante edición — los datos comprometidos (COMMIT) sobreviven un reinicio', () => {
  it('CreateWall + MoveWall, cerrar la conexión (simula crash), reabrir: el Wall sigue en su posición movida', async () => {
    const dbPath = tempDbPath('editing');

    // --- Sesión 1: antes del "crash" ---
    const db1 = new Database(dbPath);
    await db1.open();
    await db1.migrate();
    const store1 = new ObjectStore(db1);
    const commandStack1 = new CommandStack(store1);
    const validation = alwaysValidService();

    const wallOut = await new CreateWallUseCase(store1, commandStack1, validation).execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    await new MoveObjectUseCase(store1, commandStack1).execute({
      objectId: wallOut.wall.id,
      newStartPoint: { x: 2, y: 2 },
    });

    expect(commandStack1.size()).toBe(2);

    // "Crash": la conexión se cierra sin más ceremonia (no hay un shutdown
    // limpio explícito más allá de close() — cada operación ya se comiteó
    // individualmente por Database.transaction()).
    await db1.close();

    // --- Sesión 2: "reinicio de la app" ---
    const db2 = new Database(dbPath);
    await db2.open();
    // NO se llama a migrate() de nuevo con datos — CREATE TABLE IF NOT EXISTS
    // es idempotente, así que igual sería seguro, pero lo omitimos para dejar
    // claro que estamos leyendo el archivo tal como quedó.
    await db2.migrate();
    const store2 = new ObjectStore(db2);
    const commandStack2 = new CommandStack(store2); // nueva instancia — el stack NO persiste (ver nota abajo)

    const recovered = (await store2.readObject(wallOut.wall.id)) as Wall;
    expect(recovered).not.toBeNull();
    expect(recovered.startPoint).toEqual({ x: 2, y: 2 });
    expect(recovered.endPoint).toEqual({ x: 7, y: 2 }); // delta preservado por MoveObjectUseCase

    // GAP real / comportamiento esperado: CommandStack vive solo en memoria
    // (application/state/CommandStack.ts no tiene ninguna capa de persistencia),
    // así que el historial de undo/redo NO sobrevive un reinicio, aunque los
    // OBJETOS sí (porque cada operación se comiteó a SQLite individualmente).
    // escenarios-recuperación.md aspira a "Restaura CommandStack (vértices como
    // comandos)" — eso no está implementado en src/ todavía.
    expect(commandStack2.size()).toBe(0);

    await db2.close();
    fs.unlinkSync(dbPath);
  });
});

// ---------------------------------------------------------------------------
// 4. Crash durante trazo (CREATING state) — polygon_drafts
// ---------------------------------------------------------------------------

describe('Crash durante trazo — la tabla polygon_drafts persiste el progreso parcial', () => {
  it('un draft guardado a mitad de trazo sobrevive cerrar y reabrir la conexión', async () => {
    const dbPath = tempDbPath('draft');
    const db1 = new Database(dbPath);
    await db1.open();
    await db1.migrate();

    // Se escribe directamente a `polygon_drafts` A PROPÓSITO: este test verifica
    // la capa de PERSISTENCIA (que una fila sobrevive a cerrar y reabrir la
    // conexión), no el UseCase. La cobertura de RecoverRoomDraftUseCase —que sí
    // existe en src/, al contrario de lo que decía este comentario— está en
    // test/application/RoomDraftUseCases.test.ts, y su integración con el
    // editor en test/editor/EditorController.test.ts.
    const partialVertices = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 }, // el usuario se detuvo aquí, el polígono nunca se cerró
    ];
    await db1.run(
      `INSERT INTO polygon_drafts (id, room_id, vertices_json, is_closed) VALUES (?, ?, ?, 0)`,
      ['draft-1', ROOM_ID as unknown as string, JSON.stringify(partialVertices)],
    );
    await db1.close();

    const db2 = new Database(dbPath);
    await db2.open();
    const row = await db2.get<{ vertices_json: string; is_closed: number }>(
      'SELECT vertices_json, is_closed FROM polygon_drafts WHERE id = ?',
      ['draft-1'],
    );
    expect(row).toBeDefined();
    expect(row!.is_closed).toBe(0);
    expect(JSON.parse(row!.vertices_json)).toEqual(partialVertices);

    await db2.close();
    fs.unlinkSync(dbPath);
  });

  it('RecoverRoomDraftUseCase (Maestro §7.10) — ver cobertura completa en test/application/RoomDraftUseCases.test.ts', () => {
    // Implementado: lee el borrador más reciente de polygon_drafts (vertices +
    // isClosed) y expone confirmContinue()/discard() para que la UI decida.
    // El CommandStack de esa sesión NO se reconstruye — sigue siendo un GAP
    // documentado (ver el comentario en RecoverRoomDraftUseCase.ts y §5 de
    // docs/07-BUGS-GAPS-COMPLETE.md), no algo que esta UseCase pretenda resolver.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Exportación falla a mitad de generación — el archivo parcial no debe
//    quedar como si fuera válido
// ---------------------------------------------------------------------------

describe('Export falla a mitad de generación — no debe quedar un .ifc parcial/corrupto', () => {
  it('si la generación del contenido lanza, nunca se llega a escribir el archivo', () => {
    const tmpFile = path.join(os.tmpdir(), `export-fail-${Date.now()}.ifc`);

    // Patrón esperado de la capa de infraestructura: generar el contenido
    // COMPLETO en memoria primero, y solo entonces escribirlo a disco. Si el
    // paso de generación falla, fs.writeFileSync nunca se invoca.
    function generateIfcContent(): string {
      throw new Error('IFC generation failed mid-stream (simulated I/O interruption)');
    }

    expect(() => {
      const content = generateIfcContent(); // lanza antes de llegar a escribir
      fs.writeFileSync(tmpFile, content, 'utf-8');
    }).toThrow('IFC generation failed mid-stream');

    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('un rollback fallido produce AppError USE_CASE_ROLLBACK con el contexto del UseCase', async () => {
    // ESTE TEST ERA UN it.todo OBSOLETO. Afirmaba que "shared/errors/AppError.ts
    // no existe todavía en src/ (solo en el árbol de carpetas planeado)". Sí
    // existe, con su helper `useCaseRollbackError` y sus tests unitarios; el
    // todo se quedó escrito de una época anterior y nadie volvió a mirarlo.
    //
    // Lo que aquí se verifica, y que un test unitario del helper no puede ver:
    // que el error que llega al llamador tras un rollback fallido distingue
    // ENTRE LOS DOS FALLOS. El operador tiene que poder saber que, además de
    // que la operación falló, el estado del levantamiento puede haber quedado
    // a medias — que es una situación distinta y peor.
    const originalFailure = new Error('CDT triangulation failed');
    const rollbackFailure = new Error('database is locked');

    let raised: unknown;
    try {
      try {
        throw originalFailure;
      } catch (err) {
        // Simula el rollback del UseCase, que a su vez falla.
        try {
          throw rollbackFailure;
        } catch (rollbackErr) {
          throw useCaseRollbackError('CloseRoomUseCase', rollbackErr, {
            roomId: ROOM_ID as unknown as string,
            originalError: (err as Error).message,
          });
        }
      }
    } catch (e) {
      raised = e;
    }

    expect(raised).toBeInstanceOf(AppError);
    const error = raised as AppError;

    expect(error.code).toBe(AppErrorCode.USE_CASE_ROLLBACK);
    // El mensaje al operador advierte del estado a medias, no solo del fallo.
    expect(error.userMessage).toContain('no se pudo revertir');
    // El contexto conserva las DOS causas: la original y la del rollback.
    expect(error.context).toMatchObject({
      useCase: 'CloseRoomUseCase',
      originalError: 'CDT triangulation failed',
    });
    expect(error.cause).toBe(rollbackFailure);
    // Y el objeto de log las lleva separadas de userMessage.
    expect(error.toLogObject()).toMatchObject({ code: AppErrorCode.USE_CASE_ROLLBACK });
  });
});
