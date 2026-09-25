// =============================================================================
// room-scenarios.fixtures.ts — Fixtures compuestos de Recinto (RoomFixture)
// Basado en: estrategia-testing-y-fixtures.md §2 (formato RoomFixture, lista
//            completa de fixtures de Recinto). Complementa geometry/bim/photo
//            fixtures.ts con escenarios de INTEGRACIÓN completos (Room +
//            objetos BIM), listos para cargarse en una SQLite en memoria.
//
// Alcance: se implementa el subconjunto de la lista de 14 fixtures del
// documento de estrategia que corresponde 1:1 con tipos ya existentes en
// src/domain — room-square, room-L, room-with-column, room-with-doors,
// bad-room, room-with-photos, room-with-ble-measurements. Los fixtures que
// dependen de conceptos aún no implementados en src/ (SurveyControlPoint,
// SiteCoordinateSystem, room_drafts/RecoverRoomDraftUseCase, el umbral de
// capacidad de large-room) se dejan fuera para no fabricar tipos que no
// existen en el código real — ver notas en cada sección.
// =============================================================================

import { RevitObjectBase } from '../../src/domain/objects/base';
import {
  Room,
  Wall,
  Column,
  Door,
  Floor,
  AuditPhoto,
  Measurement,
  RoomId,
  revitObjectId,
  roomId,
  wallId,
  auditPhotoId,
  measurementId,
} from '../../src/domain/objects';
import { Point2D, Meters, SquareMeters, meters, squareMeters } from '../../src/domain/geometry/types';
import { LEVEL_1_ID } from './geometry.fixtures';

// ---------------------------------------------------------------------------
// Formato estándar — estrategia-testing-y-fixtures.md §2.1
// ---------------------------------------------------------------------------

export interface RoomFixture {
  readonly room: Room;
  readonly objects: RevitObjectBase[];
  readonly expectedArea: SquareMeters | null;
  readonly expectedObjectCount: number;
  readonly description: string;
  /** Fotos de auditoría asociadas — no son RevitObjectBase, se listan aparte. */
  readonly photos?: AuditPhoto[];
  /** Mediciones BLE/manuales asociadas — no son RevitObjectBase, se listan aparte. */
  readonly measurements?: Measurement[];
}

// ---------------------------------------------------------------------------
// Helper interno — genera los muros perimetrales de un polígono cerrado
// ---------------------------------------------------------------------------

function perimeterWalls(rId: RoomId, idPrefix: string, vertices: Point2D[], thickness: Meters = meters(0.15)): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    walls.push(
      new Wall({
        id: revitObjectId(`${idPrefix}-wall-${i + 1}`),
        roomId: rId,
        startPoint: start,
        endPoint: end,
        thickness,
        height: meters(2.8),
        material: 'concreto',
      }),
    );
  }
  return walls;
}

function implicitFloor(rId: RoomId, idPrefix: string): Floor {
  return new Floor({
    id: revitObjectId(`${idPrefix}-floor-1`),
    roomId: rId,
    isImplicit: true,
    material: 'default',
  });
}

// ---------------------------------------------------------------------------
// room-square.json — rectángulo simple 4m × 3m, sin vanos ni columnas
// 4 Walls, 1 Floor implícito. Área esperada = 12 m².
// ---------------------------------------------------------------------------

export function createRoomFixtureSquare(): RoomFixture {
  const rId = roomId('room-square');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const room = new Room({
    id: revitObjectId('room-square'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: true,
    isOpen: false,
    area: squareMeters(12),
  });
  const walls = perimeterWalls(rId, 'room-square', vertices);
  const floor = implicitFloor(rId, 'room-square');

  return {
    room,
    objects: [...walls, floor],
    expectedArea: squareMeters(12),
    expectedObjectCount: 5, // 4 walls + 1 floor
    description: 'Recinto rectangular simple, sin vanos ni columnas',
  };
}

// ---------------------------------------------------------------------------
// room-L.json — forma en L, sin huecos internos
// 6 Walls, 1 Floor implícito. Área esperada = 27 m².
// ---------------------------------------------------------------------------

export function createRoomFixtureLShape(): RoomFixture {
  const rId = roomId('room-L-fixture');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 6 },
    { x: 0, y: 6 },
  ];
  const room = new Room({
    id: revitObjectId('room-L-fixture'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: true,
    isOpen: false,
    area: squareMeters(27),
  });
  const walls = perimeterWalls(rId, 'room-L-fixture', vertices);
  const floor = implicitFloor(rId, 'room-L-fixture');

  return {
    room,
    objects: [...walls, floor],
    expectedArea: squareMeters(27),
    expectedObjectCount: 7, // 6 walls + 1 floor
    description: 'Recinto en forma de L, sin huecos internos',
  };
}

