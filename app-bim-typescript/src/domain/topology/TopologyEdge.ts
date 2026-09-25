// =============================================================================
// TopologyEdge.ts — Arista del grafo topológico de muros
// Portado de LevON: lib/core/geometry/topology/topology_edge.dart
// =============================================================================

import { Wall } from '../objects/wall';

let _edgeCounter = 0;

/** Tipo geométrico de la arista. */
export type EdgeGeometryType = 'line' | 'arc';

/**
 * Rol semántico BIM de la arista.
 *
 * Solo las `wall` cierran recintos. Las `partition` conectan nodos —y por
 * tanto participan del edge splitting y de la adyacencia— pero no contribuyen
 * a detectar recintos, que es justo lo que distingue un tabique de un muro
 * portante en el levantamiento.
 */
export type EdgeObjectType = 'wall' | 'partition';

/**
 * Arista del grafo, sin referencia directa a objetos nodo (solo IDs).
 *
 * `objectType` se deriva de `Wall.isStructural`; `geometryType`, de la forma
 * del eje del muro.
 */
export class TopologyEdge {
  readonly id: string;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly geometryType: EdgeGeometryType;
  readonly objectType: EdgeObjectType;

  /** Muro BIM de origen. RoomGenerator lo necesita para extraer vértices. */
  readonly sourceWall: Wall;

  constructor(params: {
    id?: string;
    startNodeId: string;
    endNodeId: string;
    geometryType: EdgeGeometryType;
    objectType: EdgeObjectType;
    sourceWall: Wall;
  }) {
    this.id = params.id ?? `e${(_edgeCounter++).toString(36)}-${Date.now().toString(36)}`;
    this.startNodeId = params.startNodeId;
    this.endNodeId = params.endNodeId;
    this.geometryType = params.geometryType;
    this.objectType = params.objectType;
    this.sourceWall = params.sourceWall;
  }

  /** Deriva `geometryType` y `objectType` a partir del muro. */
  static fromWall(params: {
    wall: Wall;
    startNodeId: string;
    endNodeId: string;
  }): TopologyEdge {
    return new TopologyEdge({
      startNodeId: params.startNodeId,
      endNodeId: params.endNodeId,
      geometryType: params.wall.shape.kind === 'arc' ? 'arc' : 'line',
      objectType: params.wall.isStructural ? 'wall' : 'partition',
      sourceWall: params.wall,
    });
  }

  /** Nodo opuesto al dado. Lanza si `nodeId` no pertenece a esta arista. */
  otherNodeId(nodeId: string): string {
    if (nodeId === this.startNodeId) return this.endNodeId;
    if (nodeId === this.endNodeId) return this.startNodeId;
    throw new Error(`nodeId ${nodeId} no pertenece a TopologyEdge ${this.id}`);
  }

  toString(): string {
    return `TopologyEdge(${this.id}, ${this.startNodeId}→${this.endNodeId}, ${this.objectType}, ${this.geometryType})`;
  }
}
