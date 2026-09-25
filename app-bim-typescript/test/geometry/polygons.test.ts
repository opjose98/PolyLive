// =============================================================================
// polygons.test.ts — Área, centroide, orientación y validación de polígonos
// Motor portado de LevON (polygon_utils.dart / polygon_validator.dart)
// =============================================================================

import {
  signedArea,
  polygonArea,
  centroid,
  isClockwise,
  ensureClockwise,
  distanceToSegment,
  isPointInPolygon,
} from '../../src/domain/geometry/polygon-utils';
import { PolygonValidator } from '../../src/domain/geometry/polygon-validator';
import { Point2D } from '../../src/domain/geometry/types';

// Cuadrado 4×3 en Y-down recorrido en sentido horario visual.
const RECT_CW: Point2D[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

describe('signedArea / polygonArea', () => {
  it('calcula el área de un rectángulo', () => {
    expect(polygonArea(RECT_CW)).toBeCloseTo(12, 9);
  });

  it('da signo positivo en orientación CW bajo la convención Y-down', () => {
    expect(signedArea(RECT_CW)).toBeGreaterThan(0);
  });

  it('invierte el signo al invertir el recorrido, conservando el área', () => {
    const ccw = [...RECT_CW].reverse();
    expect(signedArea(ccw)).toBeCloseTo(-signedArea(RECT_CW), 9);
    expect(polygonArea(ccw)).toBeCloseTo(polygonArea(RECT_CW), 9);
  });

  it('devuelve 0 con menos de 3 vértices', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
    expect(polygonArea([])).toBe(0);
  });

  it('calcula el área de un triángulo', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
      ]),
    ).toBeCloseTo(6, 9);
  });
});

describe('centroid', () => {
  it('sitúa el centroide de un rectángulo en su centro', () => {
    const c = centroid(RECT_CW);
    expect(c.x).toBeCloseTo(2, 9);
    expect(c.y).toBeCloseTo(1.5, 9);
  });

  it('NO es el promedio de vértices en polígonos irregulares', () => {
    // Un lado con vértices extra arrastraría el promedio, pero no el centroide.
    const conVerticesExtra: Point2D[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    const c = centroid(conVerticesExtra);
    const promedioY =
      conVerticesExtra.reduce((s, v) => s + v.y, 0) / conVerticesExtra.length;

    expect(c.x).toBeCloseTo(2, 9);
    expect(c.y).toBeCloseTo(1.5, 9);
    expect(c.y).not.toBeCloseTo(promedioY, 3);
  });

  it('cae al promedio de vértices en polígonos degenerados', () => {
    const colineal: Point2D[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(centroid(colineal).x).toBeCloseTo(1, 9);
  });

  it('devuelve el origen con lista vacía', () => {
    expect(centroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe('orientación', () => {
  it('detecta y normaliza a CW', () => {
    const ccw = [...RECT_CW].reverse();
    expect(isClockwise(RECT_CW)).toBe(true);
    expect(isClockwise(ccw)).toBe(false);
    expect(isClockwise(ensureClockwise(ccw))).toBe(true);
  });

  it('deja intacto un polígono que ya es CW', () => {
    expect(ensureClockwise(RECT_CW)).toEqual(RECT_CW);
  });
});

describe('distanceToSegment', () => {
  const a: Point2D = { x: 0, y: 0 };
  const b: Point2D = { x: 10, y: 0 };

  it('mide la perpendicular cuando el punto proyecta dentro', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3, 9);
  });

  it('clampea al extremo cuando el punto proyecta fuera', () => {
    // Si tratara el segmento como recta infinita, daría 0 en vez de 5.
    expect(distanceToSegment({ x: 15, y: 0 }, a, b)).toBeCloseTo(5, 9);
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4, 9);
  });

  it('trata un segmento degenerado como un punto', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBeCloseTo(5, 9);
  });
});

describe('isPointInPolygon', () => {
  it('distingue dentro de fuera', () => {
    expect(isPointInPolygon({ x: 2, y: 1.5 }, RECT_CW)).toBe(true);
    expect(isPointInPolygon({ x: 10, y: 10 }, RECT_CW)).toBe(false);
    expect(isPointInPolygon({ x: -1, y: 1.5 }, RECT_CW)).toBe(false);
  });

  it('funciona en polígonos cóncavos (forma de L)', () => {
    const l: Point2D[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(isPointInPolygon({ x: 1, y: 3 }, l)).toBe(true);
    // El hueco cóncavo queda FUERA del polígono.
    expect(isPointInPolygon({ x: 3, y: 3 }, l)).toBe(false);
  });
});

describe('PolygonValidator', () => {
  const validator = new PolygonValidator();

  it('acepta un rectángulo y lo normaliza a CW', () => {
    const result = validator.validate([...RECT_CW].reverse());
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(isClockwise(result.vertices)).toBe(true);
    expect(result.area).toBeCloseTo(12, 9);
  });

  it('rechaza con menos de 3 vértices', () => {
    const result = validator.validate([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain('Menos de 3 vértices');
  });

  it('quita el vértice de cierre duplicado sin alterar el área', () => {
    const cerrado = [...RECT_CW, { x: 0, y: 0 }];
    const result = validator.validate(cerrado);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.vertices).toHaveLength(4);
    expect(result.area).toBeCloseTo(12, 9);
  });

  it('rechaza áreas por debajo del mínimo (micro-recintos de ruido)', () => {
    const diminuto: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.01, y: 0.01 },
    ];
    const result = validator.validate(diminuto);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain('Área insuficiente');
  });

  it('rechaza polígonos auto-intersectados', () => {
    // Asimétrico a propósito: un lazo simétrico tiene área CERO (sus dos
    // lóbulos se cancelan en la fórmula de Shoelace) y lo rechazaría antes el
    // paso de área, sin llegar nunca a comprobar la auto-intersección.
    // Este tiene área 12 m² y un pico que cruza el lado inferior.
    const cruzado: Point2D[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 3, y: -2 },
      { x: 0, y: 6 },
    ];
    expect(polygonArea(cruzado)).toBeGreaterThan(1);

    const result = validator.validate(cruzado);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain('auto-intersecta');
  });

  it('NO confunde lados adyacentes con auto-intersección', () => {
    // Los lados consecutivos comparten un extremo por definición: un test de
    // intersección inclusivo marcaría como inválido cualquier polígono real.
    expect(validator.validate(RECT_CW).valid).toBe(true);
  });

  it('respeta un minArea configurado', () => {
    const permisivo = new PolygonValidator({ minArea: 0.00001 });
    const diminuto: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.01, y: 0.01 },
    ];
    expect(permisivo.validate(diminuto).valid).toBe(true);
  });
});