// ---------------------------------------------------------------------------
// room-with-column.json — rectángulo simple + 1 columna embebida
// 4 Walls, 1 Column, 1 Floor implícito.
// ---------------------------------------------------------------------------

export function createRoomFixtureWithColumn(): RoomFixture {
  const rId = roomId('room-with-column');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const room = new Room({
    id: revitObjectId('room-with-column'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: true,
    isOpen: false,
    area: squareMeters(12),
  });
  const walls = perimeterWalls(rId, 'room-with-column', vertices);
  const column = new Column({
    id: revitObjectId('room-with-column-col-1'),
    roomId: rId,
    position: { x: 2, y: 1.5 }, // centro geométrico
    diameter: meters(0.3),
    height: meters(2.8),
    material: 'hormigón',
  });
  const floor = implicitFloor(rId, 'room-with-column');

  return {
    room,
    objects: [...walls, column, floor],
    expectedArea: squareMeters(12),
    expectedObjectCount: 6, // 4 walls + 1 column + 1 floor
    description: 'Rectángulo simple + 1 columna embebida en el centro',
  };
}

// ---------------------------------------------------------------------------
// room-with-doors.json — rectángulo con 2 puertas en muros distintos
// 4 Walls, 2 Doors, 1 Floor implícito.
// ---------------------------------------------------------------------------

export function createRoomFixtureWithDoors(): RoomFixture {
  const rId = roomId('room-with-doors');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const room = new Room({
    id: revitObjectId('room-with-doors'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: true,
    isOpen: false,
    area: squareMeters(12),
  });
  const walls = perimeterWalls(rId, 'room-with-doors', vertices);
  const door1 = new Door({
    id: revitObjectId('room-with-doors-door-1'),
    roomId: rId,
    parentWallId: wallId('room-with-doors-wall-1'),
    offsetAlongWall: meters(1.5),
    offsetPerpendicular: meters(0),
    width: meters(0.9),
    height: meters(2.1),
    doorType: 'swing',
  });
  const door2 = new Door({
    id: revitObjectId('room-with-doors-door-2'),
    roomId: rId,
    parentWallId: wallId('room-with-doors-wall-3'),
    offsetAlongWall: meters(1.0),
    offsetPerpendicular: meters(0),
    width: meters(0.8),
    height: meters(2.0),
    doorType: 'swing',
  });
  const floor = implicitFloor(rId, 'room-with-doors');

  return {
    room,
    objects: [...walls, door1, door2, floor],
    expectedArea: squareMeters(12),
    expectedObjectCount: 7, // 4 walls + 2 doors + 1 floor
    description: 'Rectángulo con 2 puertas en muros distintos',
  };
}

// ---------------------------------------------------------------------------
// bad-room.json — datos deliberadamente problemáticos
// 3 Walls, uno de ellos cruzando incorrectamente a otro (no es una esquina
// esperada). Usado para testear que la validación de cruces bloquea el caso
// (ver matriz-reglas-de-negocio.md, matriz-casos-criticos.md). Nunca cierra
// — expectedArea es null.
// ---------------------------------------------------------------------------

export function createRoomFixtureBad(): RoomFixture {
  const rId = roomId('bad-room');
  const room = new Room({
    id: revitObjectId('bad-room'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: [],
    isClosed: false,
    isOpen: true,
    area: null,
  });

  // wallA y wallB forman una esquina normal en (5,0).
  const wallA = new Wall({
    id: revitObjectId('bad-room-wall-a'),
    roomId: rId,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 5, y: 0 },
    thickness: meters(0.15),
    height: meters(2.8),
  });
  const wallB = new Wall({
    id: revitObjectId('bad-room-wall-b'),
    roomId: rId,
    startPoint: { x: 5, y: 0 },
    endPoint: { x: 5, y: 5 },
    thickness: meters(0.15),
    height: meters(2.8),
  });
  // wallC cruza wallA a mitad de su longitud (2,0) — NO es un extremo compartido,
  // es un cruce Wall-vs-Wall inválido que WallValidationService debería bloquear.
  const wallC = new Wall({
    id: revitObjectId('bad-room-wall-c'),
    roomId: rId,
    startPoint: { x: 2, y: -2 },
    endPoint: { x: 2, y: 3 },
    thickness: meters(0.15),
    height: meters(2.8),
  });

  return {
    room,
    objects: [wallA, wallB, wallC],
    expectedArea: null,
    expectedObjectCount: 3,
    description:
      'Recinto con datos deliberadamente problemáticos: wall-c cruza wall-a a mitad ' +
      'de su longitud, sin ser una esquina esperada — usado para testear bloqueo de validación',
  };
}

// ---------------------------------------------------------------------------
// room-with-photos.json — rectángulo con fotos de auditoría vinculadas
// 4 Walls, 1 Floor implícito, 3 AuditPhoto (2 audit vinculadas a Walls, 1
// context sin vincular).
// ---------------------------------------------------------------------------

export function createRoomFixtureWithPhotos(): RoomFixture {
  const rId = roomId('room-with-photos');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const room = new Room({
    id: revitObjectId('room-with-photos'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: true,
    isOpen: false,
    area: squareMeters(12),
  });
  const walls = perimeterWalls(rId, 'room-with-photos', vertices);
  const floor = implicitFloor(rId, 'room-with-photos');

  const auditPhotoWall1 = new AuditPhoto({
    id: auditPhotoId('room-with-photos-audit-1'),
    roomId: rId,
    metadata_json: JSON.stringify({
      type: 'audit',
      timestamp: 1_700_000_000_000,
      filename: 'room-with-photos-wall-1.jpg',
    }),
    linkedObjectId: walls[0].id,
  });
  const auditPhotoWall2 = new AuditPhoto({
    id: auditPhotoId('room-with-photos-audit-2'),
    roomId: rId,
    metadata_json: JSON.stringify({
      type: 'audit',
      timestamp: 1_700_000_100_000,
      filename: 'room-with-photos-wall-2.jpg',
    }),
    linkedObjectId: walls[1].id,
  });
  const contextPhoto = new AuditPhoto({
    id: auditPhotoId('room-with-photos-context-1'),
    roomId: rId,
    metadata_json: JSON.stringify({
      type: 'context',
      timestamp: 1_700_000_200_000,
      filename: 'room-with-photos-general.jpg',
    }),
  });

  return {
    room,
    objects: [...walls, floor],
    expectedArea: squareMeters(12),
    expectedObjectCount: 5, // 4 walls + 1 floor (las fotos no son RevitObjectBase)
    description: 'Recinto con fotos de auditoría vinculadas (2 audit + 1 context)',
    photos: [auditPhotoWall1, auditPhotoWall2, contextPhoto],
  };
}

// ---------------------------------------------------------------------------
// room-with-ble-measurements.json — dimensiones capturadas por BLE
// 4 Walls, cada uno con un registro en measurements (capture_method: 'ble').
// ---------------------------------------------------------------------------

export function createRoomFixtureWithBleMeasurements(): RoomFixture {
  const rId = roomId('room-with-ble');
  const vertices: Point2D[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const room = new Room({
    id: revitObjectId('room-with-ble'),
    roomId: rId,
    levelId: LEVEL_1_ID,
    geometry: vertices,
    isClosed: false,
    isOpen: true,
  });
  const walls = perimeterWalls(rId, 'room-with-ble', vertices);

  const sampleSets: number[][] = [
    [3.98, 4.02, 4.0, 4.01, 3.99, 4.0, 4.02], // wall-1 (~4.0m)
    [2.97, 3.02, 3.0, 2.99, 3.01, 3.0, 2.98], // wall-2 (~3.0m)
    [3.99, 4.01, 4.0, 4.02, 3.98, 4.0, 4.01], // wall-3 (~4.0m)
    [3.0, 2.99, 3.01, 3.0, 2.98, 3.02, 3.0], // wall-4 (~3.0m)
  ];

  const measurements = walls.map((wall, i) => {
    const samples = sampleSets[i];
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return new Measurement({
      id: measurementId(`room-with-ble-measurement-${i + 1}`),
      roomId: rId,
      wallId: wallId(wall.id as unknown as string),
      capture_method: 'ble',
      values_json: JSON.stringify(samples),
      average: meters(avg),
    });
  });

  return {
    room,
    objects: [...walls],
    expectedArea: null, // aún no cerrado
    expectedObjectCount: 4,
    description:
      'Recinto donde las dimensiones de los muros vienen de mediciones BLE reales (no manuales)',
    measurements,
  };
}
