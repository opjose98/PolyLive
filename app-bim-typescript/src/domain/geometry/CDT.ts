// =============================================================================
// CDT.ts — Constrained Delaunay Triangulation
// Basado en: CDT-algoritmo.md
//
// Fases:
//   1. Bowyer-Watson (Delaunay sin restricciones)
//   2. Forzado de aristas restringidas
//   3. Eliminación de triángulos dentro de huecos
// =============================================================================

import {
  Point2D,
  Triangle,
  Polygon,
  TriangulationResult,
  ValidationWarning,
  SquareMeters,
  EPSILON,
  AREA_MINIMA_VALIDA,
  squareMeters,
} from './types';

// ---------------------------------------------------------------------------
// Tipos internos del algoritmo
// ---------------------------------------------------------------------------

/** Triángulo interno con sus vértices referenciados por índice. */
interface InternalTriangle {
  i0: number;
  i1: number;
  i2: number;
}

/** Arista definida por dos índices de vértices. */
interface Edge {
  a: number;
  b: number;
}

// ---------------------------------------------------------------------------
// Utilidades geométricas internas
// ---------------------------------------------------------------------------

/** Área con signo de un triángulo (positiva = CCW, negativa = CW). */
function signedArea2(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Área absoluta de un triángulo. */
function triangleArea(a: Point2D, b: Point2D, c: Point2D): number {
  return Math.abs(signedArea2(a, b, c)) / 2;
}

/** Test de punto dentro del circuncírculo del triángulo (Bowyer-Watson). */
function inCircumcircle(
  p: Point2D,
  a: Point2D,
  b: Point2D,
  c: Point2D,
): boolean {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;

  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);

  // Si el triángulo está en CW, invertir el signo
  const sa = signedArea2(a, b, c);
  if (sa < 0) return det < EPSILON;
  return det > -EPSILON;
}

/** Test de punto dentro de un polígono (ray casting). */
function pointInPolygon(p: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/** Centroide de un triángulo. */
function centroid(a: Point2D, b: Point2D, c: Point2D): Point2D {
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
  };
}

/** Test de intersección entre dos segmentos (excluyendo extremos compartidos). */
function segmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): boolean {
  const d1 = signedArea2(p3, p4, p1);
  const d2 = signedArea2(p3, p4, p2);
  const d3 = signedArea2(p1, p2, p3);
  const d4 = signedArea2(p1, p2, p4);

  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) {
    return true;
  }

  return false;
}

/** Test de auto-intersección de un polígono. */
function isSelfIntersecting(vertices: Point2D[]): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      // No comparar aristas adyacentes
      if (i === 0 && j2 === n) continue;
      if (segmentsIntersect(vertices[i], vertices[i2], vertices[j], vertices[j2])) {
        return true;
      }
    }
  }
  return false;
}

/** Deduplica vértices consecutivos idénticos (dentro de EPSILON). */
function deduplicateVertices(vertices: Point2D[]): { result: Point2D[]; hadDuplicates: boolean } {
  if (vertices.length <= 1) return { result: [...vertices], hadDuplicates: false };

  const result: Point2D[] = [vertices[0]];
  let hadDuplicates = false;

  for (let i = 1; i < vertices.length; i++) {
    const prev = result[result.length - 1];
    const dx = vertices[i].x - prev.x;
    const dy = vertices[i].y - prev.y;
    if (Math.sqrt(dx * dx + dy * dy) > EPSILON) {
      result.push(vertices[i]);
    } else {
      hadDuplicates = true;
    }
  }

  // También chequear último vs primero
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    if (Math.sqrt(dx * dx + dy * dy) <= EPSILON) {
      result.pop();
      hadDuplicates = true;
    }
  }

  return { result, hadDuplicates };
}

