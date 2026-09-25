// =============================================================================
// room.ts — Room: Recinto/Espacio — contenedor principal del levantamiento
// Basado en: Room-especificacion.md (Obsidian 01-Dominio/objetos-bim)
// =============================================================================

import { Point2D, SquareMeters } from '../geometry/types';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  LevelId,
  ObjectProperties,
  AuditPhotoId,
} from './base';

/**
 * Un Recinto es la unidad principal de levantamiento.
 * Contiene muros, columnas, puertas, ventanas y define el espacio medido.
 *
 * INVARIANTES CRÍTICAS:
 * - id === roomId SIEMPRE (verificada en validación)
 * - levelId es REQUERIDO y válido
 * - Si isOpen === false → area está definida (calculada por CDT)
 * - Si isOpen === true  → area es null (no calculada hasta cerrar)
 * - geometry.length >= 3 (mínimo 3 vértices para polígono)
 *
 * CICLO DE VIDA:
 * 1. Creación: isOpen = true, geometry = [], isClosed = false
 * 2. Trazo: usuario agrega vértices
 * 3. Cierre: CDT calcula área → isOpen = false
 * 4. Finalización: exportación o abandono
 *
 * isClosed vs isOpen:
 * - isClosed: ¿geométricamente cierra el polígono? (distancia último→primero < 5cm)
 * - isOpen: ¿aún se puede editar? (estado de negocio)
 * - Son INDEPENDIENTES: un Room puede estar isClosed=true pero isOpen=true
 */
export class Room extends RevitObjectBase {
  readonly type = 'Room' as const;

  levelId: LevelId;
  geometry: Point2D[];
  isClosed: boolean;
  isOpen: boolean;
  area: SquareMeters | null;
  localOrigin: Point2D;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    levelId: LevelId;
    geometry?: Point2D[];
    isClosed?: boolean;
    isOpen?: boolean;
    area?: SquareMeters | null;
    localOrigin?: Point2D;
    /** Observaciones libres de campo (campo de RevitObjectBase). */
    notes?: string;
    properties?: ObjectProperties;
    geometry_json?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
    linkedPhotos?: AuditPhotoId[];
  }) {
    super({ ...params });
    this.levelId = params.levelId;
    this.geometry = params.geometry ?? [];
    this.isClosed = params.isClosed ?? false;
    this.isOpen = params.isOpen ?? true;
    this.area = params.area ?? null;
    this.localOrigin = params.localOrigin ?? { x: 0, y: 0 };

    // Serializar geometría
    this.geometry_json = JSON.stringify({ vertices: this.geometry });
  }
}
