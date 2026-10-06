import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { DraftStore } from '../../src/infrastructure/sqlite/DraftStore';
import { CommandStack } from '../../src/application/state/CommandStack';
import { DraftingController, distanceToItem } from '../../src/application/drafting/DraftingController';
import { dimensionLine, itemLength, polygonMetrics, trussSegments, DraftView } from '../../src/domain/drafting/drafting';

const plan: DraftView = { kind: 'plan' };
const face: DraftView = { kind: 'wallFace', wallId: 'w1', side: 'A' };

describe('drafting — geometría', () => {
  it('línea de cota desplazada a la izquierda del segmento', () => {
    const l = dimensionLine({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.5);
    expect(l.a).toEqual({ x: 0, y: 0.5 });
    expect(l.b).toEqual({ x: 4, y: 0.5 });
  });

  it('área y perímetro de un polígono', () => {
    expect(polygonMetrics([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toEqual({ area: 12, perimeter: 14 });
  });

  it('cercha: cordón inferior, superior a dos aguas y diagonales; cumbrera a la altura dada', () => {
    const segs = trussSegments({ x: 0, y: 3 }, { x: 8, y: 3 }, 1.2, 4);
    expect(segs[0]).toEqual([{ x: 0, y: 3 }, { x: 8, y: 3 }]);
    const top = Math.max(...segs.flat().map((p) => p.y));
    expect(top).toBeCloseTo(4.2);
    expect(segs.length).toBeGreaterThan(8);
  });
});

describe('DraftingController', () => {
  let dbPath: string;
  let db: Database;
  let ctl: DraftingController;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `draft-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    ctl = new DraftingController(new DraftStore(db), 'S1', 'L0');
    await ctl.load();
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('cota A→B con su desplazamiento; un toque no crea nada', async () => {
    ctl.setTool('dimension');
    ctl.begin(plan, { x: 0, y: 0 });
    expect(await ctl.end({ x: 0.01, y: 0 })).toBeNull();
    ctl.begin(plan, { x: 0, y: 0 });
    const d = (await ctl.end({ x: 3.25, y: 0 }))!;
    expect(d.kind).toBe('dimension');
    expect(itemLength(d)).toBeCloseTo(3.25);
    expect(d.props.offset).toBe(0.4);
    expect(d.levelId).toBe('L0');
  });

  it('viga con la sección de las píldoras; cercha en alzado', async () => {
    ctl.setTool('beam', { width: 0.25, depth: 0.5 });
    ctl.begin(plan, { x: 0, y: 0 });
    const b = (await ctl.end({ x: 5, y: 0 }))!;
    expect(b.props).toEqual({ width: 0.25, depth: 0.5 });
    ctl.setTool('truss');
    ctl.begin(face, { x: 0, y: 2.5 });
    const t = (await ctl.end({ x: 6, y: 2.5 }))!;
    expect(t.view).toEqual(face);
    expect(t.levelId).toBe('');
  });

  it('texto y etiqueta piden el texto; coordenada y correa se crean al tocar', async () => {
    ctl.setTool('text');
    await ctl.tap(plan, { x: 1, y: 1 }, 0.2);
    expect(ctl.getState().pendingText).toMatchObject({ kind: 'text', at: { x: 1, y: 1 } });
    expect((await ctl.submitText('  Baño  '))!.text).toBe('Baño');

    ctl.setTool('tag');
    await ctl.tap(plan, { x: 2, y: 2 }, 0.2); // sin objeto: no pide nada
    expect(ctl.getState().pendingText).toBeNull();
    await ctl.tap(plan, { x: 2, y: 2 }, 0.2, { targetId: 'wall-1', text: 'M-01 · 15 cm' });
    const tag = (await ctl.submitText(ctl.getState().pendingText!.suggested))!;
    expect(tag).toMatchObject({ kind: 'tag', text: 'M-01 · 15 cm', targetId: 'wall-1' });

    ctl.setTool('coordinate');
    await ctl.tap(plan, { x: 3, y: 3 }, 0.2);
    ctl.setTool('purlin');
    await ctl.tap(face, { x: 1, y: 2.7 }, 0.2);
    expect(ctl.getState().items.map((i) => i.kind)).toEqual(['text', 'tag', 'coordinate', 'purlin']);
  });

  it('polígono: vértices, cerrar tocando el primero, quitar el último', async () => {
    ctl.setTool('polygon');
    await ctl.tap(plan, { x: 0, y: 0 }, 0.2);
    await ctl.tap(plan, { x: 4, y: 0 }, 0.2);
    await ctl.tap(plan, { x: 9, y: 9 }, 0.2);
    ctl.undoPolygonPoint();
    await ctl.tap(plan, { x: 4, y: 3 }, 0.2);
    await ctl.tap(plan, { x: 0.05, y: 0.05 }, 0.2); // cerca del primero: cierra
    const poly = ctl.getState().items[0];
    expect(poly.kind).toBe('polygon');
    expect(polygonMetrics(poly.points).area).toBeCloseTo(6);
    expect(ctl.getState().polygon).toBeNull();
  });

  it('seleccionar tocando, editar, borrar, deshacer y rehacer (persistido)', async () => {
    ctl.setTool('line');
    ctl.begin(plan, { x: 0, y: 0 });
    const l = (await ctl.end({ x: 2, y: 0 }))!;
    ctl.setTool(null);
    expect(await ctl.tap(plan, { x: 1, y: 0.05 }, 0.2)).toBe(true);
    expect(ctl.getState().selectedId).toBe(l.id);

    await ctl.edit(l.id, { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] });
    expect(itemLength(ctl.selected!)).toBeCloseTo(3);
    await ctl.undo();
    expect(itemLength(ctl.getState().items[0])).toBeCloseTo(2);
    await ctl.redo();
    expect(itemLength(ctl.getState().items[0])).toBeCloseTo(3);

    await ctl.remove(l.id);
    expect(ctl.getState().items).toHaveLength(0);
    await ctl.undo();
    expect(ctl.getState().items).toHaveLength(1);

    const other = new DraftingController(new DraftStore(db), 'S1', 'L0');
    await other.load();
    expect(other.getState().items).toHaveLength(1);
  });

  it('en planta solo se ven los del nivel activo', async () => {
    ctl.setTool('coordinate');
    await ctl.tap(plan, { x: 0, y: 0 }, 0.2);
    ctl.setLevel('L1');
    expect(ctl.itemsIn(plan)).toHaveLength(0);
    ctl.setLevel('L0');
    expect(ctl.itemsIn(plan)).toHaveLength(1);
  });

  it('distancia a una cota tiene en cuenta la línea desplazada', () => {
    const item = {
      id: 'x', spaceId: 'S', view: plan, levelId: '', kind: 'dimension' as const,
      points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], text: '', props: { offset: 1 }, createdAt: '',
    };
    expect(distanceToItem(item, { x: 2, y: 1 })).toBeCloseTo(0);
  });
});

describe('DraftingController con la historia del levantamiento', () => {
  let dbPath: string;
  let db: Database;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `draft-h-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
  });
  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  it('deshacer sigue el orden real: lo último (aunque sea de otro editor) va primero', async () => {
    const stack = new CommandStack({} as never);
    const ctl = new DraftingController(new DraftStore(db), 'S1', 'L0', stack);
    const events: string[] = [];
    ctl.onHistory((k) => events.push(k));
    await ctl.load();
    ctl.setTool('line');
    ctl.begin(plan, { x: 0, y: 0 });
    const line = (await ctl.end({ x: 2, y: 0 }))!;
    // Otra acción del levantamiento, posterior.
    let wall = 0;
    await stack.execute({ id: 'w' as never, type: 'Wall', timestamp: new Date(), canUndo: () => true, execute: async () => void wall++, undo: async () => void wall-- });
    await ctl.remove(line.id);
    expect(ctl.getState().items).toHaveLength(0);
    expect(events).toEqual(['push', 'push']);

    await ctl.undo(); // devuelve la línea borrada, no el muro
    expect(ctl.getState().items.map((i) => i.id)).toEqual([line.id]);
    expect(wall).toBe(1);
    await ctl.undo(); // ahora el muro
    expect(wall).toBe(0);
    expect(ctl.getState().items).toHaveLength(1);
    await ctl.undo(); // y la creación de la línea
    expect(ctl.getState().items).toHaveLength(0);
    expect(ctl.getState().canUndo).toBe(false);
    await ctl.redo();
    expect(ctl.getState().items).toHaveLength(1);
    expect(events.slice(2)).toEqual(['undo', 'undo', 'undo', 'redo']);
  });
});