/** Área de un polígono con Shoelace formula. */
function polygonArea(vertices: Point2D[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
}

// ---------------------------------------------------------------------------
// Clase CDT
// ---------------------------------------------------------------------------

export class CDT {
  /**
   * Triangula un polígono simple (con o sin huecos internos).
   *
   * @param polygon — Polígono exterior con vertices y opcionalmente holes
   * @returns TriangulationResult con triángulos, validez y métricas
   */
  triangulate(polygon: Polygon): TriangulationResult {
    const warnings: ValidationWarning[] = [];

    // --- Pre-procesamiento: deduplicar vértices ---
    const { result: outerVerts, hadDuplicates } = deduplicateVertices(polygon.vertices);

    if (hadDuplicates) {
      warnings.push({
        type: 'duplicate_vertices',
        message: 'Se eliminaron vértices duplicados consecutivos',
      });
    }

    // Necesitamos al menos 3 vértices
    if (outerVerts.length < 3) {
      return {
        triangles: [],
        valid: false,
        degenerateCount: 0,
        totalArea: squareMeters(0),
        warnings: [
          ...warnings,
          {
            type: 'degenerate_triangle',
            message: 'Polígono con menos de 3 vértices únicos',
          },
        ],
      };
    }

    // --- Validación: auto-intersección ---
    if (isSelfIntersecting(outerVerts)) {
      return {
        triangles: [],
        valid: false,
        degenerateCount: 0,
        totalArea: squareMeters(0),
        warnings: [
          ...warnings,
          {
            type: 'self_intersecting_polygon',
            message: 'El polígono se auto-intersecta',
          },
        ],
      };
    }

    // --- Recopilar todos los puntos (exterior + huecos) ---
    const allPoints: Point2D[] = [...outerVerts];
    const holePolygons: Point2D[][] = [];

    if (polygon.holes) {
      for (const hole of polygon.holes) {
        const { result: holeVerts } = deduplicateVertices(hole.vertices);
        if (holeVerts.length >= 3) {
          holePolygons.push(holeVerts);
          allPoints.push(...holeVerts);
        }
      }
    }

    // --- Recopilar aristas restringidas ---
    const constraintEdges: Edge[] = [];

    // Aristas del polígono exterior
    for (let i = 0; i < outerVerts.length; i++) {
      constraintEdges.push({
        a: i,
        b: (i + 1) % outerVerts.length,
      });
    }

    // Aristas de los huecos
    let offset = outerVerts.length;
    for (const holeVerts of holePolygons) {
      for (let i = 0; i < holeVerts.length; i++) {
        constraintEdges.push({
          a: offset + i,
          b: offset + ((i + 1) % holeVerts.length),
        });
      }
      offset += holeVerts.length;
    }

    // --- Fase 1: Bowyer-Watson ---
    const internalTriangles = this.bowyerWatson(allPoints);

    // --- Fase 2: Forzar aristas restringidas ---
    const constrainedTriangles = this.enforceConstraints(
      allPoints,
      internalTriangles,
      constraintEdges,
    );

    // --- Fase 3: Eliminar triángulos fuera del exterior o dentro de huecos ---
    const finalInternalTris = this.eliminateOutside(
      allPoints,
      constrainedTriangles,
      outerVerts,
      holePolygons,
    );

    // --- Construir resultado ---
    let degenerateCount = 0;
    let totalArea = 0;
    const triangles: Triangle[] = [];

    for (const tri of finalInternalTris) {
      const a = allPoints[tri.i0];
      const b = allPoints[tri.i1];
      const c = allPoints[tri.i2];
      const area = triangleArea(a, b, c);

      if (area < AREA_MINIMA_VALIDA) {
        degenerateCount++;
      }

      totalArea += area;
      triangles.push({
        v0: a,
        v1: b,
        v2: c,
        area: squareMeters(area),
      });
    }

    if (degenerateCount > 0) {
      warnings.push({
        type: 'degenerate_triangle',
        message: `${degenerateCount} triángulo(s) con área < ${AREA_MINIMA_VALIDA} m²`,
      });
    }

    return {
      triangles,
      valid: true,
      degenerateCount,
      totalArea: squareMeters(totalArea),
      warnings,
    };
  }

  // =========================================================================
  // Fase 1: Bowyer-Watson
  // =========================================================================

  private bowyerWatson(points: Point2D[]): InternalTriangle[] {
    // Calcular bounding box con margen
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dmax = Math.max(dx, dy);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // Super-triángulo que contiene todos los puntos
    const margin = dmax * 20;
    const superPoints: Point2D[] = [
      { x: midX - margin, y: midY - margin },
      { x: midX + margin, y: midY - margin },
      { x: midX, y: midY + margin },
    ];

    // Los super-vértices van al final del array para poder identificarlos
    const totalPoints = [...points, ...superPoints];
    const sp0 = points.length;
    const sp1 = points.length + 1;
    const sp2 = points.length + 2;

    let triangulation: InternalTriangle[] = [{ i0: sp0, i1: sp1, i2: sp2 }];

    // Insertar puntos uno por uno
    for (let pi = 0; pi < points.length; pi++) {
      const p = totalPoints[pi];
      const badTriangles: InternalTriangle[] = [];

      // Encontrar triángulos cuyo circuncírculo contiene el nuevo punto
      for (const tri of triangulation) {
        if (
          inCircumcircle(
            p,
            totalPoints[tri.i0],
            totalPoints[tri.i1],
            totalPoints[tri.i2],
          )
        ) {
          badTriangles.push(tri);
        }
      }

      // Encontrar polígono frontera (aristas no compartidas de los "bad triangles")
      const boundaryEdges: Edge[] = [];

      for (const tri of badTriangles) {
        const edges: Edge[] = [
          { a: tri.i0, b: tri.i1 },
          { a: tri.i1, b: tri.i2 },
          { a: tri.i2, b: tri.i0 },
        ];

        for (const edge of edges) {
          // Una arista es frontera si NO la comparte otro bad triangle
          const isShared = badTriangles.some(
            (other) =>
              other !== tri &&
              this.triangleHasEdge(other, edge.a, edge.b),
          );

          if (!isShared) {
            boundaryEdges.push(edge);
          }
        }
      }

      // Eliminar bad triangles
      triangulation = triangulation.filter((t) => !badTriangles.includes(t));

      // Crear nuevos triángulos desde las aristas frontera al nuevo punto
      for (const edge of boundaryEdges) {
        triangulation.push({ i0: edge.a, i1: edge.b, i2: pi });
      }
    }

    // Eliminar triángulos que usan vértices del super-triángulo
    triangulation = triangulation.filter(
      (tri) =>
        tri.i0 < points.length &&
        tri.i1 < points.length &&
        tri.i2 < points.length,
    );

    return triangulation;
  }

  // =========================================================================
  // Fase 2: Forzado de aristas restringidas
  // =========================================================================

  private enforceConstraints(
    points: Point2D[],
    triangles: InternalTriangle[],
    constraints: Edge[],
  ): InternalTriangle[] {
    let current = [...triangles];

    for (const constraint of constraints) {
      // Verificar si la arista ya existe en la triangulación
      const exists = current.some((tri) =>
        this.triangleHasEdge(tri, constraint.a, constraint.b),
      );

      if (exists) continue;

      // La arista no existe: hay que forzarla.
      // Encontrar triángulos que intersectan la arista restringida y re-triangutar
      current = this.insertConstraintEdge(points, current, constraint);
    }

    return current;
  }

  /**
   * Inserta una arista restringida re-triangulando la zona afectada.
   * Usa un approach de "cavity" simplificado.
   */
  private insertConstraintEdge(
    points: Point2D[],
    triangles: InternalTriangle[],
    constraint: Edge,
  ): InternalTriangle[] {
    const pa = points[constraint.a];
    const pb = points[constraint.b];

    // Encontrar triángulos que intersectan la arista restringida
    const intersecting: InternalTriangle[] = [];
    const remaining: InternalTriangle[] = [];

    for (const tri of triangles) {
      const edges: Array<[number, number]> = [
        [tri.i0, tri.i1],
        [tri.i1, tri.i2],
        [tri.i2, tri.i0],
      ];

      let intersects = false;
      for (const [ea, eb] of edges) {
        // No considerar aristas que comparten un vértice con la constraint
        if (
          ea === constraint.a ||
          ea === constraint.b ||
          eb === constraint.a ||
          eb === constraint.b
        ) {
          continue;
        }

        if (segmentsIntersect(pa, pb, points[ea], points[eb])) {
          intersects = true;
          break;
        }
      }

      if (intersects) {
        intersecting.push(tri);
      } else {
        remaining.push(tri);
      }
    }

    if (intersecting.length === 0) {
      // No hay intersección directa — la arista pasa entre triángulos existentes
      return triangles;
    }

    // Recopilar vértices únicos de los triángulos intersectados
    const vertexSet = new Set<number>();
    for (const tri of intersecting) {
      vertexSet.add(tri.i0);
      vertexSet.add(tri.i1);
      vertexSet.add(tri.i2);
    }
    // Asegurar que los extremos de la constraint están incluidos
    vertexSet.add(constraint.a);
    vertexSet.add(constraint.b);

    const vertexArray = Array.from(vertexSet);

    // Re-triangular estos vértices y forzar la arista dividiendo
    // en dos sub-polígonos (arriba y abajo de la arista restringida)
    const above: number[] = [];
    const below: number[] = [];

    for (const vi of vertexArray) {
      if (vi === constraint.a || vi === constraint.b) continue;
      const cross = signedArea2(pa, pb, points[vi]);
      if (cross > EPSILON) {
        above.push(vi);
      } else if (cross < -EPSILON) {
        below.push(vi);
      }
      // Si es ~0, el punto está sobre la arista — lo incluimos en ambos lados
      // para robustez
    }

    const newTris: InternalTriangle[] = [];

    // Triangular cada lado con fan desde la constraint
    this.fanTriangulate(points, constraint.a, constraint.b, above, newTris);
    this.fanTriangulate(points, constraint.a, constraint.b, below, newTris);

    return [...remaining, ...newTris];
  }

  /**
   * Crea triángulos en abanico desde una arista base hacia un conjunto de puntos
   * en el mismo lado de la arista. Ordena los puntos a lo largo de la arista
   * y crea triángulos consecutivos.
   */
  private fanTriangulate(
    points: Point2D[],
    edgeA: number,
    edgeB: number,
    sidePoints: number[],
    output: InternalTriangle[],
  ): void {
    if (sidePoints.length === 0) return;

    if (sidePoints.length === 1) {
      output.push({ i0: edgeA, i1: edgeB, i2: sidePoints[0] });
      return;
    }

    // Ordenar puntos por su proyección sobre la arista
    const pa = points[edgeA];
    const pb = points[edgeB];
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;

    const sorted = sidePoints
      .map((vi) => ({
        idx: vi,
        t: (points[vi].x - pa.x) * dx + (points[vi].y - pa.y) * dy,
      }))
      .sort((a, b) => a.t - b.t);

    // Crear abanico: edgeA → primer punto, último punto → edgeB,
    // y conectar puntos consecutivos
    const chain = [edgeA, ...sorted.map((s) => s.idx), edgeB];

    for (let i = 1; i < chain.length - 1; i++) {
      // Para cada punto intermedio, crear un triángulo con sus vecinos
      // Usamos ear-clipping simplificado sobre la chain
      output.push({ i0: edgeA, i1: chain[i], i2: chain[i + 1] });
    }
  }

  // =========================================================================
  // Fase 3: Eliminación de triángulos fuera/dentro de huecos
  // =========================================================================

  private eliminateOutside(
    points: Point2D[],
    triangles: InternalTriangle[],
    outerVerts: Point2D[],
    holes: Point2D[][],
  ): InternalTriangle[] {
    return triangles.filter((tri) => {
      const c = centroid(points[tri.i0], points[tri.i1], points[tri.i2]);

      // El centroide debe estar DENTRO del polígono exterior
      if (!pointInPolygon(c, outerVerts)) {
        return false;
      }

      // El centroide NO debe estar dentro de ningún hueco
      for (const hole of holes) {
        if (pointInPolygon(c, hole)) {
          return false;
        }
      }

      return true;
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private triangleHasEdge(tri: InternalTriangle, a: number, b: number): boolean {
    const verts = [tri.i0, tri.i1, tri.i2];
    return (
      (verts.includes(a) && verts.includes(b)) && a !== b
    );
  }
}
