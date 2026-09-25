// =============================================================================
// column.ts — Column: Columna BIM
// Basado en: Column-especificación.md (Obsidian 01-Dominio/objetos-bim)
// Enriquecido con el motor de LevON: features/walls/domain/column.dart
// =============================================================================

import { Point2D, Meters, meters } from '../geometry/types';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  WallId,
  ObjectProperties,
  AuditPhotoId,
} from './base';

/** Forma de la sección transversal de una columna. */
export type ColumnSectionShape = 'circular' | 'rectangular';

/**
 * Una columna es un elemento vertical, cilíndrico o prismático,
 * que puede estar embebida en un muro o libre en el espacio.
 *
 * SISTEMA DE DIMENSIONES (portado de LevON):
 *   circular    → dimensionX = DIÁMETRO total (el radio es dimensionX / 2)
 *   rectangular → dimensionX = ancho (eje X local), dimensionY = canto (eje Y local)
 *
 * INVARIANTES:
 * - dimensionX > 0; para rectangulares, dimensionY > 0
 * - height > 0
 * - Si embeddedInWallId está definido, la columna está dentro del muro
 *   (sin validación de distancia — permite cualquier posición)
 * - Si embeddedInWallId es undefined, la columna está libre en el Recinto
 *   (warning si está fuera del Recinto, no bloqueo)
 *
 * TRIANGULACIÓN CDT:
 * - Columnas dentro del Recinto generan huecos que se restan del polígono.
 *   Circulares → hueco circular de radio dimensionX / 2.
 *   Rectangulares → hueco poligonal de 4 vértices, ya rotado (ver footprint()).
 *
 * COMPATIBILIDAD: `diameter` se conserva como alias de `dimensionX` porque
 * ObjectStore lo persiste con ese nombre y el resto del código (CDT, IFC,
 * validación) lo lee así. Para una columna rectangular `diameter` devuelve el
 * ancho, que es la lectura menos engañosa disponible sin romper ese contrato.
 */
export class Column extends RevitObjectBase {
  readonly type = 'Column' as const;

  position: Point2D;
  height: Meters;
  embeddedInWallId?: WallId;
  material?: string;

  /** Forma de la sección transversal. */
  sectionShape: ColumnSectionShape;

  /** Circular: diámetro. Rectangular: ancho (eje X local, antes de rotar). */
  dimensionX: Meters;

  /** Rectangular: canto (eje Y local). Ignorado y almacenado como 0 si es circular. */
  dimensionY: Meters;

  /** Rotación de la sección en radianes, desde el eje X positivo. 0 = sin rotar. */
  rotation: number;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    position: Point2D;
    /** Alias histórico de `dimensionX`; para columnas circulares es el diámetro. */
    diameter?: Meters;
    sectionShape?: ColumnSectionShape;
    dimensionX?: Meters;
    dimensionY?: Meters;
    rotation?: number;
    height: Meters;
    embeddedInWallId?: WallId;
    material?: string;
    notes?: string;
    properties?: ObjectProperties;
    geometry_json?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
    linkedPhotos?: AuditPhotoId[];
  }) {
    super(params);
    this.position = params.position;
    this.height = params.height;
    this.embeddedInWallId = params.embeddedInWallId;
    this.material = params.material;

    this.sectionShape = params.sectionShape ?? 'circular';

    const primary = params.dimensionX ?? params.diameter;
    if (primary === undefined) {
      throw new Error('Column requiere `dimensionX` (o `diameter`).');
    }
    this.dimensionX = primary;

    // Una columna rectangular sin canto explícito es cuadrada; una circular
    // no usa dimensionY en absoluto y se normaliza a 0 para que nunca se lea
    // por accidente un valor heredado de otra columna.
    this.dimensionY =
      this.sectionShape === 'rectangular' ? params.dimensionY ?? primary : meters(0);

    this.rotation = params.rotation ?? 0;

    this.geometry_json = JSON.stringify({ position: this.position });
  }

  /** Alias histórico de `dimensionX`. Para circulares, el diámetro. */
  get diameter(): Meters {
    return this.dimensionX;
  }

  get isCircular(): boolean {
    return this.sectionShape === 'circular';
  }

  /** Ancho de una columna rectangular (eje X local). */
  get width(): Meters {
    return this.dimensionX;
  }

  /** Canto de una columna rectangular (eje Y local). */
  get depth(): Meters {
    return this.dimensionY;
  }

  /**
   * Huella en planta como polígono en coordenadas MUNDO, con la rotación ya
   * aplicada. Para circulares devuelve `null`: un círculo no es un polígono y
   * forzarlo a serlo aquí escondería el muestreo detrás de una API que parece
   * exacta. Quien triangule decide cuántos segmentos usar.
   */
  footprint(): Point2D[] | null {
    if (this.sectionShape !== 'rectangular') return null;

    const hx = this.dimensionX / 2;
    const hy = this.dimensionY / 2;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    return [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: -hx, y: hy },
    ].map((c) => ({
      x: this.position.x + c.x * cos - c.y * sin,
      y: this.position.y + c.x * sin + c.y * cos,
    }));
  }
}
