// =============================================================================
// EditorController.test.ts — El editor de planta, de punta a punta
// =============================================================================
//
// Se ejercita contra una base SQLite REAL (no mocks): el controlador coordina
// UseCases que escriben y releen, y la mitad de los fallos que esta suite
// busca son precisamente desincronizaciones entre lo que el editor cree tener
// en memoria y lo que quedó persistido.
//
// Las coordenadas de pantalla usan una transformación conocida
// (scale=100 px/m, offset 0) para que screen→world sea simplemente /100.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { EditorController } from '../../src/application/editor/EditorController';
import { roomId, revitObjectId, RoomId, RevitObjectId } from '../../src/domain/objects/base';
import { Wall } from '../../src/domain/objects/wall';
import { Column } from '../../src/domain/objects/column';
import { Door } from '../../src/domain/objects/door';
import { Room } from '../../src/domain/objects/room';
import { meters } from '../../src/domain/geometry/types';
import { MIN_SCALE } from '../../src/application/canvas/types';
import { extent, uniformWall } from '../../src/domain/objects/vertical';
import { diagnostics } from '../../src/shared/diagnostics';

const ROOM_ID: RoomId = roomId('editor-room');
const ROOM_OBJECT_ID: RevitObjectId = revitObjectId('editor-room');
const TOL_PX = 22;

/** scale = 100 px/m, offset 0 → 1 metro = 100 px. */
function px(meters: number): number {
  return meters * 100;
}

