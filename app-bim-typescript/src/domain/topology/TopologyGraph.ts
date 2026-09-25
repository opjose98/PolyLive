// =============================================================================
// TopologyGraph.ts — Grafo de conectividad de muros y detección de ciclos
// Portado de LevON: lib/core/geometry/topology/topology_graph.dart
// =============================================================================
//
// Construye un grafo planar a partir de muros. Aporta tres cosas que PolyLive
// no tenía:
//
//   1. FUSIÓN DE NODOS — dos extremos a menos de `snapTolerance` son el mismo
//      punto. En campo, dos muros que "se tocan" nunca coinciden al milímetro.
//
//   2. EDGE SPLITTING — si un muro termina en mitad de otro (unión en T), la
//      arista atravesada se parte en dos. Sin esto, una T no cierra recinto:
//      el grafo la ve como dos elementos que se cruzan sin tocarse.
//
//   3. CICLOS MÍNIMOS — traversía de caras planares (rotation system +
//      giro más a la izquierda), que halla cada cara en O(n) en lugar de
//      enumerar ciclos por fuerza bruta.
//
// Solo las aristas `wall` (muros portantes) cierran recintos; las `partition`
// conectan nodos pero se excluyen de la detección de caras.
// =============================================================================

import { Point2D } from '../geometry/types';
import { SpatialHash } from '../geometry/spatial-hash';
import { distanceToSegment, signedArea } from '../geometry/polygon-utils';
import { lineShape } from '../geometry/shapes';
import { Wall } from '../objects/wall';
import { TopologyNode } from './TopologyNode';
import { TopologyEdge } from './TopologyEdge';

/**
 * Un ciclo detectado. `fromNodeIds[i]` es el nodo DESDE el que se atraviesa
 * `edges[i]`; sin ese dato no se puede saber si una arista se recorre en
 * sentido directo o inverso, y los vértices saldrían desordenados.
 */
export interface TopologyCycle {
  readonly edges: TopologyEdge[];
  readonly fromNodeIds: string[];
}

/** Límite de aristas por ciclo, para no colgarse en grafos degenerados. */
const MAX_CYCLE_LENGTH = 200;

const DEFAULT_SNAP_TOLERANCE = 0.05;

export class TopologyGraph {
  /** Tolerancia de fusión de nodos, en metros (coordenadas mundo). */
  readonly snapTolerance: number;

  private readonly nodes = new Map<string, TopologyNode>();
  private readonly edges = new Map<string, TopologyEdge>();
  private readonly spatialHash: SpatialHash<string>;

