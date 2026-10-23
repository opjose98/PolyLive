// =============================================================================
// projectPackage.test.ts — El proyecto sale del teléfono y vuelve entero
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { Wall, revitObjectId } from '../../src/domain/objects';
import { AuditPhoto } from '../../src/domain/objects/audit-photo';
import { auditPhotoId, RoomId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';
import {
  PackageError,
  importProjectPackage,
  packageFilename,
  readProjectPackage,
  unzipPackage,
  zipPackage,
} from '../../src/infrastructure/package/projectPackage';
import { zipSync, strToU8 } from 'fflate';

async function openDb(): Promise<{ db: Database; services: AppServices; file: string }> {
  const file = path.join(os.tmpdir(), `pkg-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  await db.open();
  await db.migrate();
  return { db, services: createAppServices(db), file };
}

describe('Paquete de proyecto .polylive', () => {
  const opened: { db: Database; file: string }[] = [];
  afterEach(async () => {
    for (const o of opened.splice(0)) {
      await o.db.close().catch(() => undefined);
      fs.rmSync(o.file, { force: true });
    }
  });

  async function seed() {
    const a = await openDb();
    opened.push(a);
    const project = await a.services.projects.createProject({ name: 'Edificio Ñuñoa' });
    const { room } = await a.services.projects.createSpace({ projectId: project.id, name: 'Planta 1' });
    const R = room.roomId as RoomId;
    await a.services.store.createObject(
      new Wall({ id: revitObjectId('w1'), roomId: R, startPoint: { x: 0, y: 0 }, endPoint: { x: 4, y: 0 }, thickness: meters(0.15), height: meters(2.5) }),
    );
    await a.services.store.createAuditPhoto(new AuditPhoto({ id: auditPhotoId('f1'), roomId: R, foto: new Uint8Array([255, 216, 1, 2, 3]), metadata_json: '{"filename":"f1.jpg","bimCode":"FOT001"}' }));
    await a.services.drafts.add({ id: 'd1', spaceId: R as string, view: { kind: 'plan' }, levelId: '', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: '', props: {}, createdAt: '2026-10-06' });
    return { a, project, R };
  }

  it('exporta, comprime, descomprime e importa en otro teléfono sin perder nada', async () => {
    const { a, project, R } = await seed();
    const pkg = await readProjectPackage(a.db, project.id as string, 'Jose');
    expect(pkg.manifest.project.name).toBe('Edificio Ñuñoa');
    expect(pkg.manifest.photos).toBe(1);
    expect(pkg.manifest.counts.revit_objects).toBeGreaterThanOrEqual(2); // el Room del espacio + el muro
    const zip = zipPackage(pkg);
    const back = unzipPackage(zip);
    expect(back.manifest).toEqual(pkg.manifest);

    const b = await openDb();
    opened.push(b);
    const r = await importProjectPackage(b.db, back);
    expect(r.replaced).toBe(false);
    expect(r.photos).toBe(1);
    const projects = await b.services.projects.listProjects();
    expect(projects.map((p) => p.name)).toEqual(['Edificio Ñuñoa']);
    const objs = await b.services.store.listObjects(R);
    expect(objs.map((o) => o.id)).toContain('w1');
    const photo = await b.services.store.readAuditPhoto(auditPhotoId('f1'));
    expect(Array.from(photo!.foto!)).toEqual([255, 216, 1, 2, 3]);
    expect((await b.services.drafts.list(R as string)).map((d) => d.id)).toEqual(['d1']);
  });

  it('los niveles viajan por espacio, y un paquete de antes de la v4 los copia a cada espacio', async () => {
    const { a, project, R } = await seed();
    const scope = { projectId: project.id as string, spaceId: R as string };
    await a.services.markers.add(scope, 'level', 'Cubierta');
    const pkg = unzipPackage(zipPackage(await readProjectPackage(a.db, project.id as string)));
    const b = await openDb();
    opened.push(b);
    await importProjectPackage(b.db, pkg);
    expect((await b.services.markers.list(scope, 'level')).map((m) => m.name)).toEqual(['Nivel 0', 'Cubierta 1']);

    // Paquete viejo: filas de project_markers sin space_id.
    const old = { ...pkg, tables: { ...pkg.tables, project_markers: pkg.tables.project_markers.map(({ space_id: _s, ...r }) => r) } };
    const c = await openDb();
    opened.push(c);
    await importProjectPackage(c.db, old);
    expect((await c.services.markers.list(scope, 'level')).map((m) => m.name)).toEqual(['Nivel 0', 'Cubierta 1']);
  });

  it('importar sobre el mismo proyecto lo reemplaza (no duplica)', async () => {
    const { a, project, R } = await seed();
    const pkg = unzipPackage(zipPackage(await readProjectPackage(a.db, project.id as string)));
    await a.services.store.createObject(
      new Wall({ id: revitObjectId('w2'), roomId: R, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 3 }, thickness: meters(0.15), height: meters(2.5) }),
    );
    const r = await importProjectPackage(a.db, pkg);
    expect(r.replaced).toBe(true);
    const ids = (await a.services.store.listObjects(R)).map((o) => o.id);
    expect(ids).toContain('w1');
    expect(ids).not.toContain('w2'); // vuelve al estado del paquete
    expect(await a.services.projects.listProjects()).toHaveLength(1);
  });

  it('rechaza archivos que no son paquetes o que son de una versión más nueva', () => {
    expect(() => unzipPackage(new Uint8Array([1, 2, 3]))).toThrow(PackageError);
    const otro = zipSync({ 'manifest.json': strToU8('{"format":"otro"}'), 'data.json': strToU8('{}') });
    expect(() => unzipPackage(otro)).toThrow(/no es un paquete/);
    const nuevo = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'polylive-project', formatVersion: 99, schemaVersion: 1, project: { id: 'x', name: 'x', bimCode: 'x' } })),
      'data.json': strToU8('{}'),
    });
    expect(() => unzipPackage(nuevo)).toThrow(/más nueva/);
  });

  it('nombre de archivo legible con código, nombre y fecha local', () => {
    expect(packageFilename({ project: { id: 'p', name: 'Edificio Ñuñoa', bimCode: 'BIM001' } }, new Date(2026, 9, 6, 17, 5))).toBe(
      'BIM001-Edificio-Nunoa-20261006-1705.polylive',
    );
  });
});
