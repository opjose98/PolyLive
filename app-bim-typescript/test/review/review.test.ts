import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { ReviewStore } from '../../src/infrastructure/sqlite/ReviewStore';
import { ReviewController } from '../../src/application/review/ReviewController';
import { reviewCsv, reviewHtml, reviewSvgMarks } from '../../src/application/review/reviewReport';
import { cloudOutline } from '../../src/application/review/cloud';
import { distanceToMarkup, isMeaningful, countByStatus, REVIEW_COLORS, ReviewView } from '../../src/domain/review/review';

const plan: ReviewView = { kind: 'plan' };
const face: ReviewView = { kind: 'wallFace', wallId: 'w1', side: 'A' };
const show = { open: true, resolved: true };

describe('review — dominio', () => {
  it('distancia a cada tipo de marca y tamaño mínimo', () => {
    expect(distanceToMarkup({ x: 1, y: 1 }, { kind: 'arrow', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } })).toBeCloseTo(1);
    expect(distanceToMarkup({ x: 1, y: 0.5 }, { kind: 'rect', a: { x: 0, y: 0 }, b: { x: 2, y: 2 } })).toBeCloseTo(0.5);
    expect(isMeaningful({ kind: 'rect', a: { x: 0, y: 0 }, b: { x: 0.01, y: 0.01 } }, 0.1)).toBe(false);
    expect(isMeaningful({ kind: 'text', at: { x: 0, y: 0 }, text: '  ' }, 0.1)).toBe(false);
  });

  it('la nube rodea el rectángulo', () => {
    const c = cloudOutline({ x: 0, y: 0 }, { x: 6, y: 3 });
    expect(c.length).toBeGreaterThan(20);
    expect(Math.min(...c.map((p) => p.y))).toBeLessThan(0);
    expect(cloudOutline({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toEqual([]);
  });
});

describe('ReviewController', () => {
  let dbPath: string;
  let db: Database;
  let ctl: ReviewController;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `review-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    ctl = new ReviewController(new ReviewStore(db), 'S1', 'Interventor');
    await ctl.load();
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('dibujar una nube crea la observación 1, seleccionada, con autor', async () => {
    ctl.setTool('cloud');
    ctl.begin(plan, { x: 0, y: 0 });
    ctl.move({ x: 1, y: 1 });
    const item = await ctl.end({ x: 2, y: 1 }, 0.1);
    expect(item).toMatchObject({ number: 1, status: 'open', author: 'Interventor', color: REVIEW_COLORS[0] });
    expect(item!.markup).toEqual({ kind: 'cloud', a: { x: 0, y: 0 }, b: { x: 2, y: 1 } });
    expect(ctl.getState().selectedId).toBe(item!.id);
  });

  it('un toque con trazo no crea nada; el texto pide el texto y crea con él', async () => {
    ctl.setTool('freehand');
    ctl.begin(plan, { x: 0, y: 0 });
    expect(await ctl.end({ x: 0.01, y: 0 }, 0.1)).toBeNull();

    ctl.setTool('text');
    expect(ctl.tap(plan, { x: 3, y: 3 }, 0.2, show)).toBe(true);
    expect(ctl.getState().pendingText).toEqual({ view: plan, at: { x: 3, y: 3 } });
    const t = await ctl.submitText('Falta dilatación');
    expect(t).toMatchObject({ number: 1, comment: 'Falta dilatación', markup: { kind: 'text', text: 'Falta dilatación' } });
  });

  it('seleccionar tocando, comentar, resolver, color, foto, borrar y deshacer', async () => {
    ctl.setTool('arrow');
    ctl.begin(face, { x: 0, y: 0 });
    const a = (await ctl.end({ x: 2, y: 0 }, 0.1))!;
    ctl.setTool(null);
    ctl.select(null);
    expect(ctl.tap(face, { x: 1, y: 0.05 }, 0.2, show)).toBe(true);
    expect(ctl.getState().selectedId).toBe(a.id);
    // En otra vista no se toca.
    expect(ctl.tap(plan, { x: 1, y: 0.05 }, 0.2, show)).toBe(false);

    await ctl.editComment(a.id, 'Fisura en dintel');
    await ctl.editColor(a.id, REVIEW_COLORS[2]);
    await ctl.attachPhoto(a.id, 'photo-1');
    await ctl.setStatus(a.id, 'resolved');
    let it = ctl.getState().items[0];
    expect(it).toMatchObject({ comment: 'Fisura en dintel', color: REVIEW_COLORS[2], photoId: 'photo-1', status: 'resolved', resolvedBy: 'Interventor' });
    expect(ctl.itemsIn(face, { open: true, resolved: false })).toHaveLength(0);

    // Persistido.
    const other = new ReviewController(new ReviewStore(db), 'S1');
    await other.load();
    expect(other.getState().items[0]).toMatchObject({ comment: 'Fisura en dintel', status: 'resolved' });

    await ctl.remove(a.id);
    expect(ctl.getState().items).toHaveLength(0);
    await ctl.undo();
    expect(ctl.getState().items).toHaveLength(1);
    await ctl.redo();
    expect(ctl.getState().items).toHaveLength(0);

    // Los números no se reutilizan.
    ctl.setTool('rect');
    ctl.begin(plan, { x: 0, y: 0 });
    it = (await ctl.end({ x: 1, y: 1 }, 0.1))!;
    expect(it.number).toBe(2);
    expect(countByStatus(ctl.getState().items)).toEqual({ open: 1, resolved: 0 });
  });

  it('acta: marcas al SVG, CSV y HTML', async () => {
    ctl.setTool('rect');
    ctl.begin(plan, { x: 0, y: 0 });
    const r = (await ctl.end({ x: 2, y: 1 }, 0.1))!;
    await ctl.editComment(r.id, 'Revisar, "urgente"');
    const items = ctl.getState().items;
    const marks = reviewSvgMarks(items);
    expect(marks.map((m) => m.kind)).toEqual(['polyline', 'pin']);
    const meta = { project: 'Obra', space: 'Casa', reviewer: 'Interventor', generatedAt: new Date() };
    const csv = reviewCsv(meta, items, () => 'Planta');
    expect(csv.split('\n')[1]).toContain('"Revisar, ""urgente"""');
    const h = reviewHtml(meta, items, [{ title: 'Planta', svg: '<svg></svg>' }], () => 'Planta');
    expect(h).toContain('Acta de revisión');
    expect(h).toContain('1 observación(es), 1 abierta(s)');
  });
});