describe('EditorController', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;
  let editor: EditorController;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `editor-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
    editor = new EditorController({
      services,
      roomId: ROOM_ID,
      roomObjectId: ROOM_OBJECT_ID,
      initialTransform: { scale: 100, offsetX: 0, offsetY: 0 },
    });
    await editor.init();
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  /** Traza un muro independiente con un arrastre de un dedo (método por defecto). */
  async function drawWall(ax: number, ay: number, bx: number, by: number): Promise<void> {
    editor.setTool('wall');
    editor.drawBegin(px(ax), px(ay));
    editor.drawMove(px(bx), px(by));
    await editor.drawEnd(px(bx), px(by));
  }

  /** Traza un rectángulo cerrado de 4×3 m: cuatro muros sueltos que comparten nudos. */
  async function drawRectangle(): Promise<void> {
    editor.setSnapEnabled(false);
    editor.setNodeSnapEnabled(false);
    await drawWall(0, 0, 4, 0);
    await drawWall(4, 0, 4, 3);
    await drawWall(4, 3, 0, 3);
    await drawWall(0, 3, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('crea el Recinto si no existe y arranca sin muros ni recintos', async () => {
      const room = await services.store.readObject(ROOM_OBJECT_ID);
      expect(room).toBeInstanceOf(Room);
      expect(editor.walls).toHaveLength(0);
      expect(editor.getState().rooms).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: muro
  // -------------------------------------------------------------------------

  describe('herramienta muro', () => {
    it('arrastre libre: un gesto crea un muro de inicio a fin, con vista previa mientras dura', async () => {
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      editor.drawBegin(px(0), px(0));
      editor.drawMove(px(2), px(0));
      expect(editor.getState().wallDraft?.start).toEqual({ x: 0, y: 0 });
      expect(editor.getState().wallDraft?.end?.x).toBeCloseTo(2);
      expect(editor.walls).toHaveLength(0);

      await editor.drawEnd(px(4), px(0));
      expect(editor.walls).toHaveLength(1);
      expect(editor.walls[0].endPoint.x).toBeCloseTo(4);
      expect(editor.getState().wallDraft).toBeNull();
    });

    it('dos trazos seguidos se guardan los dos aunque el primero no haya terminado', async () => {
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.drawBegin(px(0), px(0));
      const first = editor.drawEnd(px(3), px(0));
      editor.drawBegin(px(0), px(2));
      const second = editor.drawEnd(px(3), px(2));
      await Promise.all([first, second]);
      expect(editor.walls).toHaveLength(2);
      expect(editor.getState().notice?.kind).not.toBe('error');
    });

    it('dos muros paralelos que no se tocan no avisan de un encuentro agudo', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 3, 0);
      await drawWall(0, 2, 3, 2);
      expect(editor.getState().notice).toBeNull();
    });

    it('los muros son independientes: el siguiente no arranca donde terminó el anterior', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);
      await drawWall(0, 2, 4, 2);
      expect(editor.walls).toHaveLength(2);
      expect(editor.walls[1].startPoint).toEqual({ x: 0, y: 2 });
    });

    it('punto a punto: el primer toque fija el inicio y el segundo crea el muro', async () => {
      editor.setTool('wall');
      editor.setCreationMethod('wall', 'points');
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);

      await editor.handleTap(px(0), px(0), TOL_PX);
      expect(editor.walls).toHaveLength(0);
      expect(editor.getState().wallDraft?.start).toEqual({ x: 0, y: 0 });

      await editor.handleTap(px(3), px(0), TOL_PX);
      expect(editor.walls).toHaveLength(1);
      // El tercer toque empieza un muro NUEVO, no encadena.
      await editor.handleTap(px(3), px(2), TOL_PX);
      expect(editor.walls).toHaveLength(1);
      expect(editor.getState().wallDraft?.start).toEqual({ x: 3, y: 2 });
    });

    it('en arrastre libre un toque no crea nada y explica cómo trazar', async () => {
      editor.setTool('wall');
      await editor.handleTap(px(1), px(1), TOL_PX);
      expect(editor.walls).toHaveLength(0);
      expect(editor.getState().notice?.kind).toBe('info');
    });

    it('un trazo más corto que 10 cm se descarta sin error', async () => {
      editor.setTool('wall');
      editor.drawBegin(px(0), px(0));
      await editor.drawEnd(px(0.05), px(0));
      expect(editor.walls).toHaveLength(0);
      expect(editor.getState().notice?.kind).toBe('info');
    });

    it('el snap a nodo pega el extremo al nudo existente más cercano', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(true);
      await drawWall(0, 0, 4, 0);
      editor.drawBegin(px(4.05), px(0.05));
      expect(editor.getState().wallDraft?.snappedToNode).toBe(true);
      await editor.drawEnd(px(4), px(3));
      expect(editor.walls[1].startPoint).toEqual({ x: 4, y: 0 });
    });

    it('cancelar el gesto conserva el inicio fijado en punto a punto, y lo descarta en arrastre', async () => {
      editor.setTool('wall');
      editor.setCreationMethod('wall', 'points');
      await editor.handleTap(px(0), px(0), TOL_PX);
      editor.drawBegin(px(2), px(2));
      editor.drawCancel();
      expect(editor.getState().wallDraft?.start).not.toBeNull();

      editor.setCreationMethod('wall', 'drag');
      editor.drawBegin(px(0), px(0));
      editor.drawCancel();
      expect(editor.getState().wallDraft).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: selección
  // -------------------------------------------------------------------------

  describe('herramienta dividir muro', () => {
    it('se engancha al encuentro en T con otro muro y parte en un paso de deshacer', async () => {
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 6, 0);
      await drawWall(2.5, 0, 2.5, 3); // T sobre el primero
      const before = editor.walls.length;
      editor.setTool('split');
      await editor.handleTap(px(2.4), px(0.05), TOL_PX);
      expect(editor.walls).toHaveLength(before + 1);
      const ends = editor.walls.filter((w) => w.startPoint.y === 0 && w.endPoint.y === 0).map((w) => [w.startPoint.x, w.endPoint.x].sort((a, b) => a - b));
      expect(ends).toEqual(expect.arrayContaining([[0, 2.5], [2.5, 6]]));
      await editor.undo();
      expect(editor.walls).toHaveLength(before);
    });

    it('lejos de un encuentro parte donde se toca, al centímetro', async () => {
      await drawWall(0, 0, 6, 0);
      editor.setTool('split');
      await editor.handleTap(px(4.123), px(0), TOL_PX);
      expect(editor.walls.map((w) => w.endPoint.x).sort()).toEqual([4.12, 6]);
    });
  });

  describe('suelos libres y vacíos', () => {
    const floors = () => editor.floorViews;

    it('rectángulo arrastrado: suelo libre con su contorno; se selecciona tocándolo', async () => {
      editor.setNodeSnapEnabled(false);
      editor.setSnapEnabled(false);
      editor.setTool('floor');
      editor.setCreationMethod('floor', 'rect');
      expect(editor.shapeDragActive).toBe(true);
      editor.drawBegin(px(0), px(0));
      editor.drawMove(px(4), px(1.5));
      await editor.drawEnd(px(4), px(1.5));
      expect(floors()).toHaveLength(1);
      expect(floors()[0].zoneId).toBeNull();
      expect(floors()[0].polygon).toHaveLength(4);

      editor.setTool('select');
      await editor.handleTap(px(2), px(0.7), TOL_PX);
      expect(editor.selected?.type).toBe('Floor');
    });

    it('polígono por toques: tocar el primer vértice lo cierra; un vacío se agrega al suelo que lo contiene', async () => {
      editor.setNodeSnapEnabled(false);
      editor.setSnapEnabled(false);
      editor.setTool('floor');
      editor.setCreationMethod('floor', 'polygon');
      for (const [x, y] of [[0, 0], [5, 0], [5, 3], [0, 3]]) await editor.handleTap(px(x), px(y), TOL_PX);
      expect(editor.getState().shapeDraft?.points).toHaveLength(4);
      await editor.handleTap(px(0), px(0), TOL_PX);
      expect(editor.getState().shapeDraft).toBeNull();
      expect(floors()).toHaveLength(1);

      editor.setTool('void');
      editor.setCreationMethod('void', 'circle');
      editor.drawBegin(px(2.5), px(1.5));
      editor.drawMove(px(3), px(1.5));
      await editor.drawEnd(px(3), px(1.5));
      expect(floors()[0].holes).toHaveLength(1);

      // Deshacer quita el vacío; el suelo sigue.
      await editor.undo();
      expect(floors()[0].holes).toHaveLength(0);
    });

    it('un vacío fuera de cualquier suelo no se crea', async () => {
      editor.setTool('void');
      editor.setCreationMethod('void', 'rect');
      editor.drawBegin(px(10), px(10));
      editor.drawMove(px(11), px(11));
      await editor.drawEnd(px(11), px(11));
      expect(editor.getState().notice?.message).toMatch(/dentro de un suelo/);
    });
  });

  describe('herramienta selección', () => {
    it('toca un muro y lo selecciona', async () => {
      await drawRectangle();
      editor.setTool('select');

      await editor.handleTap(px(2), px(0), TOL_PX);

      expect(editor.selected).toBeInstanceOf(Wall);
    });

    it('lo que los filtros ocultan no se puede tocar (H-75)', async () => {
      await drawRectangle();
      editor.setTool('select');
      editor.setPickFilter((o) => !(o instanceof Wall));

      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.selected).toBeNull();

      editor.setPickFilter(null);
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.selected).toBeInstanceOf(Wall);
    });

    it('tocar el vacío deselecciona', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.selected).not.toBeNull();

      await editor.handleTap(px(20), px(20), TOL_PX);
      expect(editor.selected).toBeNull();
    });

    it('cambiar de herramienta limpia la selección — con "muro" activo no hay nada que hacerle', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);

      editor.setTool('wall');
      expect(editor.getState().selectedId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: vanos
  // -------------------------------------------------------------------------

  describe('herramienta puerta / ventana', () => {
    it('coloca una puerta sobre el muro tocado, centrada en el punto', async () => {
      await drawRectangle();
      editor.setTool('door');

      await editor.handleTap(px(2), px(0), TOL_PX);

      const doors = editor.getState().objects.filter((o): o is Door => o instanceof Door);
      expect(doors).toHaveLength(1);
      // Puerta de 0.9 m centrada en x=2 → borde en 2 - 0.45 = 1.55.
      expect(doors[0].offsetAlongWall).toBeCloseTo(1.55);
    });

    it('no crea nada si el toque no cae sobre ningún muro, y avisa', async () => {
      await drawRectangle();
      editor.setTool('door');

      await editor.handleTap(px(20), px(20), TOL_PX);

      expect(editor.getState().objects.filter((o) => o instanceof Door)).toHaveLength(0);
      expect(editor.getState().notice?.message).toContain('Toca sobre un muro');
    });

    it('encaja el vano dentro del muro cuando se toca cerca de un extremo', async () => {
      // Sin este ajuste, una puerta colocada al borde sobresale del muro:
      // el dominio lo acepta con warning, pero no es lo que se quiso indicar.
      await drawRectangle();
      editor.setTool('door');

      await editor.handleTap(px(3.95), px(0), TOL_PX);

      const door = editor.getState().objects.find((o): o is Door => o instanceof Door)!;
      // Muro de 4 m, puerta de 0.9 → el offset máximo posible es 3.1.
      expect(door.offsetAlongWall).toBeCloseTo(3.1);
      expect((door.offsetAlongWall as number) + (door.width as number)).toBeLessThanOrEqual(4.0001);
    });

    it('selecciona automáticamente el vano recién creado para poder editarlo', async () => {
      await drawRectangle();
      editor.setTool('door');
      await editor.handleTap(px(2), px(0), TOL_PX);

      expect(editor.getState().selectedId).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: columna
  // -------------------------------------------------------------------------

  describe('herramienta columna', () => {
    it('coloca una columna en el punto tocado', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      const columns = editor.getState().objects.filter((o): o is Column => o instanceof Column);
      expect(columns).toHaveLength(1);
      expect(columns[0].position.x).toBeCloseTo(2);
      expect(columns[0].position.y).toBeCloseTo(1.5);
    });

    it('la forma de creación decide la sección: rectangular por defecto, circular a pedido', async () => {
      editor.setTool('column');
      await editor.handleTap(px(1), px(1), TOL_PX);
      editor.setCreationMethod('column', 'circular');
      editor.setTool('column');
      await editor.handleTap(px(3), px(1), TOL_PX);

      const columns = editor.getState().objects.filter((o): o is Column => o instanceof Column);
      expect(columns.map((c) => c.sectionShape).sort()).toEqual(['circular', 'rectangular']);
      const rect = columns.find((c) => c.sectionShape === 'rectangular')!;
      expect(Number(rect.dimensionY)).toBeGreaterThan(0);
    });

    it('cambiar una columna circular a rectangular la deja visible (cuadrada), no de canto cero', async () => {
      editor.setCreationMethod('column', 'circular');
      editor.setTool('column');
      await editor.handleTap(px(2), px(2), TOL_PX);
      await editor.updateSelectedProperty('sectionShape', 'rectangular');

      const col = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(col.sectionShape).toBe('rectangular');
      expect(Number(col.dimensionY)).toBeCloseTo(Number(col.dimensionX));
      expect(col.footprint()).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Borrado
  // -------------------------------------------------------------------------

  describe('eliminar', () => {
    it('elimina el objeto seleccionado', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      await editor.deleteSelected();

      expect(editor.getState().objects.filter((o) => o instanceof Column)).toHaveLength(0);
      expect(editor.getState().selectedId).toBeNull();
    });

    it('borrar un muro de un recinto cerrado lo vuelve a abrir', async () => {
      await drawRectangle();
      expect(editor.getState().rooms).toHaveLength(1);
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);

      await editor.deleteSelected();

      expect(editor.walls).toHaveLength(3);
      expect(editor.getState().rooms).toHaveLength(0);
      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry).toHaveLength(0);
      expect(room.isOpen).toBe(true);
    });

    it('se niega a borrar el propio Recinto desde el editor', async () => {
      editor.select(ROOM_OBJECT_ID);
      await editor.deleteSelected();

      expect(await services.store.readObject(ROOM_OBJECT_ID)).not.toBeNull();
      expect(editor.getState().notice?.message).toContain('lista de Recintos');
    });

    it('no hace nada si no hay selección', async () => {
      await drawRectangle();
      await editor.deleteSelected();
      expect(editor.walls).toHaveLength(4);
    });

    it('deshacer un borrado devuelve el objeto', async () => {
      // BUG CORREGIDO: DeleteObjectCommand.undo() usaba
      // updateObject(id, { is_deleted: false }), y ObjectStore.updateObject
      // lanza sobre objetos borrados — deshacer un borrado fallaba siempre.
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const id = editor.getState().selectedId!;

      await editor.deleteSelected();
      expect(await services.store.readObject(id)).toBeNull();

      await editor.undo();
      expect(await services.store.readObject(id)).not.toBeNull();
      expect(editor.getState().objects.filter((o) => o instanceof Column)).toHaveLength(1);
    });

    it('rehacer un borrado lo vuelve a borrar', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const id = editor.getState().selectedId!;

      await editor.deleteSelected();
      await editor.undo();
      await editor.redo();

      expect(await services.store.readObject(id)).toBeNull();
    });

    it('borrar un muro con puerta arrastra la puerta, y deshacer devuelve las dos', async () => {
      await drawRectangle();
      editor.setTool('door');
      await editor.handleTap(px(2), px(0), TOL_PX);
      const doorId = editor.getState().selectedId!;

      editor.setTool('select');
      await editor.handleTap(px(3.5), px(0), TOL_PX);
      const wallId = editor.getState().selectedId!;
      expect(wallId).not.toBe(doorId);

      await editor.deleteSelected();
      expect(await services.store.readObject(doorId)).toBeNull();
      expect(await services.store.readObject(wallId)).toBeNull();

      await editor.undo();
      expect(await services.store.readObject(wallId)).not.toBeNull();
      expect(await services.store.readObject(doorId)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Propiedades
  // -------------------------------------------------------------------------

  describe('editar propiedades', () => {
    it('cambia el espesor del muro seleccionado y lo persiste', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      const id = editor.getState().selectedId!;

      await editor.updateSelectedProperty('thickness', meters(0.25));

      const reread = (await services.store.readObject(id)) as Wall;
      expect(reread.thickness).toBeCloseTo(0.25);
    });

    it('deshacer revierte cada propiedad editada, en orden (nombre, espesor, función)', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      const id = editor.getState().selectedId!;

      const before = (await services.store.readObject(id)) as Wall;
      await editor.updateSelectedProperty('properties', { ...before.properties, name: 'M-izq' });
      await editor.updateSelectedProperty('thickness', meters(0.2));
      await editor.updateSelectedProperty('isStructural', false);

      await editor.undo();
      let w = (await services.store.readObject(id)) as Wall;
      expect(w.isStructural).toBe(true);
      expect(Number(w.thickness)).toBeCloseTo(0.2);
      await editor.undo();
      w = (await services.store.readObject(id)) as Wall;
      expect(Number(w.thickness)).toBeCloseTo(0.15);
      await editor.undo();
      w = (await services.store.readObject(id)) as Wall;
      expect(w.properties.name).not.toBe('M-izq');
    });

    it('pasar un muro a partición avisa que el recinto deja de estar cerrado', async () => {
      await drawRectangle();
      expect(editor.getState().rooms).toHaveLength(1);
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      await editor.updateSelectedProperty('isStructural', false);
      expect(editor.getState().rooms).toHaveLength(0);
      expect(editor.getState().notice?.message).toMatch(/dejó de estar cerrado \(solo los muros portantes/);
    });

    it('un valor inválido deja el objeto intacto y publica un error legible', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      const id = editor.getState().selectedId!;

      await editor.updateSelectedProperty('thickness', meters(-1));

      const reread = (await services.store.readObject(id)) as Wall;
      expect(reread.thickness).toBeCloseTo(0.15);
      expect(editor.getState().notice?.kind).toBe('error');
      // H-46: el fallo también queda en el registro de diagnóstico.
      expect(diagnostics.entries().some((e) => e.source === 'editor')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Mover
  // -------------------------------------------------------------------------

  describe('mover por handles', () => {
    it('beginDrag agarra el handle central de una columna y endDrag la mueve', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      expect(editor.beginDrag(px(2), px(1.5), TOL_PX)).toBe(true);
      await editor.endDrag(px(3), px(1.5));

      const column = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(column.position.x).toBeCloseTo(3);
      expect(column.position.y).toBeCloseTo(1.5);
    });

    it('una columna seleccionada se arrastra agarrando su cuerpo, no solo el centro', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const before = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      const edge = (before.dimensionX as number) * 0.45; // dentro del cuerpo, lejos del centro
      // Tolerancia chica: el toque NO alcanza el manejador central, solo el cuerpo.
      expect(editor.beginDrag(px(2 + edge), px(1.5), 5)).toBe(true);
      await editor.endDrag(px(3 + edge), px(1.5));
      const column = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(column.position.x).toBeCloseTo(3);
    });

    it('beginDrag devuelve false lejos de todo handle, para que la vista panee', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      expect(editor.beginDrag(px(8), px(8), TOL_PX)).toBe(false);
    });

    it('un micro-arrastre por temblor de pulso no genera una edición', async () => {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      const before = services.commandStack.canUndo();
      editor.beginDrag(px(2), px(1.5), TOL_PX);
      await editor.endDrag(px(2) + 0.001, px(1.5));

      expect(services.commandStack.canUndo()).toBe(before);
    });

    it('arrastrar el extremo de un muro reescribe ese extremo', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);

      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);

      expect(editor.beginDrag(px(4), px(0), TOL_PX)).toBe(true);
      await editor.endDrag(px(5), px(0));

      expect(editor.walls[0].endPoint.x).toBeCloseTo(5);
    });
  });

  describe('uniones de muros', () => {
    const wallAt = (sx: number, sy: number) =>
      editor.walls.find((w) => Math.abs(w.startPoint.x - sx) < 1e-6 && Math.abs(w.startPoint.y - sy) < 1e-6)!;

    it('arrastrar una esquina mueve los dos muros que se unen en ella, y el recinto sigue cerrado', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX); // muro inferior
      expect(editor.beginDrag(px(4), px(0), TOL_PX)).toBe(true);
      editor.updateDrag(px(5), px(0));
      // Vista previa: el muro vecino se mueve en vivo.
      expect(editor.getState().dragLinked).toHaveLength(1);
      await editor.endDrag(px(5), px(0));

      const east = editor.walls.find((w) => Math.abs(w.endPoint.x - 4) < 1e-6 && Math.abs(w.endPoint.y - 3) < 1e-6)!;
      expect(east.startPoint.x).toBeCloseTo(5);
      expect(editor.getState().rooms).toHaveLength(1);
      expect(editor.getState().dragLinked).toHaveLength(0);
    });

    it('trasladar un muro estira a sus vecinos; un deshacer lo devuelve todo', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.beginDrag(px(2), px(0), TOL_PX)).toBe(true); // handle central
      await editor.endDrag(px(2), px(-1));

      expect(wallAt(0, -1).endPoint).toEqual({ x: 4, y: -1 });
      expect(wallAt(4, -1).endPoint).toEqual({ x: 4, y: 3 });
      expect(editor.getState().rooms[0].area).toBeCloseTo(16);

      await editor.undo();
      expect(wallAt(0, 0).endPoint).toEqual({ x: 4, y: 0 });
      expect(wallAt(4, 0).endPoint).toEqual({ x: 4, y: 3 });
      expect(editor.getState().rooms[0].area).toBeCloseTo(12);

      await editor.redo();
      expect(wallAt(4, -1)).toBeDefined();
    });

    it('aplicar una medida mueve el extremo con su unión', async () => {
      await drawRectangle();
      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);
      await editor.applyMeasurementToWall(meters(5));
      expect(editor.walls.some((w) => Math.abs(w.startPoint.x - 5) < 1e-6 && Math.abs(w.endPoint.y - 3) < 1e-6)).toBe(true);
      expect(editor.getState().rooms).toHaveLength(1);
    });

    // CRITERIO DE ACEPTACIÓN DE CAMPO (docs/24): un recinto dibujado a ojo y medido con láser de
    // cara interior a cara interior debe cerrar: cada cara medida queda a < 1 cm de lo medido y el
    // área neta del recinto a ±0,5 % del producto de las medidas.
    it('criterio de campo: medir cara interior a cara interior cierra el recinto (< 1 cm, área ±0,5 %)', async () => {
      await drawRectangle(); // 4 × 3 al eje, dibujado a ojo
      const t = editor.walls[0].thickness as number;
      const measureAt = async (x: number, y: number, value: number) => {
        editor.setTool('measure');
        await editor.handleTap(px(x), px(y), TOL_PX);
        const avg = await editor.captureMeasurement('manual', meters(value), undefined, 'interior');
        await editor.applyMeasurementToWall(avg!, 'interior');
        return editor.measureFaces()!;
      };
      const top = await measureAt(2, 0, 3.7); // muro de arriba: 3,70 m entre caras interiores
      expect(Math.abs(top.interior! - 3.7)).toBeLessThan(0.01);
      expect(Math.abs(top.axis - (3.7 + t))).toBeLessThan(0.01); // eje = cara + 2 medios espesores
      const right = await measureAt(editor.walls.find((w) => w.startPoint.x > 3)!.startPoint.x, 1.5, 2.6);
      expect(Math.abs(right.interior! - 2.6)).toBeLessThan(0.01);
      // La primera medida no se deshizo al aplicar la segunda.
      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(Math.abs(editor.measureFaces()!.interior! - 3.7)).toBeLessThan(0.01);
      const room = editor.getState().rooms[0];
      expect(Math.abs((room.netArea ?? 0) / (3.7 * 2.6) - 1)).toBeLessThan(0.005);
      // Trazabilidad: cada medida guarda qué se midió y qué eje se aplicó.
      const ms = await services.store.listMeasurements(ROOM_ID);
      expect(ms).toHaveLength(2);
      expect(ms.every((m) => m.reference === 'interior' && m.appliedLength !== null)).toBe(true);
    });

    it('diagonal de control: se registra, compara con el modelo y dice si el recinto cierra', async () => {
      await drawRectangle();
      const zone = editor.getState().rooms[0];
      const info = (await editor.zoneDiagonal(zone.id!))!;
      expect(info.check).toBeNull();
      const ok = (await editor.recordZoneDiagonal(zone.id!, meters(info.model + 0.004)))!;
      expect(ok.ok).toBe(true);
      const bad = (await editor.recordZoneDiagonal(zone.id!, meters(info.model + 0.05)))!;
      expect(bad.ok).toBe(false);
      const again = (await editor.zoneDiagonal(zone.id!))!;
      expect(again.check?.measured).toBeCloseTo(info.model + 0.05);
      const stored = (await services.store.listMeasurements(ROOM_ID)).filter((m) => m.reference === 'diagonal');
      expect(stored).toHaveLength(2);
      expect(stored[0].appliedLength).toBeCloseTo(info.model);
    });

    it('medir la cara exterior y el eje también; sin recinto la cara cae al eje y lo avisa', async () => {
      await drawRectangle();
      const t = editor.walls[0].thickness as number;
      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);
      await editor.applyMeasurementToWall(meters(4.5), 'exterior');
      expect(Math.abs(editor.measureFaces()!.exterior! - 4.5)).toBeLessThan(0.01);
      expect(Math.abs(editor.measureFaces()!.axis - (4.5 - t))).toBeLessThan(0.01);
      await editor.applyMeasurementToWall(meters(4.2), 'axis');
      expect(editor.measureFaces()!.axis).toBeCloseTo(4.2, 6);
    });
  });

  describe('arrastre en vivo', () => {
    async function selectedColumn(): Promise<void> {
      editor.setTool('column');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
    }

    it('updateDrag mueve una vista previa sin persistir ni apilar comandos', async () => {
      await selectedColumn();
      const canUndoBefore = services.commandStack.canUndo();
      editor.beginDrag(px(2), px(1.5), TOL_PX);
      editor.updateDrag(px(3), px(2));

      const preview = editor.getState().dragPreview as Column;
      expect(preview).toBeInstanceOf(Column);
      expect(preview.position.x).toBeCloseTo(3);
      const shown = editor.displayObjects.find((o) => o.id === preview.id) as Column;
      expect(shown.position.x).toBeCloseTo(3);
      expect(editor.selectedHandles[0].position.x).toBeCloseTo(3);

      const stored = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(stored.position.x).toBeCloseTo(2);
      expect(services.commandStack.canUndo()).toBe(canUndoBefore);
    });

    it('lo que se ve al arrastrar es lo que se guarda al soltar, y el arrastre es un solo undo', async () => {
      await selectedColumn();
      editor.beginDrag(px(2), px(1.5), TOL_PX);
      editor.updateDrag(px(2.5), px(1.5));
      editor.updateDrag(px(3), px(1.5));
      await editor.endDrag(px(3), px(1.5));

      expect(editor.getState().dragPreview).toBeNull();
      const col = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(col.position.x).toBeCloseTo(3);

      await editor.undo();
      const back = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(back.position.x).toBeCloseTo(2);
    });

    it('cancelDrag descarta la vista previa sin tocar la base', async () => {
      await selectedColumn();
      editor.beginDrag(px(2), px(1.5), TOL_PX);
      editor.updateDrag(px(4), px(1.5));
      editor.cancelDrag();
      expect(editor.getState().dragPreview).toBeNull();
      expect(editor.getState().draggingHandle).toBeNull();
      const col = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(col.position.x).toBeCloseTo(2);
    });

    it('el extremo arrastrado se engancha al nodo de otro muro', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);
      await drawWall(4, 0, 4, 3);
      editor.setNodeSnapEnabled(true);

      editor.setTool('select');
      await editor.handleTap(px(4), px(1.5), TOL_PX); // segundo muro (4,0)→(4,3)
      const id = editor.getState().selectedId;
      expect(editor.beginDrag(px(4), px(3), TOL_PX)).toBe(true);
      editor.updateDrag(px(0.1), px(0.1));
      expect(editor.getState().dragSnappedToNode).toBe(true);
      await editor.endDrag(px(0.1), px(0.1));

      const moved = editor.walls.find((w) => w.id === id)!;
      expect(moved.endPoint.x).toBeCloseTo(0);
      expect(moved.endPoint.y).toBeCloseTo(0);
    });

    it('selectAt selecciona con cualquier herramienta y no borra la selección en el vacío', async () => {
      await selectedColumn();
      editor.setTool('wall');
      const hit = editor.selectAt(px(2), px(1.5), TOL_PX);
      expect(hit).toBeInstanceOf(Column);
      expect(editor.getState().selectedId).toBe(hit!.id);
      expect(editor.selectAt(px(9), px(9), TOL_PX)).toBeNull();
      expect(editor.getState().selectedId).toBe(hit!.id);
    });

    it('setTransform limita la escala al rango permitido', () => {
      editor.setTransform({ scale: 1e9, offsetX: 5, offsetY: 6 });
      expect(editor.getState().transform.scale).toBeLessThan(1e9);
      expect(editor.getState().transform.offsetX).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Undo / Redo
  // -------------------------------------------------------------------------

  describe('undo / redo', () => {
    it('deshacer quita el último muro', async () => {
      await drawRectangle();
      await editor.undo();
      expect(editor.walls).toHaveLength(3);
    });

    it('rehacer lo restaura y el recinto vuelve a cerrarse', async () => {
      await drawRectangle();
      await editor.undo();
      expect(editor.getState().rooms).toHaveLength(0);
      await editor.redo();
      expect(editor.walls).toHaveLength(4);
      expect(editor.getState().rooms).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Recintos (detección automática)
  // -------------------------------------------------------------------------

  describe('recintos', () => {
    it('cuatro muros que cierran un rectángulo forman un recinto con su área', async () => {
      await drawRectangle();
      const rooms = editor.getState().rooms;
      expect(rooms).toHaveLength(1);
      expect(rooms[0].area).toBeCloseTo(12, 1);
    });

    it('el Recinto persiste la geometría y el área del contorno cerrado', async () => {
      await drawRectangle();
      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry.length).toBeGreaterThanOrEqual(4);
      expect(Number(room.area)).toBeCloseTo(12, 1);
      expect(room.isOpen).toBe(false);
    });

    it('muros abiertos no forman recinto ni se rellenan', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);
      await drawWall(4, 0, 4, 3);
      await drawWall(4, 3, 0, 3);
      expect(editor.getState().rooms).toHaveLength(0);
      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry).toHaveLength(0);
    });

    it('cada recinto tiene id persistido, número y área neta a cara interior', async () => {
      await drawRectangle();
      const [r] = editor.getState().rooms;
      expect(r.id).toBeDefined();
      expect(r.number).toBe(1);
      expect(r.name).toBe('Recinto 1');
      expect(r.netArea).toBeCloseTo(3.85 * 2.85, 4);
      const stored = await services.zones.list(ROOM_ID as unknown as string);
      expect(stored.map((z) => z.id)).toEqual([r.id]);
    });

    it('reabrir el espacio antes de cargar los niveles no duplica el recinto', async () => {
      const lv = {
        active: 'L0',
        base: 'L0',
        all: new Set(['L0']),
        underlay: new Set<string>(),
        elevations: new Map([['L0', 0]]),
      };
      editor.setScope(lv, null);
      await drawRectangle();
      const id = editor.getState().rooms[0].id!;

      // Reabrir: el editor lee los muros ANTES de que lleguen los niveles (alcance nulo).
      const reopened = new EditorController({
        services,
        roomId: ROOM_ID,
        roomObjectId: ROOM_OBJECT_ID,
        initialTransform: { scale: 100, offsetX: 0, offsetY: 0 },
      });
      await reopened.init();
      reopened.setScope(lv, null);
      await reopened.reload();

      const stored = await services.zones.list(ROOM_ID as unknown as string);
      expect(stored.map((z) => z.id)).toEqual([id]);
      expect(reopened.getState().rooms.map((r) => r.id)).toEqual([id]);
    });

    it('el recinto conserva id y nombre al mover un muro, y al dividirlo nace otro', async () => {
      await drawRectangle();
      const id = editor.getState().rooms[0].id!;
      await editor.editZone(id, { name: 'Cocina', use: 'cocina' });

      // Mover el muro inferior: mismo recinto, más grande.
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      editor.beginDrag(px(2), px(0), TOL_PX);
      await editor.endDrag(px(2), px(-1));
      expect(editor.getState().rooms[0]).toMatchObject({ id, name: 'Cocina', use: 'cocina' });

      // Dividir con un muro en x=1 (la semilla queda en un lado).
      await drawWall(1, -1, 1, 3);
      const rooms = editor.getState().rooms;
      expect(rooms).toHaveLength(2);
      expect(rooms.filter((r) => r.id === id)).toHaveLength(1);
      expect(rooms.find((r) => r.id !== id)!.number).toBe(2);

      // Deshacer la división: vuelve a ser un solo recinto, el mismo.
      await editor.undo();
      expect(editor.getState().rooms.map((r) => r.id)).toEqual([id]);
    });

    it('Suelo: tocar un recinto le pone suelo con su contorno neto, que sigue a los muros', async () => {
      await drawRectangle();
      editor.setTool('floor');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const zoneId = editor.getState().rooms[0].id!;
      expect(editor.floorOfZone(zoneId)).not.toBeNull();
      expect(editor.floorViews).toHaveLength(1);
      expect(editor.floorViews[0].thickness).toBeCloseTo(0.1);

      // Un segundo toque no duplica.
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      expect(editor.getState().objects.filter((o) => o.type === 'Floor')).toHaveLength(1);

      // Mover un muro: el suelo toma el nuevo contorno.
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      editor.beginDrag(px(2), px(0), TOL_PX);
      await editor.endDrag(px(2), px(-1));
      const ys = editor.floorViews[0].polygon.map((p) => p.y);
      expect(Math.min(...ys)).toBeCloseTo(-1 + 0.075);

      // Espesor, quitar y deshacer.
      await editor.setZoneFloorThickness(zoneId, meters(0.2));
      expect(editor.floorViews[0].thickness).toBeCloseTo(0.2);
      await editor.removeZoneFloor(zoneId);
      expect(editor.floorViews).toHaveLength(0);
      await editor.undo();
      expect(editor.floorViews).toHaveLength(1);
    });

    it('un tabique trazado hasta la mitad de dos muros (con el dedo impreciso) se engancha a sus ejes y divide el recinto', async () => {
      await drawRectangle();
      editor.setSnapEnabled(true);
      editor.setNodeSnapEnabled(true);
      const id = editor.getState().rooms[0].id;
      // 6 cm por dentro de cada eje y 4 cm torcido: así traza un dedo.
      await drawWall(2, 0.06, 2.04, 2.94);
      const rooms = editor.getState().rooms;
      expect(rooms).toHaveLength(2);
      expect(rooms.some((r) => r.id === id)).toBe(true);
      const tabique = editor.walls.find((w) => Math.abs(w.startPoint.x - 2) < 1e-6 && w.startPoint.y < 0.01)!;
      expect(tabique.startPoint.y).toBeCloseTo(0, 9);
      expect(tabique.endPoint.y).toBeCloseTo(3, 9);
      expect(tabique.endPoint.x).toBeCloseTo(2, 6); // el snap angular lo dejó vertical
    });

    it('arrastrar un extremo hasta el eje de otro muro lo deja en T', async () => {
      await drawRectangle();
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(2, 0, 2, 2.5); // corto: no llega al muro norte
      expect(editor.getState().rooms).toHaveLength(1);
      editor.setNodeSnapEnabled(true);
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.2), TOL_PX);
      expect(editor.beginDrag(px(2), px(2.5), TOL_PX)).toBe(true);
      await editor.endDrag(px(2.03), px(2.93));
      expect(editor.getState().rooms).toHaveLength(2);
    });

    it('Vano en planta: abre un hueco genérico en el muro tocado, se ve en planta y se deshace', async () => {
      await drawRectangle();
      editor.setTool('opening');
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.getState().genericOpenings).toHaveLength(1);
      const o = editor.getState().genericOpenings[0];
      expect(o.width).toBeCloseTo(0.8);
      expect(o.xOffset).toBeCloseTo(1.6);
      await editor.undo();
      expect(editor.getState().genericOpenings).toHaveLength(0);
      await editor.redo();
      expect(editor.getState().genericOpenings).toHaveLength(1);
    });

    it('Foto en alzado: se ancla a la cara del muro y aparece en planta sobre su eje', async () => {
      await drawRectangle();
      const wall = editor.walls.find((w) => w.startPoint.y === 0 && w.endPoint.y === 0)!;
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1]),
        filename: 'foto-cara.jpg',
        metadata: { bimCode: 'FOT009' },
      });
      await editor.attachFacePhoto(captured.photoId, { wallId: wall.id as string, side: 'B', x: 1, y: 1.2 });
      const m = editor.getState().photoMarkers.find((p) => p.id === (captured.photoId as string))!;
      expect(m.face).toEqual({ wallId: wall.id, side: 'B', x: 1, y: 1.2 });
      const len = wall.length as number;
      const t = 1 / len;
      expect(m.position.x).toBeCloseTo(wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t);
      expect(m.position.y).toBeCloseTo(0);
      const photo = await services.store.readAuditPhoto(captured.photoId);
      expect(photo!.metadata.linkedObjectId).toBe(wall.id);
    });

    it('snap a vértice (esquina interior del recinto) y a punto medio de muro, solo si están activos', async () => {
      await drawRectangle();
      const room = editor.getState().rooms[0];
      const corner = (room.netPolygon ?? room.polygon).reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best));
      const near = { x: corner.x + 0.02, y: corner.y + 0.02 };
      expect(editor.snapToNode(px(near.x), px(near.y), TOL_PX).snapped).toBe(false);
      editor.setExtraSnaps({ vertex: true, midpoint: false });
      const v = editor.snapToNode(px(near.x), px(near.y), TOL_PX);
      expect(v.snapped).toBe(true);
      expect(v.point.x).toBeCloseTo(corner.x);
      expect(v.point.y).toBeCloseTo(corner.y);
      editor.setExtraSnaps({ vertex: false, midpoint: true });
      const m = editor.snapToNode(px(2.03), px(0.02), TOL_PX);
      expect(m.snapped).toBe(true);
      expect(m.point).toEqual({ x: 2, y: 0 });
    });

    it('Suelo fuera de un recinto avisa y no crea nada', async () => {
      await drawRectangle();
      editor.setTool('floor');
      await editor.handleTap(px(8), px(8), TOL_PX);
      expect(editor.getState().objects.some((o) => o.type === 'Floor')).toBe(false);
      expect(editor.getState().notice?.kind).toBe('info');
    });

    it('tocar dentro de un recinto lo selecciona; tocar un muro selecciona el muro', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      expect(editor.getState().selectedZoneId).toBe(editor.getState().rooms[0].id);
      expect(editor.selectedZone?.name).toBe('Recinto 1');
      await editor.handleTap(px(2), px(0), TOL_PX);
      expect(editor.getState().selectedZoneId).toBeNull();
      expect(editor.getState().selectedId).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Niveles y fases
  // -------------------------------------------------------------------------

  describe('niveles y fases', () => {
    const levels = (active: string, underlay: string[] = []) => ({
      active,
      base: 'L0',
      all: new Set(['L0', 'L1', 'L2']),
      underlay: new Set(underlay),
      elevations: new Map([['L0', 0], ['L1', 3], ['L2', 6]]),
    });
    const phases = (active: string) => ({
      active,
      base: 'F0',
      all: new Set(['F0', 'F1']),
      order: new Map([['F0', 0], ['F1', 1]]),
    });

    it('lo creado nace en el nivel y la fase activos', async () => {
      editor.setScope(levels('L1'), phases('F1'));
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 3, 0);
      const stored = (await services.store.listObjects(ROOM_ID)).find((o): o is Wall => o instanceof Wall)!;
      expect(stored.properties.levelMarkerId).toBe('L1');
      expect(stored.properties.phaseId).toBe('F1');
    });

    it('solo se ve y se toca el nivel activo; otro nivel puede quedar como calco', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(levels('L0'), null);
      await drawWall(0, 0, 3, 0);
      editor.setScope(levels('L1', ['L0']), null);
      await editor.reload();

      expect(editor.walls).toHaveLength(0);
      expect(editor.underlayObjects).toHaveLength(1);
      editor.setTool('select');
      await editor.handleTap(px(1.5), px(0), TOL_PX);
      expect(editor.getState().selectedId).toBeNull();
    });

    it('lo que no tiene nivel (levantado antes) pertenece a la base', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 3, 0); // sin alcance: sin levelId
      editor.setScope(levels('L0'), null);
      await editor.reload();
      expect(editor.walls).toHaveLength(1);
    });

    it('lo creado en una fase posterior no se ve desde una anterior', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(null, phases('F1'));
      await drawWall(0, 0, 3, 0);
      editor.setScope(null, phases('F0'));
      await editor.reload();
      expect(editor.walls).toHaveLength(0);
    });

    it('el muro nace con las restricciones del selector de base y tope', async () => {
      editor.setScope(levels('L1'), phases('F0'));
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setCreationVertical({ wall: uniformWall(extent({ baseLevelId: 'L1', topLevelId: 'L2', unconnectedHeight: 2.8 })) });
      await drawWall(0, 0, 3, 0);
      const stored = (await services.store.listObjects(ROOM_ID)).find((o): o is Wall => o instanceof Wall)!;
      expect(stored.vertical?.start.topLevelId).toBe('L2');
      expect(Number(stored.height)).toBeCloseTo(3);
      expect(stored.properties.levelMarkerId).toBe('L1');
      expect(editor.walls).toHaveLength(1);
    });

    it('punto a punto: cada extremo con su base y tope (perfil no rectangular)', async () => {
      editor.setScope(levels('L0'), null);
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setCreationMethod('wall', 'points');
      editor.setCreationVertical({
        wall: {
          start: extent({ baseLevelId: 'L0', topLevelId: 'L1', unconnectedHeight: 3 }),
          end: extent({ baseLevelId: 'L0', topLevelId: 'L2', unconnectedHeight: 3 }),
        },
      });
      editor.setTool('wall');
      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);
      const w = editor.walls[0];
      const p = editor.wallProfile(w);
      expect(p.start.top).toBeCloseTo(3);
      expect(p.end.top).toBeCloseTo(6);
      expect(Number(w.height)).toBeCloseTo(6);
    });

    it('rechaza un tope por debajo de la base y no crea nada', async () => {
      editor.setScope(levels('L1'), null);
      editor.setCreationVertical({
        wall: uniformWall(extent({ baseLevelId: 'L1', topLevelId: 'L0', unconnectedHeight: 3 })),
      });
      await drawWall(0, 0, 3, 0);
      expect(editor.getState().notice?.kind).toBe('error');
      expect((await services.store.listObjects(ROOM_ID)).some((o) => o instanceof Wall)).toBe(false);
    });

    it('un muro de varios pisos se ve (y se toca) en cada planta que corta', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(levels('L0'), null);
      editor.setCreationVertical({ wall: uniformWall(extent({ baseLevelId: 'L0', topLevelId: 'L2', unconnectedHeight: 3 })) });
      await drawWall(0, 0, 3, 0);
      editor.setCreationVertical({ wall: uniformWall(extent({ baseLevelId: 'L0', topLevelId: 'L1', unconnectedHeight: 3 })) });
      await drawWall(0, 2, 3, 2);

      editor.setScope(levels('L1'), null);
      await editor.reload();
      expect(editor.walls).toHaveLength(1); // solo el que sube hasta L2
      editor.setScope(levels('L2'), null);
      await editor.reload();
      expect(editor.walls).toHaveLength(0);
    });

    it('la puerta sigue al muro: se ve en las plantas donde se ve su muro', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(levels('L0'), null);
      editor.setCreationVertical({ wall: uniformWall(extent({ baseLevelId: 'L0', topLevelId: 'L2', unconnectedHeight: 3 })) });
      await drawWall(0, 0, 4, 0);
      editor.setTool('door');
      await editor.handleTap(px(2), px(0), TOL_PX);
      editor.setScope(levels('L1'), null);
      await editor.reload();
      expect(editor.scopedObjects.some((o) => o instanceof Door)).toBe(true);
    });

    it('editar las restricciones de un muro es un paso de deshacer, y rehacer lo reaplica', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(levels('L0'), null);
      await drawWall(0, 0, 3, 0); // de antes: altura desconectada 2.8
      editor.setTool('select');
      await editor.handleTap(px(1.5), px(0), TOL_PX);
      const ok = await editor.updateSelectedVertical(
        uniformWall(extent({ baseLevelId: 'L0', topLevelId: 'L1', topOffset: 0.2, unconnectedHeight: 2.8 })),
      );
      expect(ok).toBe(true);
      const read = async () => (await services.store.listObjects(ROOM_ID)).find((o): o is Wall => o instanceof Wall)!;
      expect(Number((await read()).height)).toBeCloseTo(3.2);

      await editor.undo();
      expect((await read()).vertical).toBeUndefined();
      expect(Number((await read()).height)).toBeCloseTo(2.8);
      await editor.redo();
      expect((await read()).vertical?.start.topOffset).toBeCloseTo(0.2);
      expect(Number((await read()).height)).toBeCloseTo(3.2);
    });

    it('una columna nace con su base y tope', async () => {
      editor.setScope(levels('L1'), null);
      editor.setCreationVertical({ column: extent({ baseLevelId: 'L1', topLevelId: 'L2', unconnectedHeight: 2.8 }) });
      editor.setTool('column');
      await editor.handleTap(px(1), px(1), TOL_PX);
      const col = editor.getState().objects.find((o): o is Column => o instanceof Column)!;
      expect(col.vertical?.topLevelId).toBe('L2');
      expect(Number(col.height)).toBeCloseTo(3);
      expect(editor.scopedObjects).toContain(col);
    });

    it('lo de una fase anterior se marca como existente', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      editor.setScope(null, phases('F0'));
      await drawWall(0, 0, 3, 0);
      editor.setScope(null, phases('F1'));
      await drawWall(0, 2, 3, 2);
      await editor.reload();
      const existing = editor.existingIds;
      expect(existing.size).toBe(1);
      const old = editor.walls.find((w) => w.startPoint.y === 0)!;
      expect(existing.has(old.id as string)).toBe(true);
    });

    it('el recinto que se guarda es el de la base, aunque se esté trazando en otro nivel', async () => {
      editor.setScope(levels('L1'), null);
      await drawRectangle();
      expect(editor.getState().rooms).toHaveLength(1); // se ve en el nivel activo
      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry).toHaveLength(0); // pero no reescribe el de la base
    });
  });

  describe('vista girada', () => {
    it('girar la vista mantiene el pivote y se sigue seleccionando donde se toca', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);
      editor.setTool('select');
      const before = editor.screenToWorld(200, 150);
      editor.setRotation(Math.PI / 2, 200, 150);
      const after = editor.screenToWorld(200, 150);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      // El centro del muro (2, 0) cae donde lo dibuja la vista girada.
      const p = editor.worldToScreen({ x: 2, y: 0 });
      await editor.handleTap(p.x, p.y, TOL_PX);
      expect(editor.getState().selectedId).not.toBeNull();
      // Encuadrar conserva el giro.
      editor.zoomToFit(400, 300);
      expect(editor.getState().transform.rotation).toBeCloseTo(Math.PI / 2);
    });
  });

  // -------------------------------------------------------------------------
  // Medición
  // -------------------------------------------------------------------------

  describe('medición', () => {
    it('la herramienta medir elige el muro destino', async () => {
      await drawRectangle();
      editor.setTool('measure');

      await editor.handleTap(px(2), px(0), TOL_PX);

      expect(editor.getState().measureTargetId).not.toBeNull();
    });

    it('sin muro destino, no persiste nada y lo dice', async () => {
      const result = await editor.captureMeasurement('manual', meters(3.2));

      expect(result).toBeNull();
      expect(editor.getState().notice?.message).toContain('Elige primero el muro');
    });

    it('persiste una medición manual contra el muro elegido', async () => {
      // GAP CERRADO: la pantalla medía por BLE y solo pintaba el número; nada
      // llegaba nunca a la tabla `measurements`.
      await drawRectangle();
      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);

      const average = await editor.captureMeasurement('manual', meters(3.97));

      expect(Number(average)).toBeCloseTo(3.97);
      const stored = await services.store.listMeasurements(ROOM_ID);
      expect(stored).toHaveLength(1);
    });

    it('persiste una ráfaga BLE ya capturada sin volver a pedirla al láser', async () => {
      await drawRectangle();
      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);

      const average = await editor.captureMeasurement('ble', undefined, [4.0, 4.01, 3.99, 4.0, 4.02, 3.98, 4.0]);

      expect(Number(average)).toBeCloseTo(4.0, 2);
      expect(await services.store.listMeasurements(ROOM_ID)).toHaveLength(1);
    });

    it('aplicar la medición corrige la longitud del muro conservando su dirección', async () => {
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await drawWall(0, 0, 4, 0);

      editor.setTool('measure');
      await editor.handleTap(px(2), px(0), TOL_PX);
      await editor.applyMeasurementToWall(meters(3.87));

      const wall = editor.walls[0];
      expect(Number(wall.length)).toBeCloseTo(3.87);
      expect(wall.endPoint.y).toBeCloseTo(0);
    });
  });

  // -------------------------------------------------------------------------
  // Fotos de campo (SPDS)
  // -------------------------------------------------------------------------

  describe('fotos ancladas a la planta', () => {
    it('la herramienta foto fija el punto de captura sin abrir nada por su cuenta', async () => {
      // El controlador es lógica pura: no conoce expo-camera. Deja la intención
      // y la vista reacciona.
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      expect(editor.getState().pendingPhotoPoint).toEqual({ x: 2, y: 1.5 });
    });

    it('cancelar la cámara descarta el punto pendiente', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      editor.clearPendingPhotoPoint();
      expect(editor.getState().pendingPhotoPoint).toBeNull();
    });

    it('deshacer la captura quita el marcador y rehacer lo devuelve', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1, 2, 3]),
        filename: 'foto-undo.jpg',
      });
      await editor.attachPhotoMarker(captured.photoId);
      expect(editor.getState().canUndo).toBe(true);

      await editor.undo();
      expect(editor.getState().photoMarkers).toHaveLength(0);

      await editor.redo();
      expect(editor.getState().photoMarkers).toHaveLength(1);
    });

    it('anclar una foto la coloca como marcador en la planta', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);

      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1, 2, 3]),
        filename: 'foto-1.jpg',
        metadata: { bimCode: 'FOT001' },
      });
      await editor.attachPhotoMarker(captured.photoId, 45);

      const markers = editor.getState().photoMarkers;
      expect(markers).toHaveLength(1);
      expect(markers[0].position).toEqual({ x: 2, y: 1.5 });
      expect(markers[0].direction).toBe(45);
      expect(markers[0].label).toBe('FOT001');
      expect(editor.getState().pendingPhotoPoint).toBeNull();
    });

    it('el marcador se persiste en la metadata de la foto', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(1), px(1), TOL_PX);
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1]),
        filename: 'foto-2.jpg',
      });
      await editor.attachPhotoMarker(captured.photoId);

      const photo = await services.store.readAuditPhoto(captured.photoId);
      expect(photo!.metadata.marker?.position).toEqual({ x: 1, y: 1 });
    });

    it('anclar sin punto pendiente no hace nada', async () => {
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1]),
        filename: 'foto-3.jpg',
      });
      await editor.attachPhotoMarker(captured.photoId);

      expect(editor.getState().photoMarkers).toHaveLength(0);
    });

    it('photoMarkerAt encuentra el marcador bajo el dedo', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1]),
        filename: 'foto-4.jpg',
      });
      await editor.attachPhotoMarker(captured.photoId);

      expect(editor.photoMarkerAt(px(2.05), px(1.52), TOL_PX)).not.toBeNull();
      expect(editor.photoMarkerAt(px(8), px(8), TOL_PX)).toBeNull();
    });

    it('un marcador oculto no se dibuja pero sigue existiendo', async () => {
      editor.setTool('photo');
      await editor.handleTap(px(2), px(1.5), TOL_PX);
      const captured = await services.useCases.capturePhoto.execute({
        roomId: ROOM_ID,
        photoData: new Uint8Array([1]),
        filename: 'foto-5.jpg',
      });
      await editor.attachPhotoMarker(captured.photoId);

      const photo = await services.store.readAuditPhoto(captured.photoId);
      photo!.patchMetadata({ marker: { ...photo!.metadata.marker!, visible: false } });
      await services.store.updateAuditPhoto(captured.photoId, {
        metadata_json: photo!.metadata_json,
      });
      await editor.reloadPhotoMarkers();

      expect(editor.getState().photoMarkers).toHaveLength(0);
      expect(await services.store.readAuditPhoto(captured.photoId)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Viewport
  // -------------------------------------------------------------------------

  describe('viewport', () => {
    it('el zoom deja quieto el punto mundo bajo el dedo', () => {
      // Sin compensación de punto focal, el dibujo "se escapa" bajo los dedos
      // al hacer pinch — el bug que LevON tuvo que arreglar dos veces.
      const focalX = 180;
      const focalY = 120;
      const worldBefore = editor.screenToWorld(focalX, focalY);

      editor.zoomAround(focalX, focalY, 2.5);

      const worldAfter = editor.screenToWorld(focalX, focalY);
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    });

    it('el zoom respeta los límites de escala', () => {
      editor.zoomAround(100, 100, 1000);
      expect(editor.getState().transform.scale).toBeLessThanOrEqual(500);

      editor.zoomAround(100, 100, 0.00001);
      expect(editor.getState().transform.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    });

    it('zoomToFit encuadra el dibujo dentro del viewport', async () => {
      await drawRectangle();

      editor.zoomToFit(400, 300, 20);

      // Las cuatro esquinas del rectángulo tienen que caer dentro del viewport.
      for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]) {
        const s = editor.worldToScreen(p);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(400);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(300);
      }
    });

    it('zoomToFit sobre un lienzo vacío centra el origen en vez de dividir por cero', () => {
      editor.zoomToFit(400, 300);
      const origin = editor.worldToScreen({ x: 0, y: 0 });
      expect(origin.x).toBeCloseTo(200);
      expect(origin.y).toBeCloseTo(150);
    });
  });

  // -------------------------------------------------------------------------
  // Suscripción
  // -------------------------------------------------------------------------

  describe('suscripción', () => {
    it('notifica a los suscriptores en cada cambio y deja de hacerlo al desuscribir', async () => {
      const seen: number[] = [];
      const unsubscribe = editor.subscribe((s) => seen.push(s.objects.length));

      editor.setTool('column');
      await editor.handleTap(px(1), px(1), TOL_PX);
      const countWhileSubscribed = seen.length;
      expect(countWhileSubscribed).toBeGreaterThan(0);

      unsubscribe();
      editor.setTool('select');
      expect(seen.length).toBe(countWhileSubscribed);
    });

    it('clearNotice borra el aviso para que la vista no lo repita', async () => {
      editor.setTool('door');
      await editor.handleTap(px(20), px(20), TOL_PX);
      expect(editor.getState().notice).not.toBeNull();

      editor.clearNotice();
      expect(editor.getState().notice).toBeNull();
    });
  });
});
