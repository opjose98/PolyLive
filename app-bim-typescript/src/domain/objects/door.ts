// =============================================================================
// door.ts — Door: Puerta (vano en muro)
// Basado en: Door-especificacion.md (Obsidian 01-Dominio/objetos-bim)
// =============================================================================

import { Meters } from '../geometry/types';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  WallId,
  ObjectProperties,
  AuditPhotoId,
} from './base';

/**
 * Una puerta es un vano (abertura) en un muro.
 *
 * INVARIANTES:
 * - parentWallId es REQUERIDO y debe referir a un Wall existente (no borrado)
 * - offsetAlongWall >= 0 && offsetAlongWall + width <= wall.length (warning, no bloqueo)
 * - width > 0 && height > 0
 *
 * CASCADA:
 * - Si el Wall padre se borra (soft-delete), esta Door también se borra
 */
export class Door extends RevitObjectBase {
  readonly type = 'Door' as const;

  parentWallId: WallId;
  offsetAlongWall: Meters;
  offsetPerpendicular: Meters;
  width: Meters;
  height: Meters;
  doorType?: string;
  material?: string;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    parentWallId: WallId;
    offsetAlongWall: Meters;
    offsetPerpendicular: Meters;
    width: Meters;
    height: Meters;
    doorType?: string;
    material?: string;
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
    this.parentWallId = params.parentWallId;
    this.offsetAlongWall = params.offsetAlongWall;
    this.offsetPerpendicular = params.offsetPerpendicular;
    this.width = params.width;
    this.height = params.height;
    this.doorType = params.doorType;
    this.material = params.material;
  }
}
