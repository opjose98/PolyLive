// =============================================================================
// SimpleCommand.test.ts — Tests unitarios para la variante SimpleCommand
// (Spike #7: CreateControlPointCommand, DefineSiteCoordinateSystemCommand)
// =============================================================================

import { IObjectStore, RevitObjectBase, RevitObjectId, RoomId } from '../../src/domain/objects/base';
import {
  SurveyControlPoint,
  SiteCoordinateSystem,
  siteId,
  surveyControlPointId,
  operatorId,
} from '../../src/domain/objects/survey';
import { meters, degrees, Point3D } from '../../src/domain/geometry/types';
import { CreateControlPointCommand } from '../../src/application/commands/CreateControlPointCommand';
import { DefineSiteCoordinateSystemCommand } from '../../src/application/commands/DefineSiteCoordinateSystemCommand';

// ---------------------------------------------------------------------------
// Mock IObjectStore extendido con los métodos de topografía (mismo patrón
// que MockObjectStore en test/application/UseCase.integration.test.ts, que
// agrega createMeasurement/createAuditPhoto por fuera de IObjectStore).
// ---------------------------------------------------------------------------

class MockSurveyStore implements IObjectStore {
  private objects = new Map<string, RevitObjectBase>();
  private controlPoints = new Map<string, SurveyControlPoint>();

  async createObject(obj: RevitObjectBase): Promise<RevitObjectId> {
    this.objects.set(obj.id as string, obj);
    return obj.id;
  }
  async readObject(id: RevitObjectId): Promise<RevitObjectBase | null> {
    return this.objects.get(id as string) ?? null;
  }
  async updateObject(): Promise<void> {}
  async deleteObject(): Promise<void> {}
  async restoreObject(): Promise<void> {}
  async listObjects(rid: RoomId): Promise<RevitObjectBase[]> {
    return Array.from(this.objects.values()).filter((o) => o.roomId === rid);
  }

  async createSurveyControlPoint(point: SurveyControlPoint): Promise<void> {
    this.controlPoints.set(point.id as string, point);
  }

  async deleteSurveyControlPoint(id: string): Promise<void> {
    const point = this.controlPoints.get(id);
    if (point) point.is_deleted = true;
  }

  _getControlPoint(id: string): SurveyControlPoint | undefined {
    return this.controlPoints.get(id);
  }
}

const SITE_ID = siteId('site-1');

function makeControlPoint(): SurveyControlPoint {
  const localCoordinates: Point3D = { x: meters(1), y: meters(2), z: meters(0) };
  return new SurveyControlPoint({
    id: surveyControlPointId('cp-1'),
    siteId: SITE_ID,
    localCoordinates,
    gpsCoordinates: { latitude: 2.4356, longitude: -75.5234, altitude: meters(1750), accuracy: meters(5) },
    name: 'Esquina NE edificio',
  });
}

function makeCoordinateSystem(): SiteCoordinateSystem {
  return {
    siteId: SITE_ID,
    origin: { x: meters(0), y: meters(0), z: meters(0) },
    northRotation: degrees(90),
    definedAt: new Date('2026-09-16T00:00:00.000Z'),
    definedBy: operatorId('operator-1'),
  };
}

describe('SimpleCommand', () => {
  // =========================================================================
  // CreateControlPointCommand
  // =========================================================================

  describe('CreateControlPointCommand', () => {
    it('execute() is a no-op — point already persisted by the UseCase', async () => {
      const store = new MockSurveyStore();
      const point = makeControlPoint();
      await store.createSurveyControlPoint(point);

      const cmd = new CreateControlPointCommand(point, store);
      await cmd.execute();

      expect(store._getControlPoint('cp-1')!.is_deleted).toBe(false);
    });

    it('undo() soft-deletes the control point', async () => {
      const store = new MockSurveyStore();
      const point = makeControlPoint();
      await store.createSurveyControlPoint(point);

      const cmd = new CreateControlPointCommand(point, store);
      await cmd.undo();

      expect(store._getControlPoint('cp-1')!.is_deleted).toBe(true);
    });

    it('canUndo() is true — unlike DefineSiteCoordinateSystemCommand', () => {
      const store = new MockSurveyStore();
      const cmd = new CreateControlPointCommand(makeControlPoint(), store);
      expect(cmd.canUndo()).toBe(true);
    });

    it('describe() returns a human-readable label', () => {
      const store = new MockSurveyStore();
      const cmd = new CreateControlPointCommand(makeControlPoint(), store);
      expect(cmd.describe()).toBe('Crear punto de control');
    });
  });

  // =========================================================================
  // DefineSiteCoordinateSystemCommand
  // =========================================================================

  describe('DefineSiteCoordinateSystemCommand', () => {
    it('execute() is a no-op — system already persisted by the UseCase', async () => {
      const cmd = new DefineSiteCoordinateSystemCommand(makeCoordinateSystem());
      await expect(cmd.execute()).resolves.toBeUndefined();
    });

    it('canUndo() is false — SiteCoordinateSystem is immutable once defined', () => {
      const cmd = new DefineSiteCoordinateSystemCommand(makeCoordinateSystem());
      expect(cmd.canUndo()).toBe(false);
    });

    it('undo() throws instead of silently pretending to revert', async () => {
      const cmd = new DefineSiteCoordinateSystemCommand(makeCoordinateSystem());
      await expect(cmd.undo()).rejects.toThrow(/no es reversible/);
    });

    it('describe() returns a human-readable label', () => {
      const cmd = new DefineSiteCoordinateSystemCommand(makeCoordinateSystem());
      expect(cmd.describe()).toBe('Definir sistema de coordenadas de Sede');
    });
  });
});
