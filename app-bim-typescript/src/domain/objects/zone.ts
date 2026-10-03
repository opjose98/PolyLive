// =============================================================================
// zone.ts — Recinto con identidad (la "habitación" de Revit, el IfcSpace)
// =============================================================================
//
// Un Recinto es el espacio cerrado que forman los muros de un nivel. Hasta
// T0 se derivaba en cada recarga (sin id, "Recinto 1, 2…" por orden de área)
// y solo el mayor se guardaba. Ahora es un MODELO PERSISTIDO: tiene id
// estable, número, nombre, uso y notas, y todo lo que se le cuelgue (suelo,
// avance, IfcSpace) sobrevive a que los muros se muevan.
//
// La identidad la lleva la SEMILLA: un punto interior guardado. Al recargar,
// cada contorno detectado se asigna al recinto cuya semilla contiene (ver
// application/topology/reconcileZones.ts).
//
// Geometría:
//   · `polygon`    contorno AL EJE de los muros (lo que detecta la topología);
//   · `netPolygon` contorno a CARA INTERIOR (eje desplazado medio espesor de
//                  cada muro). El área NETA es la del piso que se pisa, la que
//                  usan Revit (Room), cuantificación y avance.
// =============================================================================

import type { Point2D } from '../geometry/types';
import { centroid, isPointInPolygon, polygonArea, signedArea } from '../geometry/polygon-utils';

export interface Zone {
  readonly id: string;
  /** Espacio (contenedor del levantamiento, el `room_id` de todo lo dibujado). */
  readonly spaceId: string;
  /** Nivel en el que se detectó ('' si el proyecto no tiene niveles). */
  readonly levelId: string;
  /** Número correlativo dentro del espacio: 1, 2, 3… (se muestra como R-01). */
  readonly number: number;
  readonly name: string;
  /** Uso (dormitorio, baño, oficina…). Libre. */
  readonly use: string;
  readonly notes: string;
  /** Contorno al eje (vacío si nunca se cerró). */
  readonly polygon: readonly Point2D[];
  /** Contorno a cara interior. */
  readonly netPolygon: readonly Point2D[];
  /** Punto interior que da la identidad. */
  readonly seed: Point2D;
  /** Área al eje (m²). */
  readonly area: number;
  /** Área neta, a cara interior (m²). */
  readonly netArea: number;
  /** Perímetro neto (m). */
  readonly perimeter: number;
  /**
   * `true` si hoy hay un contorno cerrado que le corresponde. Un recinto que
   * deja de cerrarse (se borró un muro) queda DESLIGADO, no borrado: al
   * deshacer, su semilla vuelve a caer dentro y recupera su identidad.
   */
  readonly bound: boolean;
  readonly createdAt: string;
}

/** Código corto del recinto: R-01, R-02… */
export function zoneCode(z: Pick<Zone, 'number'>): string {
  return `R-${String(z.number).padStart(2, '0')}`;
}

/** Nombre por defecto de un recinto nuevo. */
export function defaultZoneName(number: number): string {
  return `Recinto ${number}`;
}

// ---------------------------------------------------------------------------
// Punto interior (semilla)
// ---------------------------------------------------------------------------

/**
 * Un punto garantizadamente DENTRO del polígono. El centroide no sirve en
 * general (en una L cae afuera): se usa si cae dentro y, si no, el punto medio
 * del tramo interior más ancho de una línea horizontal por el medio.
 */
export function interiorPoint(polygon: readonly Point2D[]): Point2D {
  const c = centroid(polygon);
  if (isPointInPolygon(c, polygon)) return c;
  const ys = polygon.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best: { p: Point2D; w: number } | null = null;
  // Varias líneas: alguna atraviesa la parte más ancha.
  for (const k of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    const y = minY + (maxY - minY) * k;
    const xs: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (!best || w > best.w) best = { p: { x: (xs[i] + xs[i + 1]) / 2, y }, w };
    }
  }
  return best?.p ?? c;
}

// ---------------------------------------------------------------------------
// Contorno neto (a cara interior)
// ---------------------------------------------------------------------------

/** Lo mínimo de un muro para conocer el espesor de cada lado del recinto. */
export interface ZoneWall {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly thickness: number;
}

const EDGE_ON_AXIS_TOL = 1e-3;

function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Espesor del muro que forma cada lado `polygon[i] → polygon[i+1]`: el muro
 * cuyo eje contiene ese lado (un lado puede ser un tramo de un muro partido
 * por una T). 0 si ninguno lo contiene.
 */
export function edgeThicknesses(polygon: readonly Point2D[], walls: readonly ZoneWall[]): number[] {
  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let t = 0;
    for (const w of walls) {
      if (
        distToSegment(mid, w.start, w.end) < EDGE_ON_AXIS_TOL &&
        distToSegment(a, w.start, w.end) < EDGE_ON_AXIS_TOL &&
        distToSegment(b, w.start, w.end) < EDGE_ON_AXIS_TOL
      ) {
        t = Math.max(t, w.thickness);
      }
    }
    return t;
  });
}

function intersectLines(p: Point2D, d: Point2D, q: Point2D, e: Point2D): Point2D | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return { x: p.x + t * d.x, y: p.y + t * d.y };
}

/**
 * Desplaza cada lado hacia adentro su distancia (`offsets[i]` para el lado
 * i → i+1) y recalcula cada vértice como cruce de los dos lados vecinos.
 * Devuelve `null` si el resultado se da vuelta o se anula (recinto más
 * estrecho que sus muros).
 */
export function insetPolygon(polygon: readonly Point2D[], offsets: readonly number[]): Point2D[] | null {
  const n = polygon.length;
  if (n < 3) return null;
  const sa = signedArea(polygon);
  if (Math.abs(sa) < 1e-12) return null;
  // Hacia adentro es la izquierda del recorrido si el área es positiva.
  const sign = sa > 0 ? 1 : -1;
  const lines = polygon.map((a, i) => {
    const b = polygon[(i + 1) % n];
    const d = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(d.x, d.y) || 1;
    const nx = (-d.y / len) * sign;
    const ny = (d.x / len) * sign;
    const o = offsets[i] ?? 0;
    return { p: { x: a.x + nx * o, y: a.y + ny * o }, d };
  });
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    // Lados colineales (un muro partido por una T): el vértice es el punto desplazado.
    out.push(intersectLines(prev.p, prev.d, cur.p, cur.d) ?? cur.p);
  }
  const outArea = signedArea(out);
  if (Math.sign(outArea) !== Math.sign(sa) || Math.abs(outArea) < 1e-6) return null;
  return out;
}

export interface NetGeometry {
  readonly netPolygon: Point2D[];
  readonly netArea: number;
  readonly perimeter: number;
}

/** Contorno, área y perímetro a cara interior. Sin espesores conocidos, coinciden con el eje. */
export function netGeometry(polygon: readonly Point2D[], walls: readonly ZoneWall[]): NetGeometry {
  const half = edgeThicknesses(polygon, walls).map((t) => t / 2);
  const net = insetPolygon(polygon, half) ?? [...polygon];
  let perimeter = 0;
  for (let i = 0; i < net.length; i++) {
    const a = net[i];
    const b = net[(i + 1) % net.length];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return { netPolygon: net, netArea: polygonArea(net) as number, perimeter };
}
