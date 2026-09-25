// =============================================================================
// shapes.ts — Geometría polimórfica de ejes (Line / Arc / Polyline)
// Portado de LevON: lib/shared/domain/shapes.dart
// =============================================================================
//
// Un muro NO es solo una línea: su eje central puede ser recto, curvo o una
// polilínea libre. Estas formas describen ese eje; el espesor se aplica como
// desplazamiento perpendicular al renderizar.
//
// DECISIÓN DE PORT: LevON modela Shape como jerarquía de clases abstractas
// (`abstract class Shape` + subclases). Aquí se usa una UNIÓN DISCRIMINADA por
// el campo `kind` en vez de clases, por una razón concreta de PolyLive: cada
// objeto BIM persiste su geometría en `geometry_json` (ver base.ts) y se
// rehidrata desde SQLite con `JSON.parse`. Una unión discriminada sobrevive el
// viaje JSON→objeto sin revivers ni `Object.setPrototypeOf`; una jerarquía de
// clases perdería el prototipo al deserializar y `instanceof` fallaría en
// silencio tras leer de la base de datos.
//
// Las formas son INMUTABLES: modificar la geometría implica crear otra.
// =============================================================================

import { Point2D, Meters, meters } from './types';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Segmento recto entre dos puntos — la forma más común en BIM arquitectónico. */
export interface LineShape {
  readonly kind: 'line';
  readonly start: Point2D;
  readonly end: Point2D;
}

/**
 * Arco circular definido por centro, radio, ángulo inicial y barrido.
 * Ángulos en RADIANES (no `Degrees`): son ángulos de barrido para trigonometría
 * directa, no orientaciones normalizadas a [0,360) como el branded `Degrees`.
 */
export interface ArcShape {
  readonly kind: 'arc';
  readonly center: Point2D;
  readonly radius: Meters;
  /** Ángulo inicial en radianes, medido desde el eje X positivo. */
  readonly startAngle: number;
  /** Barrido angular en radianes. Positivo = antihorario, negativo = horario. */
  readonly sweepAngle: number;
}

/** Polilínea de múltiples vértices, para muros irregulares o formas libres. */
export interface PolylineShape {
  readonly kind: 'polyline';
  readonly vertices: readonly Point2D[];
}

/** Eje central de un elemento lineal BIM. */
export type Shape = LineShape | ArcShape | PolylineShape;

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

export function lineShape(start: Point2D, end: Point2D): LineShape {
  return { kind: 'line', start, end };
}

export function arcShape(params: {
  center: Point2D;
  radius: Meters;
  startAngle: number;
  sweepAngle: number;
}): ArcShape {
  return {
    kind: 'arc',
    center: params.center,
    radius: params.radius,
    startAngle: params.startAngle,
    sweepAngle: params.sweepAngle,
  };
}

export function polylineShape(vertices: readonly Point2D[]): PolylineShape {
  return { kind: 'polyline', vertices };
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/** Punto de inicio del eje — anclaje para conexiones topológicas. */
export function shapeStartPoint(shape: Shape): Point2D {
  switch (shape.kind) {
    case 'line':
      return shape.start;
    case 'arc':
      return pointOnArc(shape, shape.startAngle);
    case 'polyline':
      return shape.vertices[0] ?? ORIGIN;
  }
}

/** Punto de fin del eje — anclaje para conexiones topológicas. */
export function shapeEndPoint(shape: Shape): Point2D {
  switch (shape.kind) {
    case 'line':
      return shape.end;
    case 'arc':
      return pointOnArc(shape, shape.startAngle + shape.sweepAngle);
    case 'polyline':
      return shape.vertices[shape.vertices.length - 1] ?? ORIGIN;
  }
}

/** Longitud lineal total del eje en metros. */
export function shapeLength(shape: Shape): Meters {
  switch (shape.kind) {
    case 'line':
      return meters(distance(shape.start, shape.end));
    case 'arc':
      return meters(shape.radius * Math.abs(shape.sweepAngle));
    case 'polyline': {
      let total = 0;
      for (let i = 0; i < shape.vertices.length - 1; i++) {
        total += distance(shape.vertices[i], shape.vertices[i + 1]);
      }
      return meters(total);
    }
  }
}

/**
 * Aproxima un arco como polilínea de `segments` segmentos.
 *
 * Incluye TANTO el punto inicial COMO el final. Al concatenar arcos para formar
 * un polígono hay que excluir el último punto, porque coincide con el inicial
 * del siguiente tramo (ver TopologyGraph / DetectRoomsUseCase).
 */
export function approximateArc(arc: ArcShape, segments = 24): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(pointOnArc(arc, arc.startAngle + (arc.sweepAngle * i) / segments));
  }
  return points;
}

/**
 * Traslada la forma completa por (dx, dy), preservando su tipo.
 *
 * Mover un muro curvo NO es mover sus extremos: hay que desplazar el centro del
 * arco, o el arco se deformaría al reconstruirlo desde extremos nuevos. Esta
 * función existe para que MoveObjectUseCase pueda mover arcos y polilíneas sin
 * degradarlos a rectas.
 */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'line':
      return lineShape(translatePoint(shape.start, dx, dy), translatePoint(shape.end, dx, dy));
    case 'arc':
      return { ...shape, center: translatePoint(shape.center, dx, dy) };
    case 'polyline':
      return polylineShape(shape.vertices.map((v) => translatePoint(v, dx, dy)));
  }
}

/**
 * Reduce cualquier forma a la polilínea que la aproxima.
 * Una recta son sus dos extremos; un arco, su aproximación poligonal.
 */
export function shapeToPolyline(shape: Shape, arcSegments = 24): Point2D[] {
  switch (shape.kind) {
    case 'line':
      return [shape.start, shape.end];
    case 'arc':
      return approximateArc(shape, arcSegments);
    case 'polyline':
      return [...shape.vertices];
  }
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

const ORIGIN: Point2D = { x: 0, y: 0 };

function pointOnArc(arc: ArcShape, angle: number): Point2D {
  return {
    x: arc.center.x + arc.radius * Math.cos(angle),
    y: arc.center.y + arc.radius * Math.sin(angle),
  };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function translatePoint(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}
