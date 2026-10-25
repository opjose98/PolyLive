// =============================================================================
// TopologyGraph.test.ts — Grafo de conectividad, edge splitting y ciclos
// Motor portado de LevON (topology_graph.dart)
// =============================================================================

import { meters, Point2D } from '../../src/domain/geometry/types';
import { arcShape } from '../../src/domain/geometry/shapes';
import { TopologyGraph } from '../../src/domain/topology/TopologyGraph';
import { signedArea } from '../../src/domain/geometry/polygon-utils';
import { SpatialHash } from '../../src/domain/geometry/spatial-hash';
import { Wall, revitObjectId, roomId } from '../../src/domain/objects';

const ROOM = roomId('room-topology');

let wallSeq = 0;

function wall(
  start: Point2D,
  end: Point2D,
  options: { isStructural?: boolean; id?: string } = {},
): Wall {
  return new Wall({
    id: revitObjectId(options.id ?? `w${wallSeq++}`),
    roomId: ROOM,
    startPoint: start,
    endPoint: end,
    thickness: meters(0.15),
    height: meters(2.8),
    isStructural: options.isStructural ?? true,
  });
}

/** Cuatro muros que cierran un rectángulo 4×3. */
function rectangleWalls(): Wall[] {
  return [
    wall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    wall({ x: 4, y: 0 }, { x: 4, y: 3 }),
    wall({ x: 4, y: 3 }, { x: 0, y: 3 }),
    wall({ x: 0, y: 3 }, { x: 0, y: 0 }),
  ];
}

beforeEach(() => {
  wallSeq = 0;
});

// ---------------------------------------------------------------------------
// Fusión de nodos
// ---------------------------------------------------------------------------

describe('fusión de nodos', () => {
  it('reutiliza un nodo para extremos que coinciden exactamente', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4, y: 0 }, { x: 4, y: 3 }));

    expect(graph.nodeCount).toBe(3); // no 4: el (4,0) se comparte
    expect(graph.edgeCount).toBe(2);
  });

  it('fusiona extremos separados por menos que la tolerancia', () => {
    // En campo dos muros que "se tocan" nunca coinciden al milímetro.
    const graph = new TopologyGraph({ snapTolerance: 0.05 });
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4.02, y: 0.01 }, { x: 4, y: 3 }));

    expect(graph.nodeCount).toBe(3);
  });

  it('NO fusiona extremos separados por más que la tolerancia', () => {
    const graph = new TopologyGraph({ snapTolerance: 0.05 });
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4.5, y: 0 }, { x: 4.5, y: 3 }));

    expect(graph.nodeCount).toBe(4);
  });

  it('ignora muros degenerados cuyos extremos fusionan al mismo nodo', () => {
    const graph = new TopologyGraph({ snapTolerance: 0.05 });
    graph.addWall(wall({ x: 0, y: 0 }, { x: 0.01, y: 0 }));

    expect(graph.edgeCount).toBe(0);
  });

  it('no crea aristas paralelas entre el mismo par de nodos', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));

    expect(graph.edgeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge splitting
// ---------------------------------------------------------------------------

describe('edge splitting (uniones en T)', () => {
  it('parte una arista cuando otro muro termina en su interior', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    // Termina en el punto medio del muro anterior.
    graph.addWall(wall({ x: 2, y: 0 }, { x: 2, y: 3 }));

    // La arista original se parte en dos, más la nueva = 3.
    expect(graph.edgeCount).toBe(3);
    expect(graph.nodeCount).toBe(4);
  });

  it('parte el muro nuevo que pasa por extremos ya existentes (orden inverso, H-69)', () => {
    const graph = new TopologyGraph();
    // Primero los muros que llegan; después el que los atraviesa (Maco: baño bajo el muro sur).
    graph.addWall(wall({ x: 1, y: 0 }, { x: 1, y: 3 }));
    graph.addWall(wall({ x: 3, y: 0 }, { x: 3, y: -2 }));
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));

    // El muro atravesado queda en tres fragmentos, más los dos que llegan = 5.
    expect(graph.edgeCount).toBe(5);
    expect(graph.nodeCount).toBe(6);
  });

  it('NO parte una arista si el punto queda lejos del segmento', () => {
    const graph = new TopologyGraph({ snapTolerance: 0.05 });
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 2, y: 1 }, { x: 2, y: 3 }));

    expect(graph.edgeCount).toBe(2);
  });

  it('NO parte una arista por un punto alineado pero fuera del segmento', () => {
    // Si se tratara el segmento como recta infinita, (6,0) parecería estar
    // sobre él y lo partiría por un punto que no le pertenece.
    const graph = new TopologyGraph({ snapTolerance: 0.05 });
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 6, y: 0 }, { x: 6, y: 3 }));

    expect(graph.edgeCount).toBe(2);
  });

  it('conserva el id del muro original en ambos fragmentos', () => {
    const graph = new TopologyGraph();
    const largo = wall({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'muro-largo' });
    graph.addWall(largo);
    graph.addWall(wall({ x: 2, y: 0 }, { x: 2, y: 3 }, { id: 'muro-T' }));

    // Los fragmentos siguen contando como el mismo muro para la adyacencia.
    expect(graph.adjacentWallIds(largo)).toContain('muro-T');
  });
});

