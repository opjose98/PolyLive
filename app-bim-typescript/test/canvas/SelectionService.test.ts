// =============================================================================
// SelectionService.test.ts — Hit-testing sobre objetos BIM
// =============================================================================
//
// El hit-testing es lo que convierte el canvas de "solo dibujar" a editable:
// mover, borrar, editar propiedades y medir dependen todos de poder señalar
// un objeto ya existente. Estos tests fijan el contrato que la UI asume.
// =============================================================================

import {
  SelectionService,
  touchToleranceMeters,
} from '../../src/application/canvas/SelectionService';
import { Wall } from '../../src/domain/objects/wall';
import { Column } from '../../src/domain/objects/column';
import { Room } from '../../src/domain/objects/room';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { revitObjectId, roomId, levelId, wallId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';

const ROOM_ID = roomId('room-1');
const TOL = meters(0.2);

function makeWall(id: string, ax: number, ay: number, bx: number, by: number): Wall {
  return new Wall({
    id: revitObjectId(id),
    roomId: ROOM_ID,
    startPoint: { x: ax, y: ay },
    endPoint: { x: bx, y: by },
    thickness: meters(0.15),
    height: meters(2.8),
  });
}

describe('SelectionService — hitTest', () => {
  const service = new SelectionService();

  it('devuelve el muro cuyo eje pasa por el punto tocado', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);

    const hit = service.hitTest({
      worldPoint: { x: 2, y: 0.05 },
      objects: [wall],
      thresholdMeters: TOL,
    });

    expect(hit).toBe(wall);
  });

  it('devuelve null si el punto está fuera de la tolerancia de todo objeto', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);

    const hit = service.hitTest({
      worldPoint: { x: 2, y: 3 },
      objects: [wall],
      thresholdMeters: TOL,
    });

    expect(hit).toBeNull();
  });

  it('elige el muro MÁS CERCANO cuando dos están dentro de la tolerancia', () => {
    const near = makeWall('near', 0, 0, 4, 0);
    const far = makeWall('far', 0, 0.15, 4, 0.15);

    const hit = service.hitTest({
      worldPoint: { x: 2, y: 0.02 },
      objects: [far, near], // el más lejano primero: el orden de la lista no debe mandar
      thresholdMeters: TOL,
    });

    expect(hit).toBe(near);
  });

  it('prioriza un vano sobre su muro padre — si no, una puerta nunca sería seleccionable', () => {
    // REGRESIÓN DE DISEÑO: LevON probaba el muro primero (Wall > Column > Room).
    // Como un vano vive literalmente sobre el eje de su muro, ese orden hace
    // que el muro se coma siempre el toque y la puerta quede inalcanzable.
    const wall = makeWall('w1', 0, 0, 4, 0);
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    // x = 1.45 es el centro de la puerta (offset 1 + ancho/2).
    const hit = service.hitTest({
      worldPoint: { x: 1.45, y: 0 },
      objects: [wall, door],
      thresholdMeters: TOL,
    });

    expect(hit).toBe(door);
  });

  it('toca el muro, no el vano, en un punto del muro alejado del vano', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    const hit = service.hitTest({
      worldPoint: { x: 3.5, y: 0 },
      objects: [wall, door],
      thresholdMeters: TOL,
    });

    expect(hit).toBe(wall);
  });

  it('ignora un vano huérfano cuyo muro padre ya no está en la lista', () => {
    const orphan = new Window({
      id: revitObjectId('win1'),
      roomId: ROOM_ID,
      parentWallId: wallId('wall-borrado'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1.0),
    });

    const hit = service.hitTest({
      worldPoint: { x: 1.6, y: 0 },
      objects: [orphan],
      thresholdMeters: TOL,
    });

    expect(hit).toBeNull();
  });

  it('selecciona una columna circular por su radio más la tolerancia', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 5, y: 5 },
      diameter: meters(0.4),
      height: meters(3),
    });

    expect(
      service.hitTest({ worldPoint: { x: 5.15, y: 5 }, objects: [column], thresholdMeters: TOL }),
    ).toBe(column);

    expect(
      service.hitTest({ worldPoint: { x: 5.8, y: 5 }, objects: [column], thresholdMeters: TOL }),
    ).toBeNull();
  });

  it('respeta la rotación de una columna rectangular', () => {
    // Columna 1.0 × 0.2 girada 90°: pasa a ser 0.2 de ancho × 1.0 de alto.
    // Un punto a 0.4m EN Y debe caer dentro; el mismo a 0.4m EN X, fuera.
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 0, y: 0 },
      sectionShape: 'rectangular',
      dimensionX: meters(1.0),
      dimensionY: meters(0.2),
      rotation: Math.PI / 2,
      height: meters(3),
    });

    expect(
      service.hitTest({ worldPoint: { x: 0, y: 0.4 }, objects: [column], thresholdMeters: meters(0.01) }),
    ).toBe(column);

    expect(
      service.hitTest({ worldPoint: { x: 0.4, y: 0 }, objects: [column], thresholdMeters: meters(0.01) }),
    ).toBeNull();
  });

  it('selecciona un recinto por point-in-polygon, y solo si no hay nada encima', () => {
    const room = new Room({
      id: revitObjectId('room-1'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    });

    // Punto interior lejos de cualquier borde → el recinto.
    expect(
      service.hitTest({ worldPoint: { x: 2, y: 1.5 }, objects: [room], thresholdMeters: TOL }),
    ).toBe(room);

    // Punto exterior → nada.
    expect(
      service.hitTest({ worldPoint: { x: 9, y: 9 }, objects: [room], thresholdMeters: TOL }),
    ).toBeNull();
  });

  it('un muro dentro del recinto gana al recinto que lo contiene', () => {
    const room = new Room({
      id: revitObjectId('room-1'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    });
    const wall = makeWall('w1', 0, 1.5, 4, 1.5);

    const hit = service.hitTest({
      worldPoint: { x: 2, y: 1.5 },
      objects: [room, wall],
      thresholdMeters: TOL,
    });

    expect(hit).toBe(wall);
  });

  it('ignora un recinto con menos de 3 vértices (todavía en trazo)', () => {
    const room = new Room({
      id: revitObjectId('room-1'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    });

    expect(
      service.hitTest({ worldPoint: { x: 2, y: 0.5 }, objects: [room], thresholdMeters: TOL }),
    ).toBeNull();
  });
});

describe('SelectionService — handles', () => {
  const service = new SelectionService();

  it('un muro expone tres handles: inicio, fin y centro', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);
    const handles = service.handlesFor(wall);

    expect(handles.map((h) => h.kind)).toEqual(['start', 'end', 'center']);
    expect(handles[2].position).toEqual({ x: 2, y: 0 });
  });

  it('una columna expone un solo handle central', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 1, y: 2 },
      diameter: meters(0.4),
      height: meters(3),
    });

    expect(service.handlesFor(column)).toEqual([{ kind: 'center', position: { x: 1, y: 2 } }]);
  });

  it('un vano no expone handles — se reposiciona por propiedades, no arrastrándolo', () => {
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    expect(service.handlesFor(door)).toEqual([]);
  });

  it('hitTestHandle devuelve el handle más cercano dentro de la tolerancia ampliada', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);

    const start = service.hitTestHandle({
      worldPoint: { x: 0.05, y: 0.05 },
      selectedObject: wall,
      thresholdMeters: TOL,
    });
    expect(start?.kind).toBe('start');

    const center = service.hitTestHandle({
      worldPoint: { x: 2.02, y: 0 },
      selectedObject: wall,
      thresholdMeters: TOL,
    });
    expect(center?.kind).toBe('center');
  });

  it('hitTestHandle devuelve null lejos de todo handle', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);

    expect(
      service.hitTestHandle({
        worldPoint: { x: 1, y: 0 },
        selectedObject: wall,
        thresholdMeters: TOL,
      }),
    ).toBeNull();
  });
});

