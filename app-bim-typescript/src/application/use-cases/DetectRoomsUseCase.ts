// =============================================================================
// DetectRoomsUseCase.ts — Detección automática de recintos a partir de muros
// Portado de LevON: features/rooms/application/detect_rooms_use_case.dart
//                 + features/rooms/application/room_generator.dart
// =============================================================================
//
// Pipeline: muros → TopologyGraph → ciclos mínimos → validación → sugerencias.
//
// Este caso de uso es PURO: no persiste nada. Devuelve los contornos cerrados;
// el editor los liga a recintos con identidad (application/topology/
// reconcileZones.ts) en cada recarga, y ese recinto persistido es lo que se
// nombra, se exporta (IfcSpace) y lleva suelo y avance.
// =============================================================================

import { Point2D, SquareMeters } from '../../domain/geometry/types';
import { centroid } from '../../domain/geometry/polygon-utils';
import { shapeToPolyline } from '../../domain/geometry/shapes';
import { PolygonValidator } from '../../domain/geometry/polygon-validator';
import { TopologyGraph, TopologyCycle } from '../../domain/topology/TopologyGraph';
import { TopologyEdge } from '../../domain/topology/TopologyEdge';
import { Wall } from '../../domain/objects/wall';
import { RevitObjectId } from '../../domain/objects/base';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Recinto candidato. NO es un `Room` persistido: es una propuesta. */
export interface RoomSuggestion {
  /** Vértices normalizados en orientación horaria (CW). */
  readonly polygon: Point2D[];
  readonly area: SquareMeters;
  readonly centroid: Point2D;
  /** Muros que forman el contorno, sin repetir. */
  readonly boundaryWallIds: RevitObjectId[];
}

export interface DetectRoomsInput {
  readonly walls: readonly Wall[];
  /** Tolerancia de fusión de nodos en metros. Por defecto 0.05 (5 cm). */
  readonly snapTolerance?: number;
  /** Área mínima para aceptar un candidato, en m². Por defecto 0.01. */
  readonly minArea?: number;
}

export interface DetectRoomsOutput {
  readonly suggestions: RoomSuggestion[];
  /** Ciclos hallados pero descartados, con el motivo. Útil para diagnóstico. */
  readonly rejected: Array<{ reason: string }>;
}

// ---------------------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------------------

export class DetectRoomsUseCase {
  execute(input: DetectRoomsInput): DetectRoomsOutput {
    // Un recinto necesita al menos 3 muros; por debajo no hay nada que detectar
    // y construir el grafo sería trabajo tirado.
    const structural = input.walls.filter((w) => w.isStructural && !w.is_deleted);
    if (structural.length < 3) return { suggestions: [], rejected: [] };

    const graph = new TopologyGraph({ snapTolerance: input.snapTolerance });
    graph.addWalls(structural);

    const validator = new PolygonValidator({ minArea: input.minArea });
    const suggestions: RoomSuggestion[] = [];
    const rejected: Array<{ reason: string }> = [];

    for (const cycle of graph.findMinimalCycles()) {
      const vertices = extractVertices(cycle);
      const result = validator.validate(vertices);

      if (!result.valid) {
        rejected.push({ reason: result.reason });
        continue;
      }

      suggestions.push({
        polygon: result.vertices,
        area: result.area,
        centroid: centroid(result.vertices),
        boundaryWallIds: uniqueWallIds(cycle.edges),
      });
    }

    return { suggestions, rejected };
  }
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

/**
 * Extrae los vértices del ciclo en orden de traversía.
 *
 * `fromNodeIds[i]` dice desde qué nodo se recorre `edges[i]`; comparándolo con
 * `startNodeId` se sabe si la arista va en sentido directo o inverso. Sin eso,
 * un contorno recorrido "al revés" produciría un polígono cruzado.
 *
 * Para arcos se añaden todos los puntos de aproximación MENOS el último, que
 * coincide con el primero del tramo siguiente y duplicaría el vértice.
 */
function extractVertices(cycle: TopologyCycle): Point2D[] {
  const vertices: Point2D[] = [];

  for (let i = 0; i < cycle.edges.length; i++) {
    const edge = cycle.edges[i];
    const forward = cycle.fromNodeIds[i] === edge.startNodeId;
    const shape = edge.sourceWall.shape;

    if (shape.kind === 'arc') {
      const arcPoints = shapeToPolyline(shape);
      const ordered = forward ? arcPoints : [...arcPoints].reverse();
      vertices.push(...ordered.slice(0, -1));
    } else {
      vertices.push(forward ? edge.sourceWall.startPoint : edge.sourceWall.endPoint);
    }
  }

  return vertices;
}

function uniqueWallIds(edges: readonly TopologyEdge[]): RevitObjectId[] {
  const seen = new Set<string>();
  const ids: RevitObjectId[] = [];
  for (const edge of edges) {
    const id = edge.sourceWall.id;
    const key = id as unknown as string;
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}
