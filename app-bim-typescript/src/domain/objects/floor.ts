// =============================================================================
// floor.ts — Floor: Piso/Losa del Recinto
// Basado en: Floor-especificacion.md (Obsidian 01-Dominio/objetos-bim)
// =============================================================================

import { Meters } from '../geometry/types';
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
export class Floor extends RevitObjectBase {
  readonly type = 'Floor' as const;

  isImplicit: boolean;
  material?: string;
  thickness?: Meters;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    isImplicit: boolean;
    material?: string;
    thickness?: Meters;
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
  }
}
