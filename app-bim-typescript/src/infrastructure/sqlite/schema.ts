// =============================================================================
// schema.ts — SQL CREATE TABLE para todas las tablas del sistema BIM
// Basado en: RevitObjectBase.md, Wall/Door/Window/Column/Floor/Room specs,
//            CaptureMeasurementUseCase.md, CapturePhotoUseCase.md,
//            SiteCoordinateSystem.md, SurveyControlPoint.md (Spike #7)
// =============================================================================

/**
 * Tabla principal: revit_objects
 * Almacena TODOS los objetos BIM (Wall, Door, Window, Column, Floor, Room).
 *
 * Diseño "single table inheritance":
 * - object_type discrimina el tipo concreto
 * - properties_json contiene propiedades específicas del tipo (espesor, parentWallId, etc.)
 * - geometry_json contiene la geometría serializada (puntos, polígonos)
 * - is_deleted = 1 → soft-delete (excluido de exportaciones, pero no borrado)
 */
export const CREATE_REVIT_OBJECTS = `
CREATE TABLE IF NOT EXISTS revit_objects (
  id              TEXT PRIMARY KEY NOT NULL,
  object_type     TEXT NOT NULL CHECK(object_type IN ('Wall','Door','Window','Column','Floor','Room')),
  room_id         TEXT NOT NULL,
  geometry_json   TEXT NOT NULL DEFAULT '{}',
  properties_json TEXT NOT NULL DEFAULT '{}',
  is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: measurements
 * Mediciones BLE o manuales vinculadas a un Wall.
 *
 * - capture_method: 'ble' (7 muestras) | 'manual' (1 muestra)
 * - values_json: array JSON de muestras [Meters]
 * - average: promedio calculado (sin outliers para BLE)
 */
export const CREATE_MEASUREMENTS = `
CREATE TABLE IF NOT EXISTS measurements (
  id              TEXT PRIMARY KEY NOT NULL,
  room_id         TEXT NOT NULL,
  wall_id         TEXT NOT NULL,
  capture_method  TEXT NOT NULL CHECK(capture_method IN ('ble','manual')),
  values_json     TEXT NOT NULL DEFAULT '[]',
  average         REAL NOT NULL DEFAULT 0,
  is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: audit_photos
 * Fotos de auditoría con BLOB y metadata.
 *
 * - foto: BLOB JPEG capturado del dispositivo
 * - metadata_json: { timestamp, filename, linkedObjectId?, notes? }
 * - linked_object_id: objeto BIM vinculado (nullable)
 */
export const CREATE_AUDIT_PHOTOS = `
CREATE TABLE IF NOT EXISTS audit_photos (
  id                TEXT PRIMARY KEY NOT NULL,
  room_id           TEXT NOT NULL,
  foto              BLOB,
  metadata_json     TEXT NOT NULL DEFAULT '{}',
  linked_object_id  TEXT,
  is_deleted        INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: operators
 * Perfil mínimo de la persona que realiza el levantamiento — ver el
 * comentario de alcance en domain/objects/operator.ts (solo `name`, sin
 * autenticación).
 */
export const CREATE_OPERATORS = `
CREATE TABLE IF NOT EXISTS operators (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  is_deleted  INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: projects
 * Raíz de organización del trabajo (portada de LevON — ver domain/objects/project.ts).
 *
 * - bim_code: código BIM corto y único entre proyectos vivos (BIM001, ARC042).
 *   La unicidad se garantiza en ProjectStore, no con un UNIQUE: un proyecto
 *   soft-deleted conserva su código, y un UNIQUE impediría reutilizarlo.
 * - is_deleted = 1 → soft-delete. Los Recintos del proyecto NO se borran:
 *   borrar el proyecto no debe destruir el levantamiento de nadie.
 */
export const CREATE_PROJECTS = `
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY NOT NULL,
  bim_code     TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  discipline   TEXT NOT NULL DEFAULT 'Arquitectura',
  author       TEXT NOT NULL DEFAULT '',
  is_deleted   INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: project_spaces
 * Relación proyecto ↔ Recinto, más la identidad BIM del espacio.
 *
 * POR QUÉ UNA TABLA DE RELACIÓN Y NO UNA COLUMNA `project_id` EN
 * `revit_objects`: el espacio tiene datos propios que no pertenecen al Recinto
 * (su código BIM dentro del proyecto, su nombre de espacio, su orden de
 * presentación). Meterlos en `revit_objects` los mezclaría con las propiedades
 * geométricas de un objeto BIM, y añadir la columna exigiría un ALTER TABLE
 * sobre la tabla más grande y más crítica del sistema. Así es aditivo: un
 * `CREATE TABLE IF NOT EXISTS` que las bases ya existentes aceptan sin migrar
 * ni una fila.
 *
 * PK compuesta (project_id, room_id): un Recinto aparece como máximo una vez
 * en un proyecto dado.
 */
export const CREATE_PROJECT_SPACES = `
CREATE TABLE IF NOT EXISTS project_spaces (
  project_id   TEXT NOT NULL,
  room_id      TEXT NOT NULL,
  bim_code     TEXT NOT NULL,
  name         TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  is_deleted   INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, room_id)
);
`;

/**
 * Tabla: wall_elevations
 * Motor de Elevación de Muros (MEM) — ver domain/objects/wall-elevation.ts.
 *
 * Una fila por muro con elevación definida. `openings_json` y `levels_json`
 * guardan los vanos y los niveles verticales en coordenadas CSL (el sistema
 * local del muro), no en coordenadas mundo: un vano pertenece a SU muro y
 * moverlo no debe reescribir la elevación.
 */
export const CREATE_WALL_ELEVATIONS = `
CREATE TABLE IF NOT EXISTS wall_elevations (
  wall_id      TEXT PRIMARY KEY NOT NULL,
  room_id      TEXT NOT NULL,
  levels_json  TEXT NOT NULL DEFAULT '{}',
  openings_json TEXT NOT NULL DEFAULT '[]',
  is_deleted   INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Tabla: project_markers
 * Niveles (cota) y fases (orden) de cada proyecto. Aditiva: las bases ya
 * existentes la crean con `IF NOT EXISTS`, sin tocar ninguna otra tabla.
 * La base de cada tipo tiene un id determinista y se crea al primer uso.
 */
export const CREATE_PROJECT_MARKERS = `
CREATE TABLE IF NOT EXISTS project_markers (
  id           TEXT PRIMARY KEY NOT NULL,
  project_id   TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK(kind IN ('level', 'phase')),
  name         TEXT NOT NULL,
  value        REAL NOT NULL DEFAULT 0,
  is_base      INTEGER NOT NULL DEFAULT 0 CHECK(is_base IN (0, 1)),
  is_deleted   INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Topografía (M2): amarre del proyecto a coordenadas reales, biblioteca común
 * de mojones y su enlace a cada proyecto. Aditivas, como las demás.
 */
export const CREATE_PROJECT_GEOREFERENCE = `
CREATE TABLE IF NOT EXISTS project_georeference (
  project_id   TEXT PRIMARY KEY NOT NULL,
  data_json    TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_BENCHMARKS = `
CREATE TABLE IF NOT EXISTS benchmarks (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  lat          REAL,
  lon          REAL,
  h            REAL,
  source       TEXT NOT NULL CHECK(source IN ('tap', 'typed', 'gps', 'import')),
  accuracy     REAL,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted   INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1))
);
`;

export const CREATE_PROJECT_BENCHMARKS = `
CREATE TABLE IF NOT EXISTS project_benchmarks (
  project_id   TEXT NOT NULL,
  benchmark_id TEXT NOT NULL,
  space_id     TEXT,
  local_x      REAL,
  local_y      REAL,
  local_z      REAL,
  PRIMARY KEY (project_id, benchmark_id)
);
`;

// ---------------------------------------------------------------------------
// Índices para consultas frecuentes
// ---------------------------------------------------------------------------

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_revit_objects_room_id
  ON revit_objects(room_id);

CREATE INDEX IF NOT EXISTS idx_revit_objects_type
  ON revit_objects(object_type);

CREATE INDEX IF NOT EXISTS idx_revit_objects_room_type
  ON revit_objects(room_id, object_type) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_revit_objects_not_deleted
  ON revit_objects(room_id) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_measurements_room_id
  ON measurements(room_id);

CREATE INDEX IF NOT EXISTS idx_measurements_wall_id
  ON measurements(wall_id);

CREATE INDEX IF NOT EXISTS idx_audit_photos_room_id
  ON audit_photos(room_id);

CREATE INDEX IF NOT EXISTS idx_project_spaces_project
  ON project_spaces(project_id) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_project_markers_project
  ON project_markers(project_id, kind) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_project_spaces_room
  ON project_spaces(room_id) WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_wall_elevations_room
  ON wall_elevations(room_id) WHERE is_deleted = 0;
`;

// ---------------------------------------------------------------------------
// Todas las sentencias DDL en orden
// ---------------------------------------------------------------------------

export const ALL_DDL: string[] = [
  CREATE_REVIT_OBJECTS,
  CREATE_MEASUREMENTS,
  CREATE_AUDIT_PHOTOS,
  CREATE_OPERATORS,
  CREATE_PROJECTS,
  CREATE_PROJECT_SPACES,
  CREATE_WALL_ELEVATIONS,
  CREATE_PROJECT_MARKERS,
  CREATE_PROJECT_GEOREFERENCE,
  CREATE_BENCHMARKS,
  CREATE_PROJECT_BENCHMARKS,
  CREATE_INDEXES,
];
