// =============================================================================
// projectPackage.ts — Paquete de proyecto `.polylive` (exportar / importar)
// =============================================================================
//
// El proyecto completo en UN archivo, para sacarlo del teléfono (respaldo en
// Drive, cambio de equipo, entrega a la oficina) y volver a abrirlo en otro:
//
//   manifest.json   formato, versión del formato y del esquema, proyecto, conteos
//   data.json       las filas del proyecto, tabla por tabla
//   photos/<id>.jpg las imágenes de las fotos (fuera del JSON)
//
// Es un zip normal: se puede abrir y revisar con cualquier programa.
// Al importar, las filas se insertan con sus mismos ids; si el proyecto ya
// existe en el teléfono, se REEMPLAZA (lo pide quien importa). Las columnas
// que no conozca este esquema se ignoran y las que falten toman su valor por
// defecto: un paquete de una versión anterior se puede abrir.
// =============================================================================

import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import type { IDatabase } from '../sqlite/database';
import { LATEST_SCHEMA_VERSION } from '../sqlite/migrations';

const PACKAGE_FORMAT = 'polylive-project';
const PACKAGE_FORMAT_VERSION = 1;
const PACKAGE_EXTENSION = 'polylive';

/** Una tabla del paquete: de dónde salen sus filas (por proyecto o por espacio). */
interface TableSpec {
  readonly table: string;
  /** Condición SQL; `?` es el id del proyecto (`project`) o los espacios (`space`). */
  readonly where: string;
  readonly scope: 'project' | 'space';
}

const TABLES: readonly TableSpec[] = [
  { table: 'projects', where: 'id = ?', scope: 'project' },
  { table: 'project_spaces', where: 'project_id = ?', scope: 'project' },
  { table: 'project_markers', where: 'project_id = ?', scope: 'project' },
  { table: 'project_georeference', where: 'project_id = ?', scope: 'project' },
  { table: 'project_benchmarks', where: 'project_id = ?', scope: 'project' },
  { table: 'benchmarks', where: 'id IN (SELECT benchmark_id FROM project_benchmarks WHERE project_id = ?)', scope: 'project' },
  { table: 'progress_activities', where: 'project_id = ?', scope: 'project' },
  { table: 'progress_cuts', where: 'project_id = ?', scope: 'project' },
  { table: 'revit_objects', where: 'room_id', scope: 'space' },
  { table: 'measurements', where: 'room_id', scope: 'space' },
  { table: 'audit_photos', where: 'room_id', scope: 'space' },
  { table: 'wall_elevations', where: 'room_id', scope: 'space' },
  { table: 'zones', where: 'space_id', scope: 'space' },
  { table: 'progress_marks', where: 'space_id', scope: 'space' },
  { table: 'review_items', where: 'space_id', scope: 'space' },
  { table: 'draft_items', where: 'space_id', scope: 'space' },
];

interface PackageManifest {
  readonly format: typeof PACKAGE_FORMAT;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly exportedBy?: string;
  readonly project: { readonly id: string; readonly name: string; readonly bimCode: string };
  readonly spaces: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly photos: number;
}

interface ProjectPackage {
  readonly manifest: PackageManifest;
  readonly tables: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  /** Imagen de cada foto por id. */
  readonly photos: ReadonlyMap<string, Uint8Array>;
}

export class PackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageError';
  }
}

type Row = Record<string, unknown>;

async function spacesOf(db: IDatabase, projectId: string): Promise<string[]> {
  return (await db.all<{ room_id: string }>(`SELECT room_id FROM project_spaces WHERE project_id = ?`, [projectId])).map((r) => r.room_id);
}

async function rowsOf(db: IDatabase, spec: TableSpec, projectId: string, spaces: readonly string[]): Promise<Row[]> {
  if (spec.scope === 'project') return db.all<Row>(`SELECT * FROM ${spec.table} WHERE ${spec.where}`, [projectId]);
  if (!spaces.length) return [];
  return db.all<Row>(`SELECT * FROM ${spec.table} WHERE ${spec.where} IN (${spaces.map(() => '?').join(',')})`, [...spaces]);
}

/** Lee el proyecto completo de la base. */
export async function readProjectPackage(db: IDatabase, projectId: string, exportedBy?: string): Promise<ProjectPackage> {
  const project = await db.get<{ id: string; name: string; bim_code: string }>(`SELECT id, name, bim_code FROM projects WHERE id = ?`, [projectId]);
  if (!project) throw new PackageError('El proyecto no existe.');
  const spaces = await spacesOf(db, projectId);
  const tables: Record<string, Row[]> = {};
  const photos = new Map<string, Uint8Array>();
  for (const spec of TABLES) {
    const rows = await rowsOf(db, spec, projectId, spaces);
    if (spec.table === 'audit_photos') {
      tables[spec.table] = rows
        .filter((r) => r.is_deleted !== 1)
        .map((r) => {
          const img = r.foto as Uint8Array | null;
          if (img && img.length) photos.set(String(r.id), new Uint8Array(img));
          return { ...r, foto: null };
        });
    } else {
      tables[spec.table] = rows;
    }
  }
  const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
  return {
    manifest: {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_FORMAT_VERSION,
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ...(exportedBy ? { exportedBy } : {}),
      project: { id: project.id, name: project.name, bimCode: project.bim_code },
      spaces: spaces.length,
      counts,
      photos: photos.size,
    },
    tables,
    photos,
  };
}

