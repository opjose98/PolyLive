// =============================================================================
// base.ts — RevitObjectBase: Clase base para todos los objetos BIM
// Basado en: RevitObjectBase.md (Obsidian 01-Dominio/objetos-bim)
// =============================================================================

import { Point2D, Meters, SquareMeters } from '../geometry/types';

// ---------------------------------------------------------------------------
// Branded IDs — para seguridad de tipos
// ---------------------------------------------------------------------------

export type RevitObjectId = string & { readonly __brand: 'RevitObjectId' };
export type RoomId = string & { readonly __brand: 'RoomId' };
export type LevelId = string & { readonly __brand: 'LevelId' };
export type WallId = string & { readonly __brand: 'WallId' };
export type AuditPhotoId = string & { readonly __brand: 'AuditPhotoId' };
export type MeasurementId = string & { readonly __brand: 'MeasurementId' };

export function revitObjectId(value: string): RevitObjectId {
  return value as RevitObjectId;
}

export function roomId(value: string): RoomId {
  return value as RoomId;
}

export function levelId(value: string): LevelId {
  return value as LevelId;
}

export function wallId(value: string): WallId {
  return value as WallId;
}

export function auditPhotoId(value: string): AuditPhotoId {
  return value as AuditPhotoId;
}

export function measurementId(value: string): MeasurementId {
  return value as MeasurementId;
}

// ---------------------------------------------------------------------------
// Tipos de objeto BIM
// ---------------------------------------------------------------------------

export type RevitObjectType = 'Wall' | 'Door' | 'Window' | 'Column' | 'Floor' | 'Room';

// ---------------------------------------------------------------------------
// Propiedades generales
// ---------------------------------------------------------------------------

/**
 * Propiedades LIBRES del objeto: las que no tienen un campo tipado propio.
 *
 * `notes` y `material` estaban declaradas aquí Y además como campos de Wall,
 * Column, Door, Window y Floor. Dos sitios para el mismo dato significaba que
 * escribir `properties.notes` y leer `wall.notes` daban cosas distintas, y que
 * la serialización pisaba una con la otra según el orden. `notes` pasó a ser
 * un campo de `RevitObjectBase` (toda observación de campo vale para cualquier
 * objeto) y `material` se queda como campo de las clases que lo tienen.
 */
export interface ObjectProperties {
  name?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// RevitObjectBase — Clase base abstracta
// ---------------------------------------------------------------------------

/**
 * Clase base para todos los objetos BIM (Wall, Door, Window, Column, Floor, Room).
 *
 * INVARIANTES:
 * - `id` es único dentro del Recinto y no cambia después de creación
 * - `roomId` es REQUERIDO — nunca null ni undefined
 * - `is_deleted: true` significa soft-delete — excluido de exportaciones
 * - `created_at <= updated_at` siempre
 */
export abstract class RevitObjectBase {
  readonly id: RevitObjectId;
  abstract readonly type: RevitObjectType;
  readonly roomId: RoomId;

  properties: ObjectProperties;
  geometry_json: string;

  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  linkedPhotos: AuditPhotoId[];

  /**
   * Observaciones libres de campo. Vive en la base y no en cada subclase
   * porque cualquier objeto levantado puede llevar una anotación: "revisar
   * humedad", "el cliente pide quitarlo", "medida estimada, no accesible".
   */
  notes?: string;

  constructor(params: {
    id: RevitObjectId;
    roomId: RoomId;
    properties?: ObjectProperties;
    notes?: string;
    geometry_json?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
    linkedPhotos?: AuditPhotoId[];
  }) {
    this.id = params.id;
    this.roomId = params.roomId;
    this.properties = params.properties ?? {};
    this.geometry_json = params.geometry_json ?? '{}';
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
    this.linkedPhotos = params.linkedPhotos ?? [];
    this.notes = params.notes;
  }
}

// ---------------------------------------------------------------------------
// IObjectStore — Interfaz del repositorio de persistencia
// ---------------------------------------------------------------------------

/**
 * Interfaz que debe implementar cualquier store de objetos BIM.
 * Todas las operaciones son transaccionales.
 *
 * INVARIANTES:
 * - deleteObject() hace soft-delete (is_deleted = true), nunca DELETE físico
 * - listObjects() excluye objetos con is_deleted = true
 * - createObject() valida foreign keys (ej. Door.parentWallId debe existir)
 */
export interface IObjectStore {
  createObject(obj: RevitObjectBase): Promise<RevitObjectId>;
  readObject(id: RevitObjectId): Promise<RevitObjectBase | null>;
  updateObject(id: RevitObjectId, updates: Partial<RevitObjectBase>): Promise<void>;
  deleteObject(id: RevitObjectId): Promise<void>;
  listObjects(roomId: RoomId): Promise<RevitObjectBase[]>;

  /**
   * Revierte un soft-delete: vuelve a poner `is_deleted = 0`. Es la inversa
   * exacta de `deleteObject` e incluye la misma cascada (restaurar un Wall
   * restaura los vanos que se borraron con él).
   *
   * POR QUÉ ES PARTE DEL CONTRATO: sin esta operación el REDO de cualquier
   * creación es imposible. Los comandos `Create*Command` persisten el objeto
   * en el UseCase y dejan su `execute()` vacío ("ya está persistido"); su
   * `undo()` hace soft-delete. Al rehacer, CommandStack vuelve a llamar a
   * `execute()` — que no hacía nada — así que el objeto se quedaba borrado y
   * el Redo era un no-op silencioso para muros, columnas, puertas y ventanas.
   *
   * Es idempotente: restaurar algo que no está borrado no cambia nada, lo que
   * permite que `execute()` la llame también en la primera ejecución.
   */
  restoreObject(id: RevitObjectId): Promise<void>;
}

// ---------------------------------------------------------------------------
// Utilidad para generar IDs
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Genera un RevitObjectId único (UUID-like para producción, incremental para tests). */
export function generateId(): RevitObjectId {
  _idCounter++;
  const timestamp = Date.now().toString(36);
  const counter = _idCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return revitObjectId(`${timestamp}-${counter}-${random}`);
}
