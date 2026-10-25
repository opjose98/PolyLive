// =============================================================================
// floor.ts — Floor: Piso/Losa del Recinto
// Basado en: Floor-especificacion.md (Obsidian 01-Dominio/objetos-bim)
// =============================================================================

import { Meters, Point2D } from '../geometry/types';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  ObjectProperties,
  AuditPhotoId,
} from './base';

/**
 * Un piso es una superficie horizontal que cierra el Recinto.
 * Se materializa automáticamente al cerrar un Room (isImplicit = true),
 * a menos que ya exista uno explícito.
 *
 * INVARIANTES:
 * - Solo un Floor por Recinto
 * - isImplicit: true → generado automáticamente al cerrar Room
 * - isImplicit: false → creado explícitamente por el usuario
 * - No tiene geometría propia — la hereda del Room
 */
/**
 * Suelo ligado a un recinto (F6a): `properties[FLOOR_ZONE_PROP]` es el id del
 * recinto (zones.id). El suelo no guarda contorno propio: toma el NETO de su
 * recinto, así que mover un muro mueve también el borde del suelo.
 */
export const FLOOR_ZONE_PROP = 'zoneId';

/** Recinto al que está ligado un suelo, o `null` (suelos implícitos anteriores a F6a). */
export function floorZoneId(floor: { readonly properties?: Record<string, unknown> }): string | null {
  const z = floor.properties?.[FLOOR_ZONE_PROP];
  return typeof z === 'string' ? z : null;
}

/**
 * Suelo libre (andenes, patios, losas fuera de un recinto): sin recinto, con
 * contorno propio. Cualquier suelo puede tener vacíos (huecos de escalera,
 * jardineras, registros): se descuentan de su área.
 */
export function isFreeFloor(floor: Floor): boolean {
  return floorZoneId(floor) === null && (floor.outline?.length ?? 0) >= 3;
}

/** Área de un polígono (valor absoluto, fórmula del lazo). */
export function polygonArea(poly: readonly Point2D[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Área neta: contorno menos vacíos. */
export function netFloorArea(outline: readonly Point2D[], holes: readonly (readonly Point2D[])[] = []): number {
  return Math.max(0, polygonArea(outline) - holes.reduce((a, h) => a + polygonArea(h), 0));
}

/** Rectángulo alineado a los ejes con esquinas opuestas `a` y `b`. */
export function rectPolygon(a: Point2D, b: Point2D): Point2D[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}

/**
 * Círculo como polígono regular de `n` lados.
 * shortcut: 48 lados (error de área < 0,3 %); si hiciera falta exacto, guardar centro y radio.
 */
export function circlePolygon(center: Point2D, radius: number, n = 48): Point2D[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) };
  });
}

export class Floor extends RevitObjectBase {
  readonly type = 'Floor' as const;

  isImplicit: boolean;
  material?: string;
  thickness?: Meters;
  /** Contorno propio (solo suelos libres; los de recinto toman el de su recinto). */
  outline?: Point2D[];
  /** Vacíos del suelo, en coordenadas del espacio. */
  holes?: Point2D[][];

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    isImplicit: boolean;
    material?: string;
    thickness?: Meters;
    outline?: Point2D[];
    holes?: Point2D[][];
    /** Observaciones libres de campo (campo de RevitObjectBase). */
    notes?: string;
    properties?: ObjectProperties;
    geometry_json?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
    linkedPhotos?: AuditPhotoId[];
  }) {
    super(params);
    this.isImplicit = params.isImplicit;
    this.material = params.material;
    this.thickness = params.thickness;
    this.outline = params.outline;
    this.holes = params.holes;
  }
}