  constructor(params: { snapTolerance?: number } = {}) {
    this.snapTolerance = params.snapTolerance ?? DEFAULT_SNAP_TOLERANCE;
    // cellSize = 2×tolerancia garantiza que dos puntos fusionables caigan
    // siempre en celdas consultadas por queryNeighbors (ver SpatialHash).
    this.spatialHash = new SpatialHash<string>({ cellSize: this.snapTolerance * 2 });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  /** Añade un muro, reutilizando nodos existentes dentro de `snapTolerance`. */
  addWall(wall: Wall): void {
    const startNode = this.getOrCreateNode(wall.startPoint);
    this.splitEdgesAt(startNode);

    const endNode = this.getOrCreateNode(wall.endPoint);
    this.splitEdgesAt(endNode);

    // Muro degenerado: ambos extremos fusionaron al mismo nodo.
    if (startNode.id === endNode.id) return;

    // Evitar aristas paralelas entre el mismo par de nodos.
    if (this.edgeExists(startNode.id, endNode.id)) return;

    const edge = TopologyEdge.fromWall({
      wall,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
    });

    this.edges.set(edge.id, edge);
    startNode.connectedEdgeIds.push(edge.id);
    endNode.connectedEdgeIds.push(edge.id);
  }

  /** Añade varios muros en orden. */
  addWalls(walls: readonly Wall[]): void {
    for (const wall of walls) this.addWall(wall);
  }

  /**
   * Detecta todos los ciclos mínimos cerrados formados por aristas de muro.
   *
   * Usa traversía de caras planares (rotation system tipo DCEL). La cara
   * exterior —el contorno del conjunto, que siempre aparece como un ciclo más—
   * se descarta antes de devolver: es el ciclo de mayor área absoluta.
   */
  findMinimalCycles(): TopologyCycle[] {
    const wallEdges = [...this.edges.values()].filter((e) => e.objectType === 'wall');
    if (wallEdges.length < 2) return [];

    const outAngles = this.buildRotationSystem(wallEdges);
    const visitedHalfEdges = new Set<string>();
    const rawCycles: TopologyCycle[] = [];

    for (const startEdge of wallEdges) {
      for (const startFrom of [startEdge.startNodeId, startEdge.endNodeId]) {
        if (visitedHalfEdges.has(`${startEdge.id}_${startFrom}`)) continue;

        const edges: TopologyEdge[] = [];
        const fromNodeIds: string[] = [];
        let curEdgeId = startEdge.id;
        let curFrom = startFrom;
        let closed = false;

        for (let step = 0; step < MAX_CYCLE_LENGTH; step++) {
          const key = `${curEdgeId}_${curFrom}`;
          if (visitedHalfEdges.has(key)) {
            closed = step > 0;
            break;
          }
          visitedHalfEdges.add(key);

          const curEdge = this.edges.get(curEdgeId);
          if (!curEdge) break;
          edges.push(curEdge);
          fromNodeIds.push(curFrom);

          const toNode = curEdge.otherNodeId(curFrom);
          const next = this.nextHalfEdge(toNode, curEdgeId, outAngles);
          if (next === null) break;

          curEdgeId = next;
          curFrom = toNode;
        }

        if (closed && edges.length >= 3) rawCycles.push({ edges, fromNodeIds });
      }
    }

    if (rawCycles.length === 0) return [];
    if (rawCycles.length === 1) return rawCycles;

    // Descartar la cara exterior: la de mayor área absoluta.
    let maxArea = -1;
    let outerIdx = 0;
    for (let i = 0; i < rawCycles.length; i++) {
      const verts = rawCycles[i].fromNodeIds
        .map((id) => this.nodes.get(id)?.position)
        .filter((p): p is Point2D => p !== undefined);
      const a = Math.abs(signedArea(verts));
      if (a > maxArea) {
        maxArea = a;
        outerIdx = i;
      }
    }

    return rawCycles.filter((_, i) => i !== outerIdx);
  }

  // -------------------------------------------------------------------------
  // Adyacencia (encuentros, miter, propagación)
  // -------------------------------------------------------------------------

  /**
   * IDs de muros que comparten al menos un nodo con `wall`.
   *
   * Tiene en cuenta el edge splitting: los fragmentos de un muro partido
   * conservan el `sourceWall.id` original, así que se tratan como el mismo muro.
   */
  adjacentWallIds(wall: Wall): Set<string> {
    const wallNodeIds = new Set<string>();
    for (const edge of this.edges.values()) {
      if (edge.sourceWall.id === wall.id) {
        wallNodeIds.add(edge.startNodeId);
        wallNodeIds.add(edge.endNodeId);
      }
    }

    const adjacent = new Set<string>();
    for (const nodeId of wallNodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      for (const edgeId of node.connectedEdgeIds) {
        const edge = this.edges.get(edgeId);
        if (edge && edge.sourceWall.id !== wall.id) {
          adjacent.add(edge.sourceWall.id as unknown as string);
        }
      }
    }
    return adjacent;
  }

  /** Mapa global wallId → muros adyacentes, en una sola pasada. */
  wallAdjacencyMap(): Map<string, Set<string>> {
    const nodeToWalls = new Map<string, Set<string>>();
    for (const edge of this.edges.values()) {
      const wallId = edge.sourceWall.id as unknown as string;
      for (const nodeId of [edge.startNodeId, edge.endNodeId]) {
        const set = nodeToWalls.get(nodeId) ?? new Set<string>();
        set.add(wallId);
        nodeToWalls.set(nodeId, set);
      }
    }

    const adjacency = new Map<string, Set<string>>();
    for (const wallIds of nodeToWalls.values()) {
      if (wallIds.size < 2) continue;
      for (const a of wallIds) {
        for (const b of wallIds) {
          if (a === b) continue;
          const set = adjacency.get(a) ?? new Set<string>();
          set.add(b);
          adjacency.set(a, set);
        }
      }
    }
    return adjacency;
  }

  // -------------------------------------------------------------------------
  // Diagnóstico
  // -------------------------------------------------------------------------

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  /** Posición de un nodo, para inspección y tests. */
  nodePosition(nodeId: string): Point2D | undefined {
    return this.nodes.get(nodeId)?.position;
  }

  // -------------------------------------------------------------------------
  // Internos — nodos
  // -------------------------------------------------------------------------

  private getOrCreateNode(position: Point2D): TopologyNode {
    for (const nodeId of this.spatialHash.queryNeighbors(position)) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      if (Math.hypot(node.position.x - position.x, node.position.y - position.y) < this.snapTolerance) {
        return node;
      }
    }

    const node = new TopologyNode({ position });
    this.nodes.set(node.id, node);
    this.spatialHash.insert(position, node.id);
    return node;
  }

