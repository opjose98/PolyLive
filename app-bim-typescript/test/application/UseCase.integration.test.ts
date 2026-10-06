// =============================================================================
// UseCase.integration.test.ts — Tests de integración para UseCases
// =============================================================================

import {
  Wall,
  
  Door,
  
  Room,
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  WallId,
  
  
  
  IObjectStore,
  Measurement,
  AuditPhoto,
  revitObjectId,
  roomId,
  wallId,
  levelId,
  
  } from '../../src/domain/objects';

import { meters, squareMeters } from '../../src/domain/geometry/types';
import { CommandStack } from '../../src/application/state/CommandStack';
import { IValidationService, IIFCSerializer, ValidationResult } from '../../src/application/use-cases/types';
import { CreateWallUseCase, CreateWallInput } from '../../src/application/use-cases/CreateWallUseCase';
import { CreateDoorUseCase, CreateDoorInput } from '../../src/application/use-cases/CreateDoorUseCase';
import { MoveObjectUseCase, MoveObjectInput } from '../../src/application/use-cases/MoveObjectUseCase';
import { DeleteObjectUseCase } from '../../src/application/use-cases/DeleteObjectUseCase';
import { UpdateObjectPropertyUseCase } from '../../src/application/use-cases/UpdateObjectPropertyUseCase';
import { ExportRoomIfcUseCase } from '../../src/application/use-cases/ExportRoomIfcUseCase';

// ---------------------------------------------------------------------------
// Mock IObjectStore — in-memory con createMeasurement/createAuditPhoto
// ---------------------------------------------------------------------------

class MockObjectStore implements IObjectStore {
  private objects = new Map<string, RevitObjectBase>();
  private measurements = new Map<string, Measurement>();
  private photos = new Map<string, AuditPhoto>();

  async createObject(obj: RevitObjectBase): Promise<RevitObjectId> {
    this.objects.set(obj.id as string, obj);
    return obj.id;
  }

  async readObject(id: RevitObjectId): Promise<RevitObjectBase | null> {
    return this.objects.get(id as string) ?? null;
  }

  async updateObject(id: RevitObjectId, updates: Partial<RevitObjectBase>): Promise<void> {
    const obj = this.objects.get(id as string);
    if (!obj) throw new Error(`Object ${id} not found`);
    Object.assign(obj, updates);
  }

  async deleteObject(id: RevitObjectId): Promise<void> {
    const obj = this.objects.get(id as string);
    if (obj) obj.is_deleted = true;
  }

  async restoreObject(id: RevitObjectId): Promise<void> {
    const obj = this.objects.get(id as string);
    if (obj) obj.is_deleted = false;
  }

  async listObjects(rid: RoomId): Promise<RevitObjectBase[]> {
    return Array.from(this.objects.values()).filter(
      (o) => o.roomId === (rid as unknown as RoomId) && !o.is_deleted,
    );
  }

  async createMeasurement(m: Measurement): Promise<void> {
    this.measurements.set(m.id as string, m);
  }

  async createAuditPhoto(photo: AuditPhoto): Promise<void> {
    this.photos.set(photo.id as string, photo);
  }

  /** Helper para acceso directo en tests. */
  _get(id: string): RevitObjectBase | undefined {
    return this.objects.get(id);
  }
}

// ---------------------------------------------------------------------------
// Mock IValidationService — siempre válido por defecto
// ---------------------------------------------------------------------------

