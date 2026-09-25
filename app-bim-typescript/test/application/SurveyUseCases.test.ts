// =============================================================================
// SurveyUseCases.test.ts — Tests de integración para CreateControlPointUseCase
// y DefineSiteCoordinateSystemUseCase (Spike #7), sobre un IObjectStore mock
// en memoria — mismo estilo que UseCase.integration.test.ts.
// =============================================================================

import { IObjectStore, RevitObjectBase, RevitObjectId, RoomId } from '../../src/domain/objects/base';
import {
  SurveyControlPoint,
  SiteCoordinateSystem,
  siteId,
  operatorId,
} from '../../src/domain/objects/survey';
import { meters, degrees, Point3D } from '../../src/domain/geometry/types';
import { CreateControlPointUseCase, CreateControlPointInput } from '../../src/application/use-cases/CreateControlPointUseCase';
import {
  DefineSiteCoordinateSystemUseCase,
  DefineSiteCoordinateSystemInput,
} from '../../src/application/use-cases/DefineSiteCoordinateSystemUseCase';

// ---------------------------------------------------------------------------
// Mock IObjectStore — agrega los métodos de topografía usados vía cast
// `(store as any)`, replicando el comportamiento real de ObjectStore.ts:
// defineSiteCoordinateSystem() lanza si la Sede ya tiene uno definido.
// ---------------------------------------------------------------------------

class MockObjectStore implements IObjectStore {
  private objects = new Map<string, RevitObjectBase>();
  private controlPoints: SurveyControlPoint[] = [];
  private coordinateSystems = new Map<string, SiteCoordinateSystem>();

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
    this.controlPoints.push(point);
  }

  async defineSiteCoordinateSystem(system: SiteCoordinateSystem): Promise<void> {
    if (this.coordinateSystems.has(system.siteId as string)) {
      throw new Error(
        `SiteCoordinateSystem para la Sede ${system.siteId} ya fue definido — es inmutable y no puede redefinirse`,
      );
    }
    this.coordinateSystems.set(system.siteId as string, system);
  }

  async getSiteCoordinateSystem(site: string): Promise<SiteCoordinateSystem | null> {
    return this.coordinateSystems.get(site) ?? null;
  }

  _controlPoints(): SurveyControlPoint[] {
    return this.controlPoints;
  }
}

const SITE_ID = siteId('site-1');

describe('CreateControlPointUseCase', () => {
  let store: MockObjectStore;
  let useCase: CreateControlPointUseCase;

  beforeEach(() => {
    store = new MockObjectStore();
    useCase = new CreateControlPointUseCase(store);
  });

  it('creates and persists a SurveyControlPoint', async () => {
    const localCoordinates: Point3D = { x: meters(3.2), y: meters(1.1), z: meters(0) };
    const input: CreateControlPointInput = {
      siteId: SITE_ID,
      localCoordinates,
      gpsCoordinates: { latitude: 2.4356, longitude: -75.5234, altitude: meters(1750), accuracy: meters(5) },
      name: 'Esquina NE edificio',
      notes: 'Marca roja en el piso',
    };

    const output = await useCase.execute(input);

    expect(output.point.siteId).toBe(SITE_ID);
    expect(output.point.localCoordinates).toEqual(localCoordinates);
    expect(output.point.name).toBe('Esquina NE edificio');
    expect(store._controlPoints()).toHaveLength(1);
    expect(store._controlPoints()[0].id).toBe(output.point.id);
  });

  it('generates a unique id for each control point', async () => {
    const baseInput: CreateControlPointInput = {
      siteId: SITE_ID,
      localCoordinates: { x: meters(0), y: meters(0), z: meters(0) },
      gpsCoordinates: { latitude: 0, longitude: 0, altitude: meters(0), accuracy: meters(5) },
    };

    const first = await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(first.point.id).not.toBe(second.point.id);
  });

  it('rejects a gpsCoordinates.accuracy that is not > 0 (domain invariant)', async () => {
    const input: CreateControlPointInput = {
      siteId: SITE_ID,
      localCoordinates: { x: meters(0), y: meters(0), z: meters(0) },
      gpsCoordinates: { latitude: 0, longitude: 0, altitude: meters(0), accuracy: meters(0) },
    };

    await expect(useCase.execute(input)).rejects.toThrow(/accuracy/);
  });
});

describe('DefineSiteCoordinateSystemUseCase', () => {
  let store: MockObjectStore;
  let useCase: DefineSiteCoordinateSystemUseCase;

  beforeEach(() => {
    store = new MockObjectStore();
    useCase = new DefineSiteCoordinateSystemUseCase(store);
  });

  it('defines and persists the SiteCoordinateSystem of a Site', async () => {
    const input: DefineSiteCoordinateSystemInput = {
      siteId: SITE_ID,
      origin: { x: meters(0), y: meters(0), z: meters(0) },
      northRotation: degrees(90),
      definedBy: operatorId('operator-1'),
    };

    const output = await useCase.execute(input);

    expect(output.coordinateSystem.siteId).toBe(SITE_ID);
    expect(output.coordinateSystem.northRotation).toBe(degrees(90));
    expect(output.coordinateSystem.definedBy).toBe(operatorId('operator-1'));

    const persisted = await store.getSiteCoordinateSystem(SITE_ID as string);
    expect(persisted).not.toBeNull();
    expect(persisted!.origin).toEqual(input.origin);
  });

  it('rejects redefining the coordinate system of a Site that already has one (immutability invariant)', async () => {
    const input: DefineSiteCoordinateSystemInput = {
      siteId: SITE_ID,
      origin: { x: meters(0), y: meters(0), z: meters(0) },
      northRotation: degrees(90),
      definedBy: operatorId('operator-1'),
    };

    await useCase.execute(input);

    await expect(
      useCase.execute({ ...input, origin: { x: meters(5), y: meters(5), z: meters(0) } }),
    ).rejects.toThrow(/inmutable/);
  });

  it('allows different Sites to each define their own coordinate system', async () => {
    const siteA = siteId('site-a');
    const siteB = siteId('site-b');

    await useCase.execute({
      siteId: siteA,
      origin: { x: meters(0), y: meters(0), z: meters(0) },
      northRotation: degrees(0),
      definedBy: operatorId('operator-1'),
    });

    await expect(
      useCase.execute({
        siteId: siteB,
        origin: { x: meters(10), y: meters(10), z: meters(0) },
        northRotation: degrees(180),
        definedBy: operatorId('operator-1'),
      }),
    ).resolves.toBeDefined();
  });
});
