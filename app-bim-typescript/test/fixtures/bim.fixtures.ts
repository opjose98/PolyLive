// =============================================================================
// bim.fixtures.ts — Fixtures de objetos BIM (Door, Column, Floor, Measurement)
// Basado en: lista-14-fixtures.md (#3 door-1/2, #4 column-1, #5 floor-1,
//            #6 measurement-1), formato-fixture.md.
//
// Todos referencian room-1 / wall-1 / wall-2 de geometry.fixtures.ts para que
// los tests puedan componerlos libremente (ej. crear wall-1 y luego door-1
// sobre ese mismo muro).
// =============================================================================

import { meters } from '../../src/domain/geometry/types';
import {
  Door,
  Column,
  Floor,
  Measurement,
  revitObjectId,
  wallId,
  measurementId,
} from '../../src/domain/objects';
import { ROOM_1_ID } from './geometry.fixtures';

// ---------------------------------------------------------------------------
// 3. door-1, door-2 — puertas en wall-1 y wall-2
// ---------------------------------------------------------------------------

/** door-1: puerta en wall-1 (lado inferior de room-1), abatible de madera. */
export function createFixtureDoor1(): Door {
  return new Door({
    id: revitObjectId('door-1'),
    roomId: ROOM_1_ID,
    parentWallId: wallId('wall-1'),
    offsetAlongWall: meters(1.5),
    offsetPerpendicular: meters(0),
    width: meters(0.9),
    height: meters(2.1),
    doorType: 'swing',
    material: 'madera',
  });
}

/** door-2: puerta en wall-2 (lado derecho de room-1). */
export function createFixtureDoor2(): Door {
  return new Door({
    id: revitObjectId('door-2'),
    roomId: ROOM_1_ID,
    parentWallId: wallId('wall-2'),
    offsetAlongWall: meters(1.0),
    offsetPerpendicular: meters(0),
    width: meters(0.8),
    height: meters(2.0),
    doorType: 'swing',
    material: 'madera',
  });
}

// ---------------------------------------------------------------------------
// 4. column-1 — columna en el centro de room-1 (4m × 3m → centro (2, 1.5))
// ---------------------------------------------------------------------------

/** column-1: columna libre en el centro geométrico de room-1. */
export function createFixtureColumn1(): Column {
  return new Column({
    id: revitObjectId('column-1'),
    roomId: ROOM_1_ID,
    position: { x: 2, y: 1.5 },
    diameter: meters(0.3),
    height: meters(2.8),
    material: 'hormigón',
  });
}

// ---------------------------------------------------------------------------
// 5. floor-1 — piso implícito de room-1
// ---------------------------------------------------------------------------

/** floor-1: Floor implícito, tal como lo materializaría CloseRoomUseCase para room-1. */
export function createFixtureFloor1(): Floor {
  return new Floor({
    id: revitObjectId('floor-1'),
    roomId: ROOM_1_ID,
    isImplicit: true,
    material: 'default',
  });
}

// ---------------------------------------------------------------------------
// 6. measurement-1 — medición BLE: 3.45m ± 0.05m (7 muestras)
// ---------------------------------------------------------------------------

/**
 * measurement-1: medición BLE de wall-1 con 7 muestras, promedio 3.45m ± 0.05m.
 * Las muestras están dentro de la tolerancia (sin outliers) para que el
 * cálculo de promedio (CaptureMeasurementUseCase) sea directo de verificar.
 */
export function createFixtureMeasurement1(): Measurement {
  return new Measurement({
    id: measurementId('measurement-1'),
    roomId: ROOM_1_ID,
    wallId: wallId('wall-1'),
    capture_method: 'ble',
    values_json: JSON.stringify([3.42, 3.47, 3.45, 3.44, 3.46, 3.43, 3.48]),
    average: meters(3.45),
  });
}
