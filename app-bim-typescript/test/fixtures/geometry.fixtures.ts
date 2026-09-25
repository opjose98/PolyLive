// =============================================================================
// geometry.fixtures.ts — Fixtures geométricos reutilizables
// Basado en: lista-14-fixtures.md (#1 room-1, #2 wall-1..4, #8 polygon-complex,
//            #9 point-array-100), tests-geometría-core.md (casos CDT), y
//            formato-fixture.md (convención createFixture{Name}()).
//
// Estos fixtures NO tocan SQLite ni ningún store — son datos puros de dominio,
// listos para usarse directamente en unit tests de domain/geometry/* o como
// base para fixtures compuestos de más alto nivel (ver room-scenarios.fixtures.ts).
// =============================================================================

import { Point2D, Polygon, meters } from '../../src/domain/geometry/types';
import { Room, Wall, revitObjectId, roomId, levelId } from '../../src/domain/objects';

// ---------------------------------------------------------------------------
// IDs compartidos — para que geometry/bim/photo fixtures puedan referenciarse
// entre sí sin duplicar strings mágicos.
// ---------------------------------------------------------------------------

/** roomId de room-1 (rectángulo simple 4m × 3m). */
export const ROOM_1_ID = roomId('room-1');

/** levelId por defecto usado por todos los fixtures de Room. */
export const LEVEL_1_ID = levelId('level-1');

/** roomId de room-L (forma en L, 6 vértices). */
export const ROOM_L_ID = roomId('room-L');

// ---------------------------------------------------------------------------
// 1. room-1 — rectángulo simple 4m × 3m (área esperada = 12 m²)
// ---------------------------------------------------------------------------

/**
 * room-1: rectángulo 4m × 3m sin vanos ni columnas.
 * INVARIANTE Room: id === roomId (verificado en validación) — aquí ambos son 'room-1'.
 */
export function createFixtureRoom1(overrides?: { isOpen?: boolean; isClosed?: boolean }): Room {
  return new Room({
    id: revitObjectId('room-1'),
    roomId: ROOM_1_ID,
    levelId: LEVEL_1_ID,
    geometry: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
    isClosed: overrides?.isClosed ?? true,
    isOpen: overrides?.isOpen ?? true,
  });
}

// ---------------------------------------------------------------------------
// 2. wall-1..4 — los 4 muros perimetrales de room-1
// ---------------------------------------------------------------------------

/** wall-1: lado inferior de room-1, (0,0) → (4,0). */
export function createFixtureWall1(): Wall {
  return new Wall({
    id: revitObjectId('wall-1'),
    roomId: ROOM_1_ID,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 4, y: 0 },
    thickness: meters(0.15),
    height: meters(2.8),
    material: 'concreto',
  });
}

/** wall-2: lado derecho de room-1, (4,0) → (4,3). */
export function createFixtureWall2(): Wall {
  return new Wall({
    id: revitObjectId('wall-2'),
    roomId: ROOM_1_ID,
    startPoint: { x: 4, y: 0 },
    endPoint: { x: 4, y: 3 },
    thickness: meters(0.15),
    height: meters(2.8),
    material: 'concreto',
  });
}

/** wall-3: lado superior de room-1, (4,3) → (0,3). */
export function createFixtureWall3(): Wall {
  return new Wall({
    id: revitObjectId('wall-3'),
    roomId: ROOM_1_ID,
    startPoint: { x: 4, y: 3 },
    endPoint: { x: 0, y: 3 },
    thickness: meters(0.15),
    height: meters(2.8),
    material: 'concreto',
  });
}

/** wall-4: lado izquierdo de room-1, (0,3) → (0,0). Cierra el perímetro. */
export function createFixtureWall4(): Wall {
  return new Wall({
    id: revitObjectId('wall-4'),
    roomId: ROOM_1_ID,
    startPoint: { x: 0, y: 3 },
    endPoint: { x: 0, y: 0 },
    thickness: meters(0.15),
    height: meters(2.8),
    material: 'concreto',
  });
}

/** Los 4 muros perimetrales de room-1, en orden (útil para CloseRoomUseCase, exports, etc.). */
export function createFixtureWalls1to4(): [Wall, Wall, Wall, Wall] {
  return [createFixtureWall1(), createFixtureWall2(), createFixtureWall3(), createFixtureWall4()];
}

// ---------------------------------------------------------------------------
// room-L — forma en L (6 vértices, ángulo de 90°) — tests-geometría-core.md caso 2
// ---------------------------------------------------------------------------

/** room-L: Recinto en forma de L, sin huecos internos. Área esperada = 27 m². */
export function createFixtureRoomLShape(): Room {
  return new Room({
    id: revitObjectId('room-L'),
    roomId: ROOM_L_ID,
    levelId: LEVEL_1_ID,
    geometry: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 6 },
      { x: 0, y: 6 },
    ],
    isClosed: true,
    isOpen: true,
  });
}

// ---------------------------------------------------------------------------
// 8. polygon-complex — forma en U para CDT stress test (8 vértices, 2 entrantes)
// tests-geometría-core.md caso 3 (U-Shape)
// ---------------------------------------------------------------------------

/**
 * Polígono en forma de U con una escotadura rectangular en el borde superior.
 * 8 vértices, 2 entrantes (vertices cóncavos) — usado para stress-test del CDT.
 */
export function createFixturePolygonComplex(): Polygon {
  return {
    vertices: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ],
    isClosed: true,
  };
}

// ---------------------------------------------------------------------------
// 9. point-array-100 — 100 puntos para stress-test de snap angular
// ---------------------------------------------------------------------------

/**
 * 100 puntos distribuidos en un círculo de radio 10m — usado para medir el
 * rendimiento de snapToNearestAngle/SnapHandler sobre volúmenes grandes de puntos.
 */
export function createFixturePointArray100(): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * 2 * Math.PI;
    points.push({
      x: Math.cos(angle) * 10,
      y: Math.sin(angle) * 10,
    });
  }
  return points;
}
