// =============================================================================
// shapes.test.ts — Geometría polimórfica de ejes (motor portado de LevON)
// =============================================================================

import { meters } from '../../src/domain/geometry/types';
import {
  lineShape,
  arcShape,
  polylineShape,
  shapeLength,
  shapeStartPoint,
  shapeEndPoint,
  approximateArc,
  shapeToPolyline,
  translateShape,
} from '../../src/domain/geometry/shapes';

describe('LineShape', () => {
  const line = lineShape({ x: 0, y: 0 }, { x: 3, y: 4 });

  it('calcula la longitud como distancia euclídea', () => {
    expect(shapeLength(line)).toBeCloseTo(5, 9);
  });

  it('expone sus extremos', () => {
    expect(shapeStartPoint(line)).toEqual({ x: 0, y: 0 });
    expect(shapeEndPoint(line)).toEqual({ x: 3, y: 4 });
  });
});

describe('ArcShape', () => {
  // Semicírculo de radio 2 centrado en el origen, de 0 a π.
  const arc = arcShape({
    center: { x: 0, y: 0 },
    radius: meters(2),
    startAngle: 0,
    sweepAngle: Math.PI,
  });

  it('calcula la longitud como radio × |barrido|', () => {
    expect(shapeLength(arc)).toBeCloseTo(2 * Math.PI, 9);
  });

  it('deriva los extremos desde centro, radio y ángulos', () => {
    const start = shapeStartPoint(arc);
    const end = shapeEndPoint(arc);
    expect(start.x).toBeCloseTo(2, 9);
    expect(start.y).toBeCloseTo(0, 9);
    expect(end.x).toBeCloseTo(-2, 9);
    expect(end.y).toBeCloseTo(0, 9);
  });

  it('usa el signo del barrido para la dirección', () => {
    const horario = arcShape({
      center: { x: 0, y: 0 },
      radius: meters(1),
      startAngle: 0,
      sweepAngle: -Math.PI / 2,
    });
    const end = shapeEndPoint(horario);
    expect(end.x).toBeCloseTo(0, 9);
    expect(end.y).toBeCloseTo(-1, 9);
  });

  it('aproxima el arco incluyendo ambos extremos', () => {
    const points = approximateArc(arc, 8);
    expect(points).toHaveLength(9); // segments + 1
    expect(points[0].x).toBeCloseTo(2, 9);
    expect(points[8].x).toBeCloseTo(-2, 9);
  });

  it('mantiene todos los puntos aproximados sobre la circunferencia', () => {
    for (const p of approximateArc(arc, 16)) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 9);
    }
  });
});

describe('PolylineShape', () => {
  const poly = polylineShape([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 4 },
  ]);

  it('suma la longitud de todos los tramos', () => {
    expect(shapeLength(poly)).toBeCloseTo(7, 9);
  });

  it('expone el primer y el último vértice como extremos', () => {
    expect(shapeStartPoint(poly)).toEqual({ x: 0, y: 0 });
    expect(shapeEndPoint(poly)).toEqual({ x: 3, y: 4 });
  });

  it('trata una polilínea vacía como longitud cero sin lanzar', () => {
    const vacia = polylineShape([]);
    expect(shapeLength(vacia)).toBe(0);
    expect(shapeStartPoint(vacia)).toEqual({ x: 0, y: 0 });
  });
});

describe('translateShape', () => {
  it('traslada una recta moviendo ambos extremos', () => {
    const moved = translateShape(lineShape({ x: 0, y: 0 }, { x: 1, y: 1 }), 5, -2);
    expect(shapeStartPoint(moved)).toEqual({ x: 5, y: -2 });
    expect(shapeEndPoint(moved)).toEqual({ x: 6, y: -1 });
  });

  it('traslada un arco moviendo su centro y preservando radio y curvatura', () => {
    const arc = arcShape({
      center: { x: 0, y: 0 },
      radius: meters(2),
      startAngle: 0,
      sweepAngle: Math.PI / 2,
    });
    const moved = translateShape(arc, 10, 10);

    expect(moved.kind).toBe('arc');
    if (moved.kind !== 'arc') throw new Error('se esperaba un arco');
    expect(moved.center).toEqual({ x: 10, y: 10 });
    expect(moved.radius).toBe(2);
    // La longitud del arco no cambia al trasladarlo.
    expect(shapeLength(moved)).toBeCloseTo(shapeLength(arc), 9);
  });

  it('preserva la longitud de una polilínea trasladada', () => {
    const poly = polylineShape([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ]);
    expect(shapeLength(translateShape(poly, -7, 3))).toBeCloseTo(shapeLength(poly), 9);
  });
});

describe('shapeToPolyline', () => {
  it('reduce una recta a sus dos extremos', () => {
    expect(shapeToPolyline(lineShape({ x: 0, y: 0 }, { x: 1, y: 0 }))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it('aproxima un arco con el número de segmentos pedido', () => {
    const arc = arcShape({
      center: { x: 0, y: 0 },
      radius: meters(1),
      startAngle: 0,
      sweepAngle: Math.PI,
    });
    expect(shapeToPolyline(arc, 6)).toHaveLength(7);
  });
});