/** El paquete como zip. Las fotos van sin comprimir (ya son JPEG). */
export function zipPackage(pkg: ProjectPackage): Uint8Array {
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(pkg.manifest, null, 2)),
    'data.json': strToU8(JSON.stringify(pkg.tables)),
  };
  for (const [id, bytes] of pkg.photos) files[`photos/${id}.jpg`] = [bytes, { level: 0 }];
  return zipSync(files, { level: 6 });
}

/** Lee un zip `.polylive` y valida su formato. */
export function unzipPackage(bytes: Uint8Array): ProjectPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new PackageError('El archivo no es un paquete de PolyLive (no se pudo descomprimir).');
  }
  const m = files['manifest.json'];
  const d = files['data.json'];
  if (!m || !d) throw new PackageError('Al paquete le falta el manifiesto o los datos.');
  const manifest = JSON.parse(strFromU8(m)) as PackageManifest;
  if (manifest.format !== PACKAGE_FORMAT) throw new PackageError('El archivo no es un paquete de proyecto de PolyLive.');
  if (manifest.formatVersion > PACKAGE_FORMAT_VERSION || manifest.schemaVersion > LATEST_SCHEMA_VERSION) {
    throw new PackageError('El paquete es de una versión más nueva de PolyLive: actualiza la app para abrirlo.');
  }
  const tables = JSON.parse(strFromU8(d)) as Record<string, Row[]>;
  const photos = new Map<string, Uint8Array>();
  for (const [name, b] of Object.entries(files)) {
    const mm = /^photos\/(.+)\.jpg$/.exec(name);
    if (mm) photos.set(mm[1], b);
  }
  return { manifest, tables, photos };
}

/** Marca que el proyecto se respaldó fuera del teléfono (para el recordatorio). */
export async function markPackaged(db: IDatabase, projectId: string, at = new Date()): Promise<void> {
  await db.run(`UPDATE projects SET last_package_at = ? WHERE id = ?`, [at.toISOString(), projectId]);
}

/** Último respaldo externo del proyecto, o `null` si nunca se exportó. */
export async function lastPackagedAt(db: IDatabase, projectId: string): Promise<Date | null> {
  const r = await db.get<{ last_package_at: string | null }>(`SELECT last_package_at FROM projects WHERE id = ?`, [projectId]);
  return r?.last_package_at ? new Date(r.last_package_at) : null;
}

/** ¿Ya existe en esta base el proyecto del paquete? */
export async function projectExists(db: IDatabase, projectId: string): Promise<boolean> {
  return !!(await db.get(`SELECT id FROM projects WHERE id = ?`, [projectId]));
}

/**
 * Escribe el paquete en la base, en UNA transacción: o entra entero o no entra
 * nada. Si el proyecto ya existe, primero se borran sus filas (reemplazo).
 */
export async function importProjectPackage(db: IDatabase, pkg: ProjectPackage): Promise<{ replaced: boolean; rows: number; photos: number }> {
  const projectId = pkg.manifest.project.id;
  const replaced = await projectExists(db, projectId);
  let rows = 0;
  await db.transaction(async () => {
    if (replaced) {
      const spaces = await spacesOf(db, projectId);
      // Al revés: primero lo que cuelga de los espacios, al final el proyecto.
      for (const spec of [...TABLES].reverse()) {
        if (spec.table === 'benchmarks') continue; // biblioteca común: se actualiza, no se borra
        if (spec.scope === 'project') await db.run(`DELETE FROM ${spec.table} WHERE ${spec.where}`, [projectId]);
        else if (spaces.length) await db.run(`DELETE FROM ${spec.table} WHERE ${spec.where} IN (${spaces.map(() => '?').join(',')})`, [...spaces]);
      }
    }
    // Paquetes de antes de la v4: niveles y fases eran del proyecto; cada espacio recibe una copia.
    const spaceIds = (pkg.tables.project_spaces ?? []).map((s) => s.room_id);
    const perSpace = (rows: readonly Row[]) => rows.flatMap((r) => ('space_id' in r ? [r] : spaceIds.map((space_id) => ({ ...r, space_id }))));
    for (const spec of TABLES) {
      const list = spec.table === 'project_markers' ? perSpace(pkg.tables[spec.table] ?? []) : pkg.tables[spec.table] ?? [];
      if (!list.length) continue;
      const known = new Set((await db.all<{ name: string }>(`PRAGMA table_info(${spec.table})`)).map((c) => c.name));
      for (const raw of list) {
        const row: Row = spec.table === 'audit_photos' ? { ...raw, foto: pkg.photos.get(String(raw.id)) ?? null } : raw;
        const cols = Object.keys(row).filter((c) => known.has(c));
        await db.run(
          `INSERT OR REPLACE INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c]),
        );
        rows++;
      }
    }
  });
  return { replaced, rows, photos: pkg.photos.size };
}

/** Nombre de archivo del paquete: `BIM001-Mi-proyecto-20261006-1730.polylive`. */
export function packageFilename(m: Pick<PackageManifest, 'project'>, now = new Date()): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'proyecto';
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `${slug(m.project.bimCode)}-${slug(m.project.name)}-${stamp}.${PACKAGE_EXTENSION}`;
}
