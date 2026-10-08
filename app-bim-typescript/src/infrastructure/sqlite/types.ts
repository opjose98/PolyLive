// =============================================================================
// types.ts — Tipos TypeScript para filas SQL (mapeo 1:1 con tablas SQLite)
// =============================================================================

/**
 * Fila de la tabla `revit_objects`.
 * Almacena todos los objetos BIM (Wall, Door, Window, Column, Floor, Room).
 */
export interface RevitObjectRow {
  id: string;
  object_type: string;
  room_id: string;
  geometry_json: string;
  properties_json: string;
  is_deleted: number;          // SQLite no tiene boolean — 0 = false, 1 = true
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
}

/**
 * Fila de la tabla `measurements`.
 */
export interface MeasurementRow {
  id: string;
  room_id: string;
  wall_id: string;
  capture_method: string;      // 'ble' | 'manual'
  values_json: string;         // JSON array de muestras
  average: number;             // promedio en metros
  reference?: string;          // 'interior' | 'exterior' | 'axis' (v2)
  applied_length?: number | null; // longitud de eje aplicada al muro (v2)
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fila de la tabla `audit_photos`.
 */
export interface AuditPhotoRow {
  id: string;
  room_id: string;
  foto: Uint8Array | null;     // BLOB JPEG — sqlite3 (Node) retorna un Buffer,
                                // que es estructuralmente un Uint8Array; expo-sqlite
                                // (dispositivo) retorna Uint8Array puro. Ninguno de
                                // los dos usa `Buffer` como tipo del contrato porque
                                // el global `Buffer` de Node NO existe en Hermes/RN.
  metadata_json: string;       // JSON con { timestamp, filename, linkedObjectId?, ... }
  linked_object_id: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fila de la tabla `operators` — ver domain/objects/operator.ts para el
 * alcance deliberadamente mínimo (solo nombre, sin autenticación).
 */
export interface OperatorRow {
  id: string;
  name: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
