// =============================================================================
// wall.ts — Wall: Muro BIM
// Basado en: Wall-especificacion.md (Obsidian 01-Dominio/objetos-bim)
// Enriquecido con el motor de LevON: features/walls/domain/wall.dart
// =============================================================================

import { Point2D, Meters, meters } from '../geometry/types';
import {
  Shape,
  lineShape,
  shapeLength,
  shapeStartPoint,
  shapeEndPoint,
} from '../geometry/shapes';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  ObjectProperties,
  AuditPhotoId,
} from './base';

/**
 * Un muro es un elemento semántico con propiedades físicas (espesor, alto,
 * material) y un EJE CENTRAL que puede ser recto, curvo o una polilínea.
 *
 * INVARIANTES:
 * - startPoint !== endPoint (muro no degenerado)
 * - thickness > 0
 * - height > 0
 * - length === longitud del eje (calculado, no persistido)
 * - Nunca tiene parentWallId — los muros son independientes
 *
 * VANOS DEPENDIENTES:
 * - Un muro puede tener Doors y Windows como "hijos"
 * - Si el muro se borra (soft-delete), sus vanos se borran en cascada
 *
 * JERARQUÍA SEMÁNTICA (portada de LevON):
 *   isStructural = true  → muro portante; cierra recintos en el TopologyGraph
 *   isStructural = false → partición ligera; conecta nodos pero NO cierra recintos
 *
 * COMPATIBILIDAD: `startPoint`/`endPoint` siguen siendo propiedades reales y
 * escribibles, no getters derivados. ObjectStore las persiste y relee por
 * nombre, y MoveObjectUseCase reescribe `geometry_json` con ellas; convertirlas
 * en getters de solo lectura habría roto ambos caminos en silencio. Para un
 * muro recto (el caso por defecto) son la fuente de verdad y `shape` se deriva
 * de ellas; para arcos y polilíneas, `shape` manda y ellas quedan como sus
 * extremos, que es justo lo que la topología y el snap necesitan.
 */
export class Wall extends RevitObjectBase {
  readonly type = 'Wall' as const;

  startPoint: Point2D;
  endPoint: Point2D;
  thickness: Meters;
  height: Meters;
  material?: string;

  /** Eje central del muro. Para muros rectos equivale a startPoint→endPoint. */
  shape: Shape;

  /** Portante (participa en la detección de recintos) o partición ligera. */
  isStructural: boolean;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    /** Alternativa a `shape` para el caso recto, que es el habitual. */
    startPoint?: Point2D;
    endPoint?: Point2D;
    /** Eje no recto (arco o polilínea). Tiene prioridad sobre start/endPoint. */
    shape?: Shape;
    thickness: Meters;
    height: Meters;
    material?: string;
    isStructural?: boolean;
    notes?: string;
    properties?: ObjectProperties;
    geometry_json?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
    linkedPhotos?: AuditPhotoId[];
  }) {
    super(params);

    if (params.shape) {
      this.shape = params.shape;
      this.startPoint = shapeStartPoint(params.shape);
      this.endPoint = shapeEndPoint(params.shape);
    } else if (params.startPoint && params.endPoint) {
      this.startPoint = params.startPoint;
      this.endPoint = params.endPoint;
      this.shape = lineShape(params.startPoint, params.endPoint);
    } else {
      throw new Error('Wall requiere `shape`, o bien `startPoint` y `endPoint`.');
    }

    this.thickness = params.thickness;
    this.height = params.height;
    this.material = params.material;
    this.isStructural = params.isStructural ?? true;

    // Serializar geometría. `startPoint`/`endPoint` se mantienen en la raíz del
    // JSON por compatibilidad: MoveObjectUseCase y ObjectStore los leen de ahí.
    // `shape` solo se añade cuando aporta algo que los extremos no capturan —
    // así un muro recto serializa exactamente igual que antes de este cambio y
    // las filas de SQLite ya existentes siguen siendo válidas.
    this.geometry_json = JSON.stringify(
      this.shape.kind === 'line'
        ? { startPoint: this.startPoint, endPoint: this.endPoint }
        : { startPoint: this.startPoint, endPoint: this.endPoint, shape: this.shape },
    );
  }

  /** Longitud del eje (no persistida). Para arcos es la longitud del arco. */
  get length(): Meters {
    return this.shape.kind === 'line'
      ? meters(Math.hypot(this.endPoint.x - this.startPoint.x, this.endPoint.y - this.startPoint.y))
      : shapeLength(this.shape);
  }

  /** `true` si el eje es un segmento recto. */
  get isStraight(): boolean {
    return this.shape.kind === 'line';
  }
}