// ---------------------------------------------------------------------------
// Ciclos mínimos
// ---------------------------------------------------------------------------

describe('findMinimalCycles', () => {
  it('detecta un único recinto rectangular', () => {
    const graph = new TopologyGraph();
    graph.addWalls(rectangleWalls());

    const cycles = graph.findMinimalCycles();
    expect(cycles).toHaveLength(1);
    expect(cycles[0].edges).toHaveLength(4);
  });

  it('empareja cada arista con el nodo desde el que se recorre', () => {
    const graph = new TopologyGraph();
    graph.addWalls(rectangleWalls());

    const [cycle] = graph.findMinimalCycles();
    expect(cycle.fromNodeIds).toHaveLength(cycle.edges.length);
    for (let i = 0; i < cycle.edges.length; i++) {
      const edge = cycle.edges[i];
      expect([edge.startNodeId, edge.endNodeId]).toContain(cycle.fromNodeIds[i]);
    }
  });

  it('no detecta ciclos en un contorno abierto', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4, y: 0 }, { x: 4, y: 3 }));
    graph.addWall(wall({ x: 4, y: 3 }, { x: 0, y: 3 }));
    // Falta el cuarto muro que cerraría el rectángulo.

    expect(graph.findMinimalCycles()).toHaveLength(0);
  });

  // Regresión (docs/25 § 6, NARG29): un muro colgante en el contorno exterior impedía cerrar
  // la cara exterior y se descartaba como "exterior" el recinto más grande.
  it('un muro colgante junto a dos recintos no hace desaparecer el mayor', () => {
    const graph = new TopologyGraph();
    graph.addWalls(rectangleWalls()); // recinto grande 4×3
    graph.addWall(wall({ x: 4, y: 0 }, { x: 6, y: 0 }));
    graph.addWall(wall({ x: 6, y: 0 }, { x: 6, y: 2 }));
    graph.addWall(wall({ x: 6, y: 2 }, { x: 4, y: 2 })); // recinto 2×2 en T sobre el muro x=4
    graph.addWall(wall({ x: 6, y: 2 }, { x: 6, y: 3 })); // colgante hacia afuera

    const areas = graph
      .findMinimalCycles()
      .map((c) => Math.abs(signedArea(c.fromNodeIds.map((id) => graph.nodePosition(id)!))))
      .sort((a, b) => a - b);
    expect(areas).toEqual([expect.closeTo(4, 6), expect.closeTo(12, 6)]);
  });

  it('un muro suelto dentro de un recinto no lo deshace', () => {
    const graph = new TopologyGraph();
    graph.addWalls(rectangleWalls());
    graph.addWall(wall({ x: 2, y: 0 }, { x: 2, y: 1.5 })); // tabique incompleto desde el muro sur

    expect(graph.findMinimalCycles()).toHaveLength(1);
  });

  it('detecta dos recintos separados por un tabique central', () => {
    const graph = new TopologyGraph();
    // Rectángulo exterior 4×3 partido en dos por un muro vertical en x=2.
    graph.addWall(wall({ x: 0, y: 0 }, { x: 2, y: 0 }));
    graph.addWall(wall({ x: 2, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4, y: 0 }, { x: 4, y: 3 }));
    graph.addWall(wall({ x: 4, y: 3 }, { x: 2, y: 3 }));
    graph.addWall(wall({ x: 2, y: 3 }, { x: 0, y: 3 }));
    graph.addWall(wall({ x: 0, y: 3 }, { x: 0, y: 0 }));
    graph.addWall(wall({ x: 2, y: 0 }, { x: 2, y: 3 }));

    // La cara exterior se descarta; quedan las dos estancias.
    expect(graph.findMinimalCycles()).toHaveLength(2);
  });

  it('cierra el recinto de un muro que llega antes que el muro que lo cierra (H-69)', () => {
    const graph = new TopologyGraph();
    // Baño colgado bajo el muro sur: sus muros se trazan antes que el muro sur.
    graph.addWall(wall({ x: 4, y: 0 }, { x: 4, y: -2 }));
    graph.addWall(wall({ x: 4, y: -2 }, { x: 2, y: -2 }));
    graph.addWall(wall({ x: 2, y: -2 }, { x: 2, y: 0 }));
    graph.addWalls(rectangleWalls());

    expect(graph.findMinimalCycles()).toHaveLength(2);
  });

  it('excluye las particiones no estructurales del cierre de recintos', () => {
    const graph = new TopologyGraph();
    const muros = rectangleWalls();
    muros[3] = wall({ x: 0, y: 3 }, { x: 0, y: 0 }, { isStructural: false });
    graph.addWalls(muros);

    // Con un lado convertido en tabique ligero, el recinto ya no cierra.
    expect(graph.findMinimalCycles()).toHaveLength(0);
  });

  it('devuelve vacío con menos de dos aristas', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    expect(graph.findMinimalCycles()).toHaveLength(0);
  });

  it('cierra un recinto aunque los muros se tracen en orden arbitrario', () => {
    const graph = new TopologyGraph();
    const muros = rectangleWalls();
    graph.addWalls([muros[2], muros[0], muros[3], muros[1]]);

    expect(graph.findMinimalCycles()).toHaveLength(1);
  });

  it('acepta un muro curvo como lado del recinto', () => {
    const graph = new TopologyGraph();
    graph.addWall(wall({ x: 0, y: 0 }, { x: 4, y: 0 }));
    graph.addWall(wall({ x: 4, y: 0 }, { x: 4, y: 3 }));
    graph.addWall(wall({ x: 4, y: 3 }, { x: 0, y: 3 }));
    graph.addWall(
      new Wall({
        id: revitObjectId('muro-curvo'),
        roomId: ROOM,
        shape: arcShape({
          center: { x: 0, y: 1.5 },
          radius: meters(1.5),
          startAngle: Math.PI / 2,
          sweepAngle: Math.PI,
        }),
        thickness: meters(0.15),
        height: meters(2.8),
      }),
    );

    expect(graph.findMinimalCycles()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Adyacencia
// ---------------------------------------------------------------------------

describe('adyacencia', () => {
  it('lista los muros que comparten nodo', () => {
    const graph = new TopologyGraph();
    const a = wall({ x: 0, y: 0 }, { x: 4, y: 0 }, { id: 'a' });
    const b = wall({ x: 4, y: 0 }, { x: 4, y: 3 }, { id: 'b' });
    const c = wall({ x: 10, y: 10 }, { x: 12, y: 10 }, { id: 'c' });
    graph.addWalls([a, b, c]);

    expect(graph.adjacentWallIds(a)).toEqual(new Set(['b']));
    expect(graph.adjacentWallIds(c).size).toBe(0);
  });

  it('construye el mapa global de adyacencia', () => {
    const graph = new TopologyGraph();
    graph.addWalls(rectangleWalls());

    const map = graph.wallAdjacencyMap();
    // En un rectángulo cerrado cada muro toca exactamente a otros dos.
    expect(map.size).toBe(4);
    for (const vecinos of map.values()) expect(vecinos.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SpatialHash
// ---------------------------------------------------------------------------

describe('SpatialHash', () => {
  it('encuentra vecinos en celdas adyacentes, no solo en la propia', () => {
    const hash = new SpatialHash<string>({ cellSize: 1 });
    hash.insert({ x: 0.99, y: 0.99 }, 'a');
    // Cae en la celda contigua, pero está a 0.02 de distancia real.
    expect(hash.queryNeighbors({ x: 1.01, y: 1.01 })).toContain('a');
  });

  it('elimina entradas', () => {
    const hash = new SpatialHash<string>({ cellSize: 1 });
    hash.insert({ x: 0.5, y: 0.5 }, 'a');
    hash.remove({ x: 0.5, y: 0.5 }, 'a');
    expect(hash.queryNeighbors({ x: 0.5, y: 0.5 })).not.toContain('a');
    expect(hash.totalEntries).toBe(0);
  });

  it('maneja coordenadas negativas de forma consistente', () => {
    const hash = new SpatialHash<string>({ cellSize: 1 });
    hash.insert({ x: -3.5, y: -2.5 }, 'neg');
    expect(hash.queryNeighbors({ x: -3.4, y: -2.6 })).toContain('neg');
  });

  it('rechaza un cellSize no positivo', () => {
    expect(() => new SpatialHash<string>({ cellSize: 0 })).toThrow();
  });
});

describe('dos grupos de muros que no se tocan', () => {
  it('cada grupo da sus recintos, sin tomar el contorno del segundo como recinto', () => {
    const g = new TopologyGraph();
    g.addWalls([
      ...rectangleWalls(),
      // Segundo grupo, aparte: dos recintos de 3 × 2 lado a lado.
      wall({ x: 10, y: 0 }, { x: 16, y: 0 }),
      wall({ x: 16, y: 0 }, { x: 16, y: 2 }),
      wall({ x: 16, y: 2 }, { x: 10, y: 2 }),
      wall({ x: 10, y: 2 }, { x: 10, y: 0 }),
      wall({ x: 13, y: 0 }, { x: 13, y: 2 }),
    ]);
    // Tres recintos de 4 lados; el contorno del segundo grupo (6 lados) no es uno.
    expect(g.findMinimalCycles().map((c) => c.edges.length)).toEqual([4, 4, 4]);
  });
});
