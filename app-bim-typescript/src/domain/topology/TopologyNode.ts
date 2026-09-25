// =============================================================================
// TopologyNode.ts — Nodo del grafo topológico de muros
// Portado de LevON: lib/core/geometry/topology/topology_node.dart
// =============================================================================

import { Point2D } from '../geometry/types';

let _nodeCounter = 0;

/**
 * Punto de conexión donde convergen uno o más muros.
 *
 * Las aristas se referencian por ID (no por objeto) para poder resolverlas en
 * un `Map<string, TopologyEdge>` y evitar ciclos de referencia que romperían
 * cualquier serialización o inspección del grafo.
 *
 * Dos nodos son "el mismo punto" si distan menos que la `snapTolerance` del
 * grafo. Esa comparación la hace TopologyGraph mediante SpatialHash — no este
 * objeto, que no conoce la tolerancia.
 */
export class TopologyNode {
  readonly id: string;
  readonly position: Point2D;

  /** IDs de aristas conectadas. Mutable mientras se construye el grafo. */
  readonly connectedEdgeIds: string[] = [];

  constructor(params: { position: Point2D; id?: string }) {
    this.position = params.position;
    this.id = params.id ?? `n${(_nodeCounter++).toString(36)}-${Date.now().toString(36)}`;
  }

  /**
   * Clave determinista por coordenada, a resolución de 0.1 mm.
   *
   * Independiente del `id`: sirve para depurar y para claves de aristas
   * dirigidas donde dos nodos distintos en la misma posición deben colisionar
   * a propósito. 10 000 unidades/metro sobra para BIM arquitectónico, donde la
   * precisión requerida es el milímetro.
   */
  get coordinateKey(): string {
    return `${Math.round(this.position.x * 10000)}_${Math.round(this.position.y * 10000)}`;
  }

  toString(): string {
    return `TopologyNode(${this.id}, pos=${this.position.x.toFixed(3)},${this.position.y.toFixed(3)})`;
  }
}
