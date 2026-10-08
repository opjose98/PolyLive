// =============================================================================
// robustness.test.ts — Una fila corrupta no bloquea; las fotos se listan sin imagen
// =============================================================================

import { Database } from '../../src/infrastructure/sqlite/database';
import { ObjectStore } from '../../src/infrastructure/sqlite/ObjectStore';
import { DraftStore } from '../../src/infrastructure/sqlite/DraftStore';
import { Wall, roomId, revitObjectId } from '../../src/domain/objects';
import { AuditPhoto } from '../../src/domain/objects/audit-photo';
import { auditPhotoId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';
import { diagnostics } from '../../src/shared/diagnostics';
import { parseJsonOr } from '../../src/shared/safeJson';

const R = roomId('r-rob');

describe('Robustez de la persistencia', () => {
  let db: Database;
  let store: ObjectStore;
  beforeEach(async () => {
    db = new Database(':memory:');
    await db.open();
    await db.migrate();
    store = new ObjectStore(db);
    diagnostics.clear();
  });
  afterEach(async () => {
    await db.close();
  });

  it('un objeto con JSON corrupto se salta, el resto del espacio carga y queda en el diagnóstico', async () => {
    await store.createObject(
      new Wall({ id: revitObjectId('w-ok'), roomId: R, startPoint: { x: 0, y: 0 }, endPoint: { x: 3, y: 0 }, thickness: meters(0.15), height: meters(2.5) }),
    );
    await db.run(`INSERT INTO revit_objects (id, room_id, object_type, properties_json) VALUES ('w-bad', ?, 'Wall', '{roto')`, [R as string]);
    const objs = await store.listObjects(R);
    expect(objs.map((o) => o.id)).toEqual(['w-ok']);
    const e = diagnostics.entries().find((x) => x.source === 'revit_objects');
    expect(e?.message).toContain('w-bad');
  });

  it('un dibujo ilegible se salta e informa', async () => {
    const drafts = new DraftStore(db);
    await db.run(
      `INSERT INTO draft_items (id, space_id, view_json, level_id, kind, points_json, text, props_json, created_at) VALUES ('d-bad', 's', '{', '', 'line', '[]', '', '{}', '2026-10-06')`,
    );
    expect(await drafts.list('s')).toEqual([]);
    expect(diagnostics.entries().some((x) => x.source === 'draft_items' && x.message.includes('d-bad'))).toBe(true);
  });

  it('el listado de fotos no lee la imagen; leer una foto sí la trae', async () => {
    const id = auditPhotoId('p1');
    await store.createAuditPhoto(new AuditPhoto({ id, roomId: R, foto: new Uint8Array([1, 2, 3, 4]), metadata_json: '{"filename":"a.jpg","marker":{"position":{"x":1,"y":1}}}' }));
    const [listed] = await store.listAuditPhotos(R);
    expect(listed.foto).toBeNull();
    expect(listed.metadata.filename).toBe('a.jpg');
    expect((await store.listPhotoMarkers(R))).toHaveLength(1);
    const full = await store.readAuditPhoto(id);
    expect(Array.from(full!.foto!)).toEqual([1, 2, 3, 4]);
    // Actualizar metadatos no borra la imagen.
    await store.updateAuditPhoto(id, { metadata_json: '{"filename":"b.jpg"}' });
    expect(Array.from((await store.readAuditPhoto(id))!.foto!)).toEqual([1, 2, 3, 4]);
  });

  it('parseJsonOr devuelve el valor por defecto con JSON roto', () => {
    expect(parseJsonOr('{x', { a: 1 }, 'prueba')).toEqual({ a: 1 });
    expect(parseJsonOr(null, [], 'prueba')).toEqual([]);
    expect(parseJsonOr('[1]', [], 'prueba')).toEqual([1]);
  });
});
