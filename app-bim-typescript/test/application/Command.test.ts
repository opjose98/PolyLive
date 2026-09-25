// =============================================================================
// Command.test.ts — Tests unitarios para comandos individuales
// =============================================================================

import {
  Wall,
  Column,
  Door,
  RevitObjectId,
  RoomId,
  WallId,
  AuditPhotoId,
  IObjectStore,
  RevitObjectBase,
  revitObjectId,
  roomId,
  wallId,
  auditPhotoId,
  generateId,
} from '../../src/domain/objects';
import { meters, Point2D } from '../../src/domain/geometry/types';
import { CreateWallCommand } from '../../src/application/commands/CreateWallCommand';
import { MoveObjectCommand, MoveSnapshot } from '../../src/application/commands/MoveObjectCommand';
import { UpdateObjectPropertyCommand } from '../../src/application/commands/UpdateObjectPropertyCommand';
import { DeleteObjectCommand } from '../../src/application/commands/DeleteObjectCommand';
import { CloseRoomCommand } from '../../src/application/commands/CloseRoomCommand';

// ---------------------------------------------------------------------------
// Mock IObjectStore — in-memory
// ---------------------------------------------------------------------------

class MockObjectStore implements IObjectStore {
  private objects = new Map<string, RevitObjectBase>();

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