  private edgeExists(nodeId1: string, nodeId2: string): boolean {
    const node = this.nodes.get(nodeId1);
    if (!node) return false;
    for (const edgeId of node.connectedEdgeIds) {
      const e = this.edges.get(edgeId);
      if (!e) continue;
      if (
        (e.startNodeId === nodeId1 && e.endNodeId === nodeId2) ||
        (e.startNodeId === nodeId2 && e.endNodeId === nodeId1)
      ) {
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Internos — edge splitting
  // -------------------------------------------------------------------------

  /**
   * Si `node` cae sobre el INTERIOR de alguna arista recta, la parte en dos.
   *
   * Solo se parte la primera encontrada: en un grafo planar válido un nodo no
   * puede caer a la vez sobre dos aristas no adyacentes. Los arcos se excluyen
   * porque partirlos exige subdivisión angular, no un punto medio.
   */
  private splitEdgesAt(node: TopologyNode): void {
    for (const edgeId of [...this.edges.keys()]) {
      const edge = this.edges.get(edgeId);
      if (!edge) continue;
      if (edge.geometryType !== 'line') continue;
      if (edge.startNodeId === node.id || edge.endNodeId === node.id) continue;

      const a = this.nodes.get(edge.startNodeId)?.position;
      const b = this.nodes.get(edge.endNodeId)?.position;
      if (!a || !b) continue;
      if (distanceToSegment(node.position, a, b) >= this.snapTolerance) continue;

      this.splitEdge(edgeId, node);
      break;
    }
  }

  private splitEdge(edgeId: string, midNode: TopologyNode): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;

    const startNode = this.nodes.get(edge.startNodeId);
    const endNode = this.nodes.get(edge.endNodeId);
    if (!startNode || !endNode) return;

    this.removeEdge(edgeId);

    for (const [from, to] of [
      [startNode, midNode],
      [midNode, endNode],
    ] as const) {
      const fragment = new TopologyEdge({
        startNodeId: from.id,
        endNodeId: to.id,
        geometryType: 'line',
        objectType: edge.objectType,
        sourceWall: cloneWallWithShape(edge.sourceWall, from.position, to.position),
      });
      this.edges.set(fragment.id, fragment);
      from.connectedEdgeIds.push(fragment.id);
      to.connectedEdgeIds.push(fragment.id);
    }
  }

  private removeEdge(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    this.edges.delete(edgeId);

    for (const nodeId of [edge.startNodeId, edge.endNodeId]) {
      const list = this.nodes.get(nodeId)?.connectedEdgeIds;
      if (!list) continue;
      const idx = list.indexOf(edgeId);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  // -------------------------------------------------------------------------
  // Internos — rotation system
  // -------------------------------------------------------------------------

  /** Por cada nodo, sus aristas ordenadas por ángulo de salida ascendente. */
  private buildRotationSystem(
    wallEdges: readonly TopologyEdge[],
  ): Map<string, Array<{ angle: number; edgeId: string }>> {
    const outAngles = new Map<string, Array<{ angle: number; edgeId: string }>>();

    for (const edge of wallEdges) {
      for (const nodeId of [edge.startNodeId, edge.endNodeId]) {
        const list = outAngles.get(nodeId) ?? [];
        list.push({ angle: this.angleFromNode(nodeId, edge.id), edgeId: edge.id });
        outAngles.set(nodeId, list);
      }
    }

    for (const list of outAngles.values()) list.sort((a, b) => a.angle - b.angle);
    return outAngles;
  }

  /**
   * Llegando a `toNode` por `incomingEdgeId`, devuelve la siguiente arista de
   * la cara mínima (giro más a la izquierda).
   *
   * En el sistema de rotación de `toNode`, la arista entrante también sale de
   * él (es su gemela invertida): se toma su PREDECESORA en orden CCW, que es
   * la sucesora en orden CW.
   */
  private nextHalfEdge(
    toNode: string,
    incomingEdgeId: string,
    outAngles: Map<string, Array<{ angle: number; edgeId: string }>>,
  ): string | null {
    const angles = outAngles.get(toNode);
    if (!angles || angles.length < 2) return null;

    const idx = angles.findIndex((t) => t.edgeId === incomingEdgeId);
    if (idx < 0) return null;

    return angles[(idx - 1 + angles.length) % angles.length].edgeId;
  }

  /** Ángulo desde `nodeId` hacia el nodo opuesto de `edgeId`. */
  private angleFromNode(nodeId: string, edgeId: string): number {
    const edge = this.edges.get(edgeId);
    const node = this.nodes.get(nodeId);
    if (!edge || !node) return 0;

    const other = this.nodes.get(edge.otherNodeId(nodeId));
    if (!other) return 0;

    return Math.atan2(other.position.y - node.position.y, other.position.x - node.position.x);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clona un muro con un eje recto nuevo, PRESERVANDO su `id`.
 *
 * Preservar el id es lo que hace que los fragmentos de un muro partido sigan
 * contando como el mismo muro en `adjacentWallIds` y `wallAdjacencyMap`.
 * Equivale al `copyWith(geometry: ...)` de LevON, que PolyLive no tiene porque
 * sus objetos BIM son mutables y llevan identidad de persistencia.
 */
function cloneWallWithShape(wall: Wall, start: Point2D, end: Point2D): Wall {
  return new Wall({
    id: wall.id,
    roomId: wall.roomId,
    shape: lineShape(start, end),
    thickness: wall.thickness,
    height: wall.height,
    material: wall.material,
    isStructural: wall.isStructural,
    notes: wall.notes,
    properties: wall.properties,
    created_at: wall.created_at,
    updated_at: wall.updated_at,
    is_deleted: wall.is_deleted,
    linkedPhotos: wall.linkedPhotos,
  });
}
