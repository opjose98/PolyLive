// =============================================================================
// audit-photo.ts — AuditPhoto: Foto de auditoría vinculada a un Recinto
// Basado en: CapturePhotoUseCase.md (Obsidian 02-Aplicación/use-cases)
// =============================================================================

import { AuditPhotoId, RoomId, RevitObjectId } from './base';
import { Point2D } from '../geometry/types';

/**
 * Posición de la foto sobre la planta del Recinto (SPDS, portado de LevON:
 * `PhotoMarkerEntity`).
 *
 * POR QUÉ IMPORTA: una foto de obra sin ubicación es casi inútil al volver al
 * despacho. "La humedad del rincón" no se puede situar en el plano tres días
 * después, y menos si el levantamiento tiene cuarenta fotos. El marcador ancla
 * la foto a un punto concreto de la planta y la hace localizable.
 *
 * `direction` es el rumbo de la cámara en grados desde el eje +X, para dibujar
 * el cono de visión: sin él, un marcador dice dónde se estaba pero no qué se
 * estaba mirando.
 */
export interface PhotoMarker {
  readonly position: Point2D;
  readonly direction?: number;
  /** Un marcador oculto sigue existiendo pero no se dibuja en planta. */
  readonly visible?: boolean;
  /** Foto tomada en el alzado: cara del muro y punto (x desde el inicio del muro, y altura). */
  readonly face?: PhotoFaceAnchor;
}

/** Ancla de una foto a la cara de un muro (alzado). */
export interface PhotoFaceAnchor {
  readonly wallId: string;
  readonly side: 'A' | 'B';
  readonly x: number;
  readonly y: number;
}

/** Coordenadas GPS del punto de captura, si se pudieron obtener. */
export interface PhotoGeoTag {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number;
}

/**
 * Metadata de una foto de auditoría.
 *
 * Todos los campos son OPCIONALES salvo `timestamp` y `filename`: una foto
 * tomada con prisa, sin GPS y sin vincular sigue siendo una foto válida, y
 * exigir metadatos convertiría la captura en un formulario.
 */
export interface PhotoMetadata {
  timestamp: number;
  filename: string;
  linkedObjectId?: string;
  notes?: string;
  /** Código BIM corto de la foto dentro del Recinto (FOT001, FOT002...). */
  bimCode?: string;
  /** Posición en la planta. */
  marker?: PhotoMarker;
  /** Coordenadas geográficas de la captura. */
  geo?: PhotoGeoTag;
  /** Operador que la tomó, para trazabilidad. */
  operator?: string;
  [key: string]: unknown;
}

/** Prefijo de los códigos BIM de foto. */
export const PHOTO_BIM_CODE_PREFIX = 'FOT';

/**
 * Una foto de auditoría capturada desde el dispositivo.
 * Se almacena como BLOB en SQLite con metadata JSON.
 * No hereda de RevitObjectBase — es una entidad independiente.
 *
 * INVARIANTES:
 * - roomId es REQUERIDO — toda foto pertenece a un Recinto
 * - foto contiene el BLOB de la imagen (JPEG)
 * - metadata_json contiene { timestamp, filename, ... }
 * - Si la inserción en SQLite falla, se hace rollback del archivo en filesystem
 *
 * `foto: Uint8Array`, no `Buffer`: el global `Buffer` de Node no existe en
 * Hermes/React Native — un `CapturePhotoUseCase.execute()` construido con
 * `Buffer.from(...)` lanzaría `ReferenceError: Buffer is not defined` en un
 * dispositivo real. `Uint8Array` es el tipo binario que SÍ existe en ambos
 * runtimes (y una instancia de `Buffer` en Node sigue siendo, estructuralmente,
 * un `Uint8Array` — el código existente que usa `Buffer.from()` en tests de
 * Node sigue funcionando sin cambios).
 */
export class AuditPhoto {
  readonly id: AuditPhotoId;
  readonly roomId: RoomId;

  foto: Uint8Array | null;
  metadata_json: string;
  linkedObjectId?: RevitObjectId;

  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  constructor(params: {
    id: AuditPhotoId;
    roomId: RoomId;
    foto?: Uint8Array | null;
    metadata_json: string;
    linkedObjectId?: RevitObjectId;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
  }) {
    this.id = params.id;
    this.roomId = params.roomId;
    this.foto = params.foto ?? null;
    this.metadata_json = params.metadata_json;
    this.linkedObjectId = params.linkedObjectId;
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }

  /**
   * Metadata parseada.
   *
   * Nunca lanza: un `metadata_json` corrupto (una escritura interrumpida, una
   * fila migrada a mano) dejaría la galería entera sin abrir por una sola foto
   * mal escrita. Se devuelve lo mínimo indispensable y la foto sigue siendo
   * visible, que es lo que le importa al operador.
   */
  get metadata(): PhotoMetadata {
    try {
      const parsed = JSON.parse(this.metadata_json) as Partial<PhotoMetadata>;
      return {
        timestamp: parsed.timestamp ?? this.created_at.getTime(),
        filename: parsed.filename ?? `${this.id as string}.jpg`,
        ...parsed,
      } as PhotoMetadata;
    } catch {
      return { timestamp: this.created_at.getTime(), filename: `${this.id as string}.jpg` };
    }
  }

  /** Reescribe la metadata conservando lo que ya había. */
  patchMetadata(patch: Partial<PhotoMetadata>): void {
    this.metadata_json = JSON.stringify({ ...this.metadata, ...patch });
    this.updated_at = new Date();
  }
}
