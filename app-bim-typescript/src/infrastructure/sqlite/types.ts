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
 * Fila de la tabla `polygon_drafts` (para recuperación de polígonos en progreso).
 */
export interface PolygonDraftRow {
  id: string;
  room_id: string;
  vertices_json: string;       // JSON array de Point2D
  is_closed: number;
  saved_at: string;
}

/**
 * Fila de la tabla `sites` (Spike #7 — SiteCoordinateSystem, a lo sumo una
 * fila por site_id; ver invariante de inmutabilidad en schema.ts).
 */
export interface SiteRow {
  site_id: string;
  origin_json: string;         // JSON de Point3D
  north_rotation: number;
  defined_at: string;          // ISO 8601
  defined_by: string;
}

/**
 * Fila de la tabla `survey_control_points` (Spike #7 — SurveyControlPoint).
 */
export interface SurveyControlPointRow {
  id: string;
  site_id: string;
  local_coordinates_json: string; // JSON de Point3D
  gps_json: string;                // JSON de GpsCoordinates
  name: string | null;
  notes: string | null;
  captured_at: string;             // ISO 8601
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
