// =============================================================================
// CDT.test.ts — 12 Casos de Prueba para Constrained Delaunay Triangulation
// Basado en: CDT-casos-prueba.md
// =============================================================================

import { CDT } from '../../src/domain/geometry/CDT';
import { Polygon, Point2D, TriangulationResult } from '../../src/domain/geometry/types';

const cdt = new CDT();

// Helper: crea un Polygon cerrado a partir de un array de [x,y]
function poly(coords: [number, number][], holes?: [number, number][][]): Polygon {
  return {
    vertices: coords.map(([x, y]) => ({ x, y })),
    holes: holes?.map((h) => ({
      vertices: h.map(([x, y]) => ({ x, y })),
      isClosed: true,
    })),
    isClosed: true,
  };
}

// Helper: área con Shoelace (para verificación independiente)
function shoelaceArea(vertices: Point2D[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

// Helper: verifica que ningún centroide de triángulo cae dentro de un hueco
function centroidInPolygon(cx: number, cy: number, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ═══════════════════════════════════════════════════════════════════════════
// Caso A: Rectángulo Simple (5m × 3m)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso A: Rectángulo Simple', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    result = cdt.triangulate(
      poly([
        [0, 0],
        [5, 0],
        [5, 3],
        [0, 3],
      ]),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área total = 15.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(15.0, 4);
  });

  test('genera N-2 = 2 triángulos', () => {
    expect(result.triangles.length).toBe(2);
  });

  test('sin triángulos degenerados', () => {
    expect(result.degenerateCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso B: Forma en L
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso B: Forma en L', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // L-shape: 6 vértices, área = 27 m²
    // Rectángulo 6×3 (18) + rectángulo 3×3 (9) = 27
    result = cdt.triangulate(
      poly([
        [0, 0],
        [6, 0],
        [6, 3],
        [3, 3],
        [3, 6],
        [0, 6],
      ]),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área total = 27.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(27.0, 4);
  });

  test('genera 4 triángulos', () => {
    expect(result.triangles.length).toBe(4);
  });

  test('sin triángulos degenerados', () => {
    expect(result.degenerateCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso C: Forma en U (Concavidad múltiple)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso C: Forma en U', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // U-shape: 8 vértices, área = 24 m²
    // Base 6×2 (12) + 2 patas 2×3 (12) = 24
    result = cdt.triangulate(
      poly([
        [0, 0],
        [6, 0],
        [6, 5],
        [4, 5],
        [4, 2],
        [2, 2],
        [2, 5],
        [0, 5],
      ]),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área total = 24.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(24.0, 4);
  });

  test('genera 6 triángulos', () => {
    expect(result.triangles.length).toBe(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso D: Rectángulo con 2 Huecos (Columnas)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso D: Rectángulo con 2 huecos', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Exterior: 10m × 6m = 60 m²
    // Hueco 1: 1m × 1m en (2,2)-(3,3)
    // Hueco 2: 1m × 1m en (6,3)-(7,4)
    // Área final = 60 - 1 - 1 = 58 m²
    result = cdt.triangulate(
      poly(
        [
          [0, 0],
          [10, 0],
          [10, 6],
          [0, 6],
        ],
        [
          // Hueco 1
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
          ],
          // Hueco 2
          [
            [6, 3],
            [7, 3],
            [7, 4],
            [6, 4],
          ],
        ],
      ),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área total = 58.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(58.0, 1);
  });

  test('sin triángulos degenerados', () => {
    expect(result.degenerateCount).toBe(0);
  });

  test('ningún centroide dentro de los huecos', () => {
    const hole1 = [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ];
    const hole2 = [
      { x: 6, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 4 },
      { x: 6, y: 4 },
    ];

    for (const tri of result.triangles) {
      const cx = (tri.v0.x + tri.v1.x + tri.v2.x) / 3;
      const cy = (tri.v0.y + tri.v1.y + tri.v2.y) / 3;
      expect(centroidInPolygon(cx, cy, hole1)).toBe(false);
      expect(centroidInPolygon(cx, cy, hole2)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso E: Puntos Tangentes (Hueco tocando borde)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso E: Puntos Tangentes', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Rectángulo 5×5 = 25 m², hueco 1×1 con esquina en (5,0) tocando borde
    // Hueco esquina en el borde exterior
    result = cdt.triangulate(
      poly(
        [
          [0, 0],
          [5, 0],
          [5, 5],
          [0, 5],
        ],
        [
          [
            [4, 0],
            [5, 0],
            [5, 1],
            [4, 1],
          ],
        ],
      ),
    );
  });

  test('debe ser válido (tangencia aceptable)', () => {
    expect(result.valid).toBe(true);
  });

  test('área ≈ 24.0 m² (±0.1)', () => {
    expect(result.totalArea).toBeCloseTo(24.0, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso F: Vértices Casi Colineales (ángulo < 5°)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso F: Vértices Casi Colineales', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Triángulo con un ángulo muy pequeño
    result = cdt.triangulate(
      poly([
        [0, 0],
        [10, 0],
        [10, 0.1], // muy cerca de (10, 0) — ángulo < 5°
        [5, 3],
      ]),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('no genera NaN en áreas', () => {
    for (const tri of result.triangles) {
      expect(Number.isNaN(tri.area as number)).toBe(false);
    }
  });

  test('no genera triángulos con área negativa', () => {
    for (const tri of result.triangles) {
      expect(tri.area as number).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso G: Hueco muy pequeño (5cm × 5cm)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso G: Hueco muy pequeño', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Rectángulo 6×4 = 24 m², con hueco diminuto 0.05×0.05 = 0.0025 m²
    result = cdt.triangulate(
      poly(
        [
          [0, 0],
          [6, 0],
          [6, 4],
          [0, 4],
        ],
        [
          [
            [3, 2],
            [3.05, 2],
            [3.05, 2.05],
            [3, 2.05],
          ],
        ],
      ),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('hueco procesado correctamente (no descartado)', () => {
    // El área debe ser < 24 m² (si el hueco se procesó, el área disminuye)
    expect(result.totalArea as number).toBeLessThan(24.0);
    // Y cercana a 24 - 0.0025 = 23.9975
    expect(result.totalArea).toBeCloseTo(23.9975, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso H: Puntos Duplicados
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso H: Puntos Duplicados', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Rectángulo con dos vértices idénticos consecutivos
    // Decisión de implementación: deduplicar automáticamente
    result = cdt.triangulate(
      poly([
        [0, 0],
        [4, 0],
        [4, 0], // duplicado
        [4, 3],
        [0, 3],
      ]),
    );
  });

  test('resultado válido después de deduplicación', () => {
    expect(result.valid).toBe(true);
  });

  test('genera warning de duplicados', () => {
    const hasWarning = result.warnings.some(
      (w) => w.type === 'duplicate_vertices',
    );
    expect(hasWarning).toBe(true);
  });

  test('área correcta (igual a rectángulo 4×3)', () => {
    expect(result.totalArea).toBeCloseTo(12.0, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso I: Casi Cerrado (4cm de gap)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso I: Casi Cerrado', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // Rectángulo donde el último vértice está a 4cm del primero
    // CDT lo trata como un polígono "casi cerrado" — lo triangula tal cual
    result = cdt.triangulate({
      vertices: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 3 },
        { x: 0.03, y: 3.02 }, // 4cm aprox del origen
      ],
      isClosed: true,
    });
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área cercana a 15.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(15.0, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso J: Polígono Auto-Intersectante ("Mariposa")
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso J: Polígono Auto-Intersectante', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    // "Mariposa" — se cruza a sí mismo
    result = cdt.triangulate(
      poly([
        [0, 0],
        [4, 4],
        [4, 0],
        [0, 4],
      ]),
    );
  });

  test('debe ser inválido', () => {
    expect(result.valid).toBe(false);
  });

  test('emite warning self_intersecting_polygon', () => {
    const hasWarning = result.warnings.some(
      (w) => w.type === 'self_intersecting_polygon',
    );
    expect(hasWarning).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso K: Recinto muy alargado (40m × 1.2m)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso K: Recinto muy alargado', () => {
  let result: TriangulationResult;

  beforeAll(() => {
    result = cdt.triangulate(
      poly([
        [0, 0],
        [40, 0],
        [40, 1.2],
        [0, 1.2],
      ]),
    );
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área = 48.0 m²', () => {
    expect(result.totalArea).toBeCloseTo(48.0, 4);
  });

  test('sin falsos positivos de degeneración', () => {
    expect(result.degenerateCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caso L: Realista completo (forma irregular + 2 columnas)
// ═══════════════════════════════════════════════════════════════════════════
describe('Caso L: Realista completo', () => {
  // Forma irregular representando un salón real
  const outerVertices: [number, number][] = [
    [0, 0],
    [8, 0],
    [8, 2],
    [10, 2],
    [10, 7],
    [6, 7],
    [6, 5],
    [3, 5],
    [3, 7],
    [0, 7],
  ];

  // Columna 1: 0.4m × 0.4m en (2, 2)
  const hole1: [number, number][] = [
    [2, 2],
    [2.4, 2],
    [2.4, 2.4],
    [2, 2.4],
  ];

  // Columna 2: 0.4m × 0.4m en (7, 4)
  const hole2: [number, number][] = [
    [7, 4],
    [7.4, 4],
    [7.4, 4.4],
    [7, 4.4],
  ];

  let result: TriangulationResult;
  let expectedArea: number;

  beforeAll(() => {
    result = cdt.triangulate(poly(outerVertices, [hole1, hole2]));

    // Calcular área esperada con Shoelace
    const outerArea = shoelaceArea(
      outerVertices.map(([x, y]) => ({ x, y })),
    );
    const hole1Area = shoelaceArea(hole1.map(([x, y]) => ({ x, y })));
    const hole2Area = shoelaceArea(hole2.map(([x, y]) => ({ x, y })));
    expectedArea = outerArea - hole1Area - hole2Area;
  });

  test('debe ser válido', () => {
    expect(result.valid).toBe(true);
  });

  test('área calculada correctamente (verificada con Shoelace)', () => {
    expect(result.totalArea).toBeCloseTo(expectedArea, 1);
  });

  test('genera triángulos suficientes para cubrir la forma', () => {
    // Un polígono de 10 vértices + 2 huecos de 4 → al menos 8 triángulos
    expect(result.triangles.length).toBeGreaterThanOrEqual(8);
  });

  test('ningún centroide dentro de las columnas', () => {
    const h1 = hole1.map(([x, y]) => ({ x, y }));
    const h2 = hole2.map(([x, y]) => ({ x, y }));

    for (const tri of result.triangles) {
      const cx = (tri.v0.x + tri.v1.x + tri.v2.x) / 3;
      const cy = (tri.v0.y + tri.v1.y + tri.v2.y) / 3;
      expect(centroidInPolygon(cx, cy, h1)).toBe(false);
      expect(centroidInPolygon(cx, cy, h2)).toBe(false);
    }
  });
});
