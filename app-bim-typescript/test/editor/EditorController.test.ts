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

  /** Traza un rectángulo de 4×3 m con la herramienta de muro. */
  async function drawRectangle(): Promise<void> {
    editor.setTool('wall');
    editor.setSnapEnabled(false);
    editor.setNodeSnapEnabled(false);
    for (const [x, y] of [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]]) {
      await editor.handleTap(px(x), px(y), TOL_PX);
    }
  }

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------

  describe('init', () => {
    it('crea el Recinto si no existe y arranca con el trazo vacío', async () => {
      const room = await services.store.readObject(ROOM_OBJECT_ID);
      expect(room).toBeInstanceOf(Room);
      expect(editor.getState().vertices).toEqual([]);
    });

    it('devuelve el borrador pendiente en vez de aplicarlo por su cuenta', async () => {
      // Recuperar o descartar un trazo es una decisión del operador: el
      // controlador la ofrece, no la toma.
      await services.useCases.saveRoomDraft.execute({
        roomId: ROOM_ID,
        vertices: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
        isClosed: false,
      });

      const fresh = new EditorController({ services, roomId: ROOM_ID, roomObjectId: ROOM_OBJECT_ID });
      const draft = await fresh.init();

      expect(draft?.hasDraft).toBe(true);
      expect(draft?.vertices).toHaveLength(2);
      expect(fresh.getState().vertices).toEqual([]); // todavía NO aplicado
    });

    it('acceptDraft aplica los vértices del borrador al trazo activo', async () => {
      await services.useCases.saveRoomDraft.execute({
        roomId: ROOM_ID,
        vertices: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
        isClosed: false,
      });

      const fresh = new EditorController({ services, roomId: ROOM_ID, roomObjectId: ROOM_OBJECT_ID });
      const draft = await fresh.init();
      await fresh.acceptDraft(draft!.draftId, draft!.vertices);

      expect(fresh.getState().vertices).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: muro
  // -------------------------------------------------------------------------

  describe('herramienta muro', () => {
    it('el primer tap solo añade un vértice; el segundo crea el muro', async () => {
      editor.setTool('wall');
      await editor.handleTap(px(0), px(0), TOL_PX);
      expect(editor.walls).toHaveLength(0);
      expect(editor.getState().vertices).toHaveLength(1);

      await editor.handleTap(px(4), px(0), TOL_PX);
      expect(editor.walls).toHaveLength(1);
      expect(editor.getState().vertices).toHaveLength(2);
    });

    it('traza un rectángulo cerrado de 4 muros', async () => {
      await drawRectangle();
      expect(editor.walls).toHaveLength(4);
      expect(editor.getState().vertices).toHaveLength(5);
    });

    it('mantiene Room.geometry y el borrador sincronizados con el trazo', async () => {
      // CloseRoomUseCase triangula Room.geometry, NO los muros: si las dos
      // cosas divergen, el área calculada no corresponde a lo dibujado.
      await drawRectangle();

      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry).toHaveLength(5);

      const draft = await services.useCases.recoverRoomDraft.execute({ roomId: ROOM_ID });
      expect(draft.hasDraft).toBe(true);
      if (draft.hasDraft) expect(draft.vertices).toHaveLength(5);
    });

    it('el snap a nodo pega un vértice nuevo al extremo existente más cercano', async () => {
      editor.setTool('wall');
      editor.setNodeSnapEnabled(true);
      editor.setSnapEnabled(false);

      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);
      await editor.handleTap(px(4), px(3), TOL_PX);
      // Cerrar el trazo tocando a 5 cm del nodo inicial (0,0): dentro de la
      // tolerancia de 22px/100 = 22cm. Es el gesto que cierra la topología y
      // evita la "fuga de recinto" por dos nodos casi coincidentes.
      await editor.handleTap(px(0.05), px(0.05), TOL_PX);

      expect(editor.getState().vertices[3]).toEqual({ x: 0, y: 0 });
    });

    it('un doble toque sobre el último vértice no intenta crear un muro degenerado', async () => {
      editor.setTool('wall');
      editor.setNodeSnapEnabled(true);

      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);
      // Segundo toque sobre el mismo nodo: el snap lo pega a (4,0), que ya es
      // el último vértice. Debe ignorarse, no fallar con un error rojo.
      await editor.handleTap(px(4.02), px(0.02), TOL_PX);

      expect(editor.walls).toHaveLength(1);
      expect(editor.getState().vertices).toHaveLength(2);
      expect(editor.getState().notice?.kind).toBe('info');
    });
  });

  // -------------------------------------------------------------------------
  // Herramienta: selección
  // -------------------------------------------------------------------------

  describe('herramienta selección', () => {
    it('toca un muro y lo selecciona', async () => {
      await drawRectangle();
      editor.setTool('select');

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

    it('borrar un muro recorta el trazo para que no quede describiendo un polígono fantasma', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);

      await editor.deleteSelected();

      expect(editor.walls).toHaveLength(3);
      // El trazo ya no puede seguir teniendo los 5 vértices del rectángulo:
      // se deriva de los muros que quedan vivos.
      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry.length).toBe(editor.getState().vertices.length);
      expect(editor.getState().vertices.length).toBeLessThan(5);
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

    it('un valor inválido deja el objeto intacto y publica un error legible', async () => {
      await drawRectangle();
      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);
      const id = editor.getState().selectedId!;

      await editor.updateSelectedProperty('thickness', meters(-1));

      const reread = (await services.store.readObject(id)) as Wall;
      expect(reread.thickness).toBeCloseTo(0.15);
      expect(editor.getState().notice?.kind).toBe('error');
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
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);

      editor.setTool('select');
      await editor.handleTap(px(2), px(0), TOL_PX);

      expect(editor.beginDrag(px(4), px(0), TOL_PX)).toBe(true);
      await editor.endDrag(px(5), px(0));

      expect(editor.walls[0].endPoint.x).toBeCloseTo(5);
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
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);
      await editor.handleTap(px(4), px(3), TOL_PX);
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
    it('deshacer quita el último muro y su vértice a la vez', async () => {
      await drawRectangle();
      expect(editor.getState().vertices).toHaveLength(5);

      await editor.undo();

      expect(editor.walls).toHaveLength(3);
      expect(editor.getState().vertices).toHaveLength(4);
    });

    it('rehacer restaura muro y vértice, dejando ambos de nuevo alineados', async () => {
      await drawRectangle();
      await editor.undo();
      await editor.redo();

      expect(editor.walls).toHaveLength(4);
      expect(editor.getState().vertices).toHaveLength(5);
    });

    it('un trazo nuevo después de deshacer descarta el futuro', async () => {
      await drawRectangle();
      await editor.undo();

      editor.setTool('wall');
      await editor.handleTap(px(1), px(1), TOL_PX);
      await editor.redo(); // no debe resucitar el vértice descartado

      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry.length).toBe(editor.getState().vertices.length);
    });
  });

  // -------------------------------------------------------------------------
  // Recintos
  // -------------------------------------------------------------------------

  describe('recintos', () => {
    it('cierra el Recinto y calcula su área', async () => {
      await drawRectangle();

      await editor.closeRoom();

      expect(editor.getState().notice?.kind).toBe('success');
      expect(editor.getState().notice?.message).toContain('12.00');
    });

    it('se niega a cerrar con menos de 3 vértices', async () => {
      editor.setTool('wall');
      await editor.handleTap(px(0), px(0), TOL_PX);

      await editor.closeRoom();

      expect(editor.getState().notice?.message).toContain('al menos 3 vértices');
    });

    it('detectRooms encuentra el rectángulo trazado', async () => {
      await drawRectangle();

      const suggestions = editor.detectRooms();

      expect(suggestions.length).toBeGreaterThan(0);
      expect(Number(suggestions[0].area)).toBeCloseTo(12, 1);
    });

    it('detectRooms sobre un trazo abierto no inventa recintos y lo dice', async () => {
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);

      const suggestions = editor.detectRooms();

      expect(suggestions).toHaveLength(0);
      expect(editor.getState().notice?.kind).toBe('info');
    });

    it('adoptar una sugerencia la convierte en el trazo activo y en Room.geometry', async () => {
      await drawRectangle();
      const [suggestion] = editor.detectRooms();

      await editor.adoptSuggestion(suggestion);

      const room = (await services.store.readObject(ROOM_OBJECT_ID)) as Room;
      expect(room.geometry).toHaveLength(suggestion.polygon.length);
      expect(editor.getState().roomSuggestions).toHaveLength(0);
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
      editor.setTool('wall');
      editor.setSnapEnabled(false);
      editor.setNodeSnapEnabled(false);
      await editor.handleTap(px(0), px(0), TOL_PX);
      await editor.handleTap(px(4), px(0), TOL_PX);

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
    it('pan desplaza el offset sin tocar la escala', () => {
      const before = editor.getState().transform;
      editor.pan(50, -30);
      const after = editor.getState().transform;

      expect(after.offsetX).toBe(before.offsetX + 50);
      expect(after.offsetY).toBe(before.offsetY - 30);
      expect(after.scale).toBe(before.scale);
    });

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
