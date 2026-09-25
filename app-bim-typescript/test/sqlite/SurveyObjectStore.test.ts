// =============================================================================
// SurveyObjectStore.test.ts — Tests de persistencia real (SQLite en memoria)
// para las operaciones de topografía agregadas a ObjectStore en Spike #7:
// sites (SiteCoordinateSystem) y survey_control_points (SurveyControlPoint).
//
// Se prueban contra SQLite real (no un mock) siguiendo la lección de
// BUGS-AND-GAPS.md Bug 1 (ObjectStore no restauraba linkedPhotos en el
// roundtrip a SQLite): un mock nunca habría expuesto ese defecto porque no
// serializa nada — aquí se hace el mismo roundtrip real para
// local_coordinates_json / gps_json / origin_json.
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { SurveyControlPoint, siteId, surveyControlPointId, operatorId, SiteCoordinateSystem } from '../../src/domain/objects/survey';
import { meters, degrees, Point3D } from '../../src/domain/geometry/types';

let db: Database;
let store: ObjectStore;

const SITE_ID = siteId('site-test-001');

beforeEach(async () => {
  db = new Database(':memory:');
  await db.open();
  await db.migrate();
  store = new ObjectStore(db);
});

afterEach(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// survey_control_points
// ---------------------------------------------------------------------------

describe('ObjectStore — SurveyControlPoint (Spike #7)', () => {
  it('createSurveyControlPoint + listSurveyControlPoints roundtrips all fields through SQLite', async () => {
    const localCoordinates: Point3D = { x: meters(3.2), y: meters(1.1), z: meters(0) };
    const point = new SurveyControlPoint({
      id: surveyControlPointId('cp-1'),
      siteId: SITE_ID,
      localCoordinates,
      gpsCoordinates: { latitude: 2.4356, longitude: -75.5234, altitude: meters(1750), accuracy: meters(5) },
      name: 'Esquina NE edificio',
      notes: 'Marca roja en el piso',
    });

    await store.createSurveyControlPoint(point);
    const points = await store.listSurveyControlPoints(SITE_ID);

    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('cp-1');
    expect(points[0].siteId).toBe(SITE_ID);
    expect(points[0].localCoordinates).toEqual(localCoordinates);
    expect(points[0].gpsCoordinates.accuracy).toBe(5);
    expect(points[0].gpsCoordinates.latitude).toBe(2.4356);
    expect(points[0].name).toBe('Esquina NE edificio');
    expect(points[0].notes).toBe('Marca roja en el piso');
  });

  it('listSurveyControlPoints only returns points for the requested Site', async () => {
    const otherSite = siteId('site-other');
    await store.createSurveyControlPoint(
      new SurveyControlPoint({
        id: surveyControlPointId('cp-a'),
        siteId: SITE_ID,
        localCoordinates: { x: meters(0), y: meters(0), z: meters(0) },
        gpsCoordinates: { latitude: 0, longitude: 0, altitude: meters(0), accuracy: meters(5) },
      }),
    );
    await store.createSurveyControlPoint(
      new SurveyControlPoint({
        id: surveyControlPointId('cp-b'),
        siteId: otherSite,
        localCoordinates: { x: meters(1), y: meters(1), z: meters(0) },
        gpsCoordinates: { latitude: 1, longitude: 1, altitude: meters(0), accuracy: meters(5) },
      }),
    );

    const points = await store.listSurveyControlPoints(SITE_ID);
    expect(points.map((p) => p.id)).toEqual(['cp-a']);
  });

  it('deleteSurveyControlPoint soft-deletes — excluded from subsequent listSurveyControlPoints', async () => {
    const point = new SurveyControlPoint({
      id: surveyControlPointId('cp-1'),
      siteId: SITE_ID,
      localCoordinates: { x: meters(0), y: meters(0), z: meters(0) },
      gpsCoordinates: { latitude: 0, longitude: 0, altitude: meters(0), accuracy: meters(5) },
    });
    await store.createSurveyControlPoint(point);

    await store.deleteSurveyControlPoint(point.id);

    const points = await store.listSurveyControlPoints(SITE_ID);
    expect(points).toHaveLength(0);
  });

  it('multiple control points can belong to the same Site', async () => {
    for (const [id, x] of [['cp-1', 0], ['cp-2', 10], ['cp-3', 20]] as const) {
      await store.createSurveyControlPoint(
        new SurveyControlPoint({
          id: surveyControlPointId(id),
          siteId: SITE_ID,
          localCoordinates: { x: meters(x), y: meters(0), z: meters(0) },
          gpsCoordinates: { latitude: 0, longitude: 0, altitude: meters(0), accuracy: meters(5) },
        }),
      );
    }

    const points = await store.listSurveyControlPoints(SITE_ID);
    expect(points).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// sites (SiteCoordinateSystem)
// ---------------------------------------------------------------------------

describe('ObjectStore — SiteCoordinateSystem (Spike #7)', () => {
  function makeSystem(overrides?: Partial<SiteCoordinateSystem>): SiteCoordinateSystem {
    return {
      siteId: SITE_ID,
      origin: { x: meters(0), y: meters(0), z: meters(0) },
      northRotation: degrees(90),
      definedAt: new Date('2026-09-16T12:00:00.000Z'),
      definedBy: operatorId('operator-1'),
      ...overrides,
    };
  }

  it('defineSiteCoordinateSystem + getSiteCoordinateSystem roundtrips all fields through SQLite', async () => {
    const system = makeSystem({ origin: { x: meters(3.5), y: meters(-2.1), z: meters(0.4) } });
    await store.defineSiteCoordinateSystem(system);

    const read = await store.getSiteCoordinateSystem(SITE_ID);

    expect(read).not.toBeNull();
    expect(read!.siteId).toBe(SITE_ID);
    expect(read!.origin).toEqual(system.origin);
    expect(read!.northRotation).toBe(90);
    expect(read!.definedBy).toBe('operator-1');
    expect(read!.definedAt.toISOString()).toBe(system.definedAt.toISOString());
  });

  it('getSiteCoordinateSystem returns null for a Site with none defined', async () => {
    const read = await store.getSiteCoordinateSystem(siteId('never-defined'));
    expect(read).toBeNull();
  });

  it('rejects redefining an existing SiteCoordinateSystem — immutability invariant', async () => {
    await store.defineSiteCoordinateSystem(makeSystem());

    await expect(
      store.defineSiteCoordinateSystem(makeSystem({ northRotation: degrees(180) })),
    ).rejects.toThrow(/inmutable/);

    // La definición original no debe haber cambiado
    const read = await store.getSiteCoordinateSystem(SITE_ID);
    expect(read!.northRotation).toBe(90);
  });

  it('allows independent Sites to each define their own coordinate system', async () => {
    const siteA = siteId('site-a');
    const siteB = siteId('site-b');

    await store.defineSiteCoordinateSystem(makeSystem({ siteId: siteA, northRotation: degrees(0) }));
    await store.defineSiteCoordinateSystem(makeSystem({ siteId: siteB, northRotation: degrees(270) }));

    const readA = await store.getSiteCoordinateSystem(siteA);
    const readB = await store.getSiteCoordinateSystem(siteB);

    expect(readA!.northRotation).toBe(0);
    expect(readB!.northRotation).toBe(270);
  });
});