  /** Helper para leer directamente en test. */
  _get(id: string): RevitObjectBase | undefined {
    return this.objects.get(id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOM_ID = roomId('room-1');
const WALL_ID = revitObjectId('wall-1');

function makeWall(overrides?: Partial<{ id: RevitObjectId; startPoint: Point2D; endPoint: Point2D }>): Wall {
  return new Wall({
    id: overrides?.id ?? WALL_ID,
    roomId: ROOM_ID,
    startPoint: overrides?.startPoint ?? { x: 0, y: 0 },
    endPoint: overrides?.endPoint ?? { x: 5, y: 0 },
    thickness: meters(0.15),
    height: meters(2.8),
    material: 'concreto',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Commands', () => {
  let store: MockObjectStore;

  beforeEach(() => {
    store = new MockObjectStore();
  });

  // =========================================================================
  // 1. CreateWallCommand — execute es no-op, undo soft-delete
  // =========================================================================

  describe('CreateWallCommand', () => {
    it('execute is no-op — wall already persisted by UseCase', async () => {
      const wall = makeWall();
      await store.createObject(wall);

      const cmd = new CreateWallCommand(wall);
      await cmd.execute(store);

      // Wall sigue existiendo sin cambios
      const read = await store.readObject(WALL_ID);
      expect(read).not.toBeNull();
      expect(read!.is_deleted).toBe(false);
    });

    it('undo soft-deletes the wall', async () => {
      const wall = makeWall();
      await store.createObject(wall);

      const cmd = new CreateWallCommand(wall);
      await cmd.execute(store);
      await cmd.undo(store);

      const read = store._get(WALL_ID as string);
      expect(read!.is_deleted).toBe(true);
    });
  });

  // =========================================================================
  // 2. MoveObjectCommand — undo restaura posición anterior
  // =========================================================================

  describe('MoveObjectCommand', () => {
    it('undo restores Wall to its original position', async () => {
      const wall = makeWall({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
      });
      await store.createObject(wall);

      // Simular que el UseCase ya movió el muro
      const newStart = { x: 2, y: 2 };
      const newEnd = { x: 7, y: 2 };
      await store.updateObject(WALL_ID, {
        startPoint: newStart,
        endPoint: newEnd,
      } as any);

      const snapshot: MoveSnapshot = {
        oldStartPoint: { x: 0, y: 0 },
        oldEndPoint: { x: 5, y: 0 },
        newStartPoint: newStart,
        newEndPoint: newEnd,
      };

      const cmd = new MoveObjectCommand(WALL_ID, snapshot);
      await cmd.undo(store);

      const read = store._get(WALL_ID as string) as Wall;
      expect(read.startPoint).toEqual({ x: 0, y: 0 });
      expect(read.endPoint).toEqual({ x: 5, y: 0 });
    });

    it('undo restores Column to its original position', async () => {
      const colId = revitObjectId('col-1');
      const column = new Column({
        id: colId,
        roomId: ROOM_ID,
        position: { x: 3, y: 3 },
        diameter: meters(0.3),
        height: meters(2.8),
      });
      await store.createObject(column);

      // Simular movimiento
      await store.updateObject(colId, { position: { x: 5, y: 5 } } as any);

      const snapshot: MoveSnapshot = {
        oldPosition: { x: 3, y: 3 },
        newPosition: { x: 5, y: 5 },
      };

      const cmd = new MoveObjectCommand(colId, snapshot);
      await cmd.undo(store);

      const read = store._get(colId as string) as Column;
      expect(read.position).toEqual({ x: 3, y: 3 });
    });
  });

  // =========================================================================
  // 3. UpdateObjectPropertyCommand — undo restaura valor anterior
  // =========================================================================

  describe('UpdateObjectPropertyCommand', () => {
    it('undo restores wall thickness to oldValue', async () => {
      const wall = makeWall();
      await store.createObject(wall);

      const oldThickness = meters(0.15);
      const newThickness = meters(0.25);

      // Simular que el UseCase ya aplicó el cambio
      await store.updateObject(WALL_ID, { thickness: newThickness } as any);

      const cmd = new UpdateObjectPropertyCommand(WALL_ID, 'thickness', oldThickness, newThickness);
      await cmd.undo(store);

      const read = store._get(WALL_ID as string) as Wall;
      expect(read.thickness).toBe(oldThickness);
    });
  });

  // =========================================================================
  // 4. DeleteObjectCommand — undo restaura objetos borrados (cascada)
  // =========================================================================

  describe('DeleteObjectCommand', () => {
    it('undo restores main object and cascaded dependents', async () => {
      const wall = makeWall();
      await store.createObject(wall);

      const doorId = revitObjectId('door-1');
      const door = new Door({
        id: doorId,
        roomId: ROOM_ID,
        parentWallId: wallId('wall-1'),
        offsetAlongWall: meters(1),
        offsetPerpendicular: meters(0),
        width: meters(0.9),
        height: meters(2.1),
      });
      await store.createObject(door);

      // Simular soft-delete cascada (vano primero, luego wall)
      await store.deleteObject(doorId);
      await store.deleteObject(WALL_ID);

      const deletedIds = [doorId, WALL_ID];
      const cmd = new DeleteObjectCommand(WALL_ID, deletedIds);

      // Verificar que están borrados
      expect(store._get(WALL_ID as string)!.is_deleted).toBe(true);
      expect(store._get(doorId as string)!.is_deleted).toBe(true);

      // Undo
      await cmd.undo(store);

      // Ambos restaurados (undo invierte el orden)
      expect(store._get(WALL_ID as string)!.is_deleted).toBe(false);
      expect(store._get(doorId as string)!.is_deleted).toBe(false);
    });
  });

  // =========================================================================
  // 5. CloseRoomCommand — undo reabre y borra Floor implícito
  // =========================================================================

  describe('CloseRoomCommand', () => {
    it('undo reopens room and soft-deletes implicit floor', async () => {
      const { Room, Floor } = require('../../src/domain/objects');
      const { levelId: mkLevelId } = require('../../src/domain/objects');

      const rid = revitObjectId('room-cmd-1');
      const room = new Room({
        id: rid,
        roomId: ROOM_ID,
        levelId: mkLevelId('level-1'),
        geometry: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
        isOpen: false,
        area: 25,
      });
      await store.createObject(room);

      const floorId = revitObjectId('floor-1');
      const floor = new Floor({
        id: floorId,
        roomId: ROOM_ID,
        isImplicit: true,
      });
      await store.createObject(floor);

      const cmd = new CloseRoomCommand(rid, floorId);
      await cmd.undo(store);

      const roomRead = store._get(rid as string) as any;
      expect(roomRead.isOpen).toBe(true);
      expect(roomRead.area).toBeNull();

      const floorRead = store._get(floorId as string);
      expect(floorRead!.is_deleted).toBe(true);
    });
  });
});
