// =============================================================================
// window.ts — Window: Ventana (vano en muro)
// Basado en: Window-especificacion.md (Obsidian 01-Dominio/objetos-bim)
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
 * Una ventana es un vano en un muro, estructuralmente similar a Door
 * pero con propósito diferente (ventilación, iluminación).
 *
 * INVARIANTES: idénticas a Door
 * - parentWallId es REQUERIDO y debe referir a un Wall existente
 * - width > 0 && height > 0
 *
 * CASCADA: si el Wall padre se borra, esta Window también se borra
 */
export class Window extends RevitObjectBase {
  readonly type = 'Window' as const;

  parentWallId: WallId;
  offsetAlongWall: Meters;
  offsetPerpendicular: Meters;
  width: Meters;
  height: Meters;
  windowType?: string;
  frameType?: string;
  glazing?: string;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    parentWallId: WallId;
    offsetAlongWall: Meters;
    offsetPerpendicular: Meters;
    width: Meters;
    height: Meters;
    windowType?: string;
    frameType?: string;
    glazing?: string;
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
    this.windowType = params.windowType;
    this.frameType = params.frameType;
    this.glazing = params.glazing;
  }
}