describe('SelectionService — snap a nodos', () => {
  const service = new SelectionService();

  it('encuentra el extremo de muro más cercano dentro de la tolerancia', () => {
    const walls = [makeWall('w1', 0, 0, 4, 0), makeWall('w2', 4, 0, 4, 3)];

    const node = service.findNearestNode({
      worldPoint: { x: 4.03, y: 0.02 },
      walls,
      thresholdMeters: TOL,
    });

    expect(node).toEqual({ x: 4, y: 0 });
  });

  it('devuelve null si ningún extremo está dentro de la tolerancia', () => {
    const walls = [makeWall('w1', 0, 0, 4, 0)];

    expect(
      service.findNearestNode({ worldPoint: { x: 2, y: 0 }, walls, thresholdMeters: TOL }),
    ).toBeNull();
  });
});

describe('SelectionService — geometría de vanos', () => {
  const service = new SelectionService();

  it('vanoWorldCenter coloca el vano a offset + media anchura desde el inicio del muro', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    expect(service.vanoWorldCenter(door, wall)).toEqual({ x: 1.45, y: 0 });
  });

  it('vanoWorldCenter respeta la orientación del muro y el desplazamiento perpendicular', () => {
    // Muro vertical hacia +Y: el eje local +X apunta a +Y, y la perpendicular
    // (+90°) apunta a -X. Un offsetPerpendicular de 0.1 desplaza a x = -0.1.
    const wall = makeWall('w1', 0, 0, 0, 4);
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0.1),
      width: meters(1.0),
      height: meters(2.1),
    });

    const center = service.vanoWorldCenter(door, wall)!;
    expect(center.x).toBeCloseTo(-0.1);
    expect(center.y).toBeCloseTo(1.5);
  });

  it('vanoWorldCenter devuelve null para un muro degenerado', () => {
    const wall = makeWall('w1', 2, 2, 2, 2);
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(0),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });

    expect(service.vanoWorldCenter(door, wall)).toBeNull();
  });

  it('vanosOfWall lista los vanos que cuelgan de un muro y omite los de otros', () => {
    const mine = new Door({
      id: revitObjectId('d1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });
    const other = new Window({
      id: revitObjectId('win1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w2'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1.0),
    });

    expect(service.vanosOfWall(revitObjectId('w1'), [mine, other])).toEqual([mine.id]);
  });
});

describe('touchToleranceMeters', () => {
  it('convierte píxeles a metros dividiendo por la escala', () => {
    expect(touchToleranceMeters(20, 100)).toBeCloseTo(0.2);
    expect(touchToleranceMeters(20, 50)).toBeCloseTo(0.4);
  });

  it('no divide por cero con una escala degenerada', () => {
    expect(Number.isFinite(touchToleranceMeters(20, 0))).toBe(true);
  });
});