function createMockValidationService(overrides?: Partial<IValidationService>): IValidationService {
  const alwaysValid: ValidationResult = { valid: true, warnings: [] };
  return {
    validateWall: jest.fn().mockReturnValue(alwaysValid),
    validateColumn: jest.fn().mockReturnValue(alwaysValid),
    validateDoor: jest.fn().mockReturnValue(alwaysValid),
    validateWindow: jest.fn().mockReturnValue(alwaysValid),
    validateRoom: jest.fn().mockReturnValue(alwaysValid),
    validateExport: jest.fn().mockReturnValue(alwaysValid),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock IIFCSerializer
// ---------------------------------------------------------------------------

function createMockIFCSerializer(): IIFCSerializer {
  return {
    serialize: jest.fn().mockResolvedValue('ISO-10303-21;\nHEADER;\n...;\nEND-ISO-10303-21;'),
  };
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROOM_ID = roomId('room-test');
const LEVEL_ID = levelId('level-1');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UseCases — Integration', () => {
  let store: MockObjectStore;
  let commandStack: CommandStack;
  let validationService: IValidationService;

  beforeEach(() => {
    store = new MockObjectStore();
    commandStack = new CommandStack(store);
    validationService = createMockValidationService();
  });

  // =========================================================================
  // 1. CreateWallUseCase — crea muro, persiste, emite comando
  // =========================================================================

  describe('CreateWallUseCase', () => {
    it('creates wall, persists it, and emits command', async () => {
      const useCase = new CreateWallUseCase(store, commandStack, validationService);

      const input: CreateWallInput = {
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
        material: 'concreto',
      };

      const output = await useCase.execute(input);

      expect(output.wall).toBeInstanceOf(Wall);
      expect(output.wall.startPoint).toEqual({ x: 0, y: 0 });
      expect(output.wall.endPoint).toEqual({ x: 5, y: 0 });
      expect(output.commandId).toBeDefined();
      expect(commandStack.size()).toBe(1);

      // Verificar persistencia
      const read = await store.readObject(output.wall.id);
      expect(read).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. CreateDoorUseCase — valida que Wall padre existe
  // =========================================================================

  describe('CreateDoorUseCase', () => {
    it('throws if parent wall does not exist', async () => {
      const useCase = new CreateDoorUseCase(store, commandStack, validationService);

      const input: CreateDoorInput = {
        roomId: ROOM_ID,
        parentWallId: wallId('non-existent-wall'),
        offsetAlongWall: meters(1),
        offsetPerpendicular: meters(0),
        width: meters(0.9),
        height: meters(2.1),
      };

      await expect(useCase.execute(input)).rejects.toThrow('Wall padre no existe');
    });

    it('creates door when parent wall exists', async () => {
      // Crear wall primero
      const createWall = new CreateWallUseCase(store, commandStack, validationService);
      const wallOut = await createWall.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      });

      const useCase = new CreateDoorUseCase(store, commandStack, validationService);
      const doorInput: CreateDoorInput = {
        roomId: ROOM_ID,
        parentWallId: wallOut.wall.id as unknown as WallId,
        offsetAlongWall: meters(1),
        offsetPerpendicular: meters(0),
        width: meters(0.9),
        height: meters(2.1),
      };

      const doorOut = await useCase.execute(doorInput);

      expect(doorOut.door).toBeInstanceOf(Door);
      expect(doorOut.door.parentWallId).toBe(wallOut.wall.id as unknown as WallId);
      expect(commandStack.size()).toBe(2); // wall + door
    });
  });

  // =========================================================================
  // 3. MoveObjectUseCase — calcula delta, mueve Wall
  // =========================================================================

  describe('MoveObjectUseCase', () => {
    it('moves wall and calculates delta for endPoint', async () => {
      // Crear wall
      const createWall = new CreateWallUseCase(store, commandStack, validationService);
      const wallOut = await createWall.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      });

      const moveUseCase = new MoveObjectUseCase(store, commandStack);
      const moveInput: MoveObjectInput = {
        objectId: wallOut.wall.id,
        newStartPoint: { x: 2, y: 2 },
        // No se pasa newEndPoint — se calcula por delta
      };

      const _moveOut = await moveUseCase.execute(moveInput);

      // endPoint debería haberse movido delta = (2,2)
      const movedWall = await store.readObject(wallOut.wall.id) as Wall;
      expect(movedWall.startPoint).toEqual({ x: 2, y: 2 });
      expect(movedWall.endPoint).toEqual({ x: 7, y: 2 });
      expect(commandStack.size()).toBe(2); // wall create + move
    });
  });

  // =========================================================================
  // 4. DeleteObjectUseCase — soft-delete + cascada
  // =========================================================================

  describe('DeleteObjectUseCase', () => {
    it('soft-deletes wall and cascades to child door', async () => {
      // Crear wall
      const createWall = new CreateWallUseCase(store, commandStack, validationService);
      const wallOut = await createWall.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      });

      // Crear door
      const createDoor = new CreateDoorUseCase(store, commandStack, validationService);
      const doorOut = await createDoor.execute({
        roomId: ROOM_ID,
        parentWallId: wallOut.wall.id as unknown as WallId,
        offsetAlongWall: meters(1),
        offsetPerpendicular: meters(0),
        width: meters(0.9),
        height: meters(2.1),
      });

      // Borrar wall con cascade
      const deleteUseCase = new DeleteObjectUseCase(store, commandStack);
      const delOut = await deleteUseCase.execute({
        objectId: wallOut.wall.id,
        cascade: true,
      });

      expect(delOut.deletedCount).toBe(2); // door + wall
      expect(store._get(wallOut.wall.id as string)!.is_deleted).toBe(true);
      expect(store._get(doorOut.door.id as string)!.is_deleted).toBe(true);
    });

    it('throws if object does not exist', async () => {
      const deleteUseCase = new DeleteObjectUseCase(store, commandStack);
      await expect(
        deleteUseCase.execute({ objectId: revitObjectId('non-existent') }),
      ).rejects.toThrow('Objeto no existe');
    });
  });

  // =========================================================================

  // =========================================================================


  // =========================================================================
  // 6. UpdateObjectPropertyUseCase — actualiza y guarda oldValue
  // =========================================================================

  describe('UpdateObjectPropertyUseCase', () => {
    it('updates property and stores oldValue for undo', async () => {
      // Crear wall
      const createWall = new CreateWallUseCase(store, commandStack, validationService);
      const wallOut = await createWall.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
        material: 'concreto',
      });

      const updateUseCase = new UpdateObjectPropertyUseCase(store, commandStack, validationService);
      const _updateOut = await updateUseCase.execute({
        objectId: wallOut.wall.id,
        property: 'material',
        newValue: 'ladrillo',
      });

      const updated = await store.readObject(wallOut.wall.id) as Wall;
      expect(updated.material).toBe('ladrillo');
      expect(commandStack.size()).toBe(2); // create + update
    });
  });

  // =========================================================================
  // 7. ExportRoomIfcUseCase — exporta, no emite comando
  // =========================================================================

  describe('ExportRoomIfcUseCase', () => {
    it('exports IFC content and does NOT emit command', async () => {
      // Pre-crear Room — invariante: id === roomId
      const rid = ROOM_ID as unknown as RevitObjectId;
      const room = new Room({
        id: rid,
        roomId: ROOM_ID,
        levelId: LEVEL_ID,
        geometry: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 5, y: 5 },
          { x: 0, y: 5 },
        ],
        isOpen: false,
        area: squareMeters(25),
      });
      await store.createObject(room);

      const ifcSerializer = createMockIFCSerializer();
      const exportUseCase = new ExportRoomIfcUseCase(store, validationService, ifcSerializer);

      const output = await exportUseCase.execute({ roomId: ROOM_ID });

      expect(output.ifcContent).toContain('ISO-10303-21');
      expect(output.exportTime).toBeGreaterThanOrEqual(0);

      // NO command emitido — export no es reversible
      expect(commandStack.size()).toBe(0);
    });
  });

  // =========================================================================
  // 8. Transacción: validación falla → no persiste ni emite comando
  // =========================================================================

  describe('Transactional atomicity', () => {
    it('validation failure prevents persistence and command emission', async () => {
      const failingValidation = createMockValidationService({
        validateWall: jest.fn().mockReturnValue({
          valid: false,
          warnings: [{ type: 'degenerate_triangle' as const, message: 'Wall degenerado' }],
        }),
      });

      const useCase = new CreateWallUseCase(store, commandStack, failingValidation);

      await expect(
        useCase.execute({
          roomId: ROOM_ID,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 0, y: 0 },
          thickness: meters(0.15),
          height: meters(2.8),
        }),
      ).rejects.toThrow('Validation failed');

      // Nada persistido, ningún comando
      const objects = await store.listObjects(ROOM_ID);
      expect(objects.length).toBe(0);
      expect(commandStack.size()).toBe(0);
    });
  });

  // =========================================================================
  // 9. Undo completo: crear wall → undo → wall borrado
  // =========================================================================

  describe('Full undo cycle', () => {
    it('create wall → undo → wall is soft-deleted', async () => {
      const useCase = new CreateWallUseCase(store, commandStack, validationService);
      const output = await useCase.execute({
        roomId: ROOM_ID,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      });

      // Undo
      await commandStack.undo();

      const read = store._get(output.wall.id as string);
      expect(read!.is_deleted).toBe(true);
      expect(commandStack.size()).toBe(0);
    });
  });
});
