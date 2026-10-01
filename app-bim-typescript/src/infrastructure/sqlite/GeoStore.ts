// =============================================================================
// GeoStore.ts — Persistencia de la topografía del proyecto
// =============================================================================
//
// Tres tablas aditivas (IF NOT EXISTS, no tocan nada existente):
//   project_georeference   una fila por proyecto con el amarre en JSON
//   benchmarks             biblioteca común de mojones (lat/long, cota)
//   project_benchmarks     enlace mojón ↔ proyecto con su posición en el dibujo
// =============================================================================

import { IDatabase } from './database';
import { generateId } from '../../domain/objects/base';
import { Georeference } from '../../domain/geo/georeference';
import { Benchmark, BenchmarkSource, ProjectBenchmark } from '../../domain/geo/benchmark';
import type { Point2D } from '../../domain/geometry/types';
import type { LatLon } from '../../domain/geo/crs';

interface BenchmarkRow {
  id: string;
  name: string;
  description: string | null;
  lat: number | null;
  lon: number | null;
  h: number | null;
  source: BenchmarkSource;
  accuracy: number | null;
  created_by: string | null;
  created_at: string;
}

interface LinkRow extends BenchmarkRow {
  project_id: string;
  space_id: string | null;
  local_x: number | null;
  local_y: number | null;
  local_z: number | null;
}

const toBenchmark = (r: BenchmarkRow): Benchmark => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  latLon: r.lat !== null && r.lon !== null ? { lat: Number(r.lat), lon: Number(r.lon) } : null,
  h: r.h !== null ? Number(r.h) : null,
  source: r.source,
  accuracy: r.accuracy !== null ? Number(r.accuracy) : null,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
});

const toProjectBenchmark = (r: LinkRow): ProjectBenchmark => ({
  ...toBenchmark(r),
  projectId: r.project_id,
  spaceId: r.space_id,
  local: r.local_x !== null && r.local_y !== null ? { x: Number(r.local_x), y: Number(r.local_y) } : null,
  localZ: r.local_z !== null ? Number(r.local_z) : null,
});

export interface NewBenchmark {
  name: string;
  description?: string;
  latLon: LatLon | null;
  h: number | null;
  source: BenchmarkSource;
  accuracy?: number | null;
  createdBy?: string;
  /** Posición en el dibujo (si se crea tocando, o se coloca después). */
  spaceId?: string | null;
  local?: Point2D | null;
  localZ?: number | null;
}

export class GeoStore {
  constructor(private readonly db: IDatabase) {}

  // --- Georreferencia -------------------------------------------------------

  async getGeoreference(projectId: string): Promise<Georeference | null> {
    const row = await this.db.get<{ data_json: string }>(`SELECT data_json FROM project_georeference WHERE project_id = ?`, [projectId]);
    if (!row) return null;
    try {
      const g = JSON.parse(row.data_json) as Georeference;
      return { ...g, placements: g.placements ?? {} };
    } catch {
      return null;
    }
  }

  async saveGeoreference(projectId: string, geo: Georeference): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO project_georeference (project_id, data_json, updated_at) VALUES (?, ?, datetime('now'))`,
      [projectId, JSON.stringify(geo)],
    );
  }

  async clearGeoreference(projectId: string): Promise<void> {
    await this.db.run(`DELETE FROM project_georeference WHERE project_id = ?`, [projectId]);
  }

  // --- Mojones ----------------------------------------------------------------

  /** Mojones del proyecto (con su posición en el dibujo). */
  async listProjectBenchmarks(projectId: string): Promise<ProjectBenchmark[]> {
    const rows = await this.db.all<LinkRow>(
      `SELECT b.*, pb.project_id, pb.space_id, pb.local_x, pb.local_y, pb.local_z
       FROM project_benchmarks pb JOIN benchmarks b ON b.id = pb.benchmark_id
       WHERE pb.project_id = ? AND b.is_deleted = 0 ORDER BY b.name`,
      [projectId],
    );
    return rows.map(toProjectBenchmark);
  }

  /** Biblioteca: mojones con coordenadas reales que el proyecto aún no tiene enlazados. */
  async listLibrary(projectId: string): Promise<Benchmark[]> {
    const rows = await this.db.all<BenchmarkRow>(
      `SELECT * FROM benchmarks b
       WHERE b.is_deleted = 0 AND b.lat IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM project_benchmarks pb WHERE pb.benchmark_id = b.id AND pb.project_id = ?)
       ORDER BY b.created_at DESC`,
      [projectId],
    );
    return rows.map(toBenchmark);
  }

  /** Crea el mojón en la biblioteca y lo enlaza al proyecto. */
  async createBenchmark(projectId: string, input: NewBenchmark): Promise<ProjectBenchmark> {
    const id = generateId() as unknown as string;
    const createdAt = new Date().toISOString();
    await this.db.run(
      `INSERT INTO benchmarks (id, name, description, lat, lon, h, source, accuracy, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name.trim() || 'Mojón',
        input.description ?? null,
        input.latLon?.lat ?? null,
        input.latLon?.lon ?? null,
        input.h,
        input.source,
        input.accuracy ?? null,
        input.createdBy ?? null,
        createdAt,
      ],
    );
    await this.link(projectId, id, input.spaceId ?? null, input.local ?? null, input.localZ ?? null);
    const created = (await this.listProjectBenchmarks(projectId)).find((b) => b.id === id);
    if (!created) throw new Error('No se pudo crear el mojón.');
    return created;
  }

  /** Enlaza (o re-coloca) un mojón de la biblioteca en el proyecto. */
  async link(projectId: string, benchmarkId: string, spaceId: string | null, local: Point2D | null, localZ: number | null = null): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO project_benchmarks (project_id, benchmark_id, space_id, local_x, local_y, local_z)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, benchmarkId, spaceId, local?.x ?? null, local?.y ?? null, localZ],
    );
  }

  async unlink(projectId: string, benchmarkId: string): Promise<void> {
    await this.db.run(`DELETE FROM project_benchmarks WHERE project_id = ? AND benchmark_id = ?`, [projectId, benchmarkId]);
  }

  /** Completa las coordenadas reales de un mojón (p. ej. uno tocado antes de amarrar). */
  async setRealCoordinates(benchmarkId: string, latLon: LatLon, h: number | null, source: BenchmarkSource, accuracy: number | null = null): Promise<void> {
    await this.db.run(`UPDATE benchmarks SET lat = ?, lon = ?, h = ?, source = ?, accuracy = ? WHERE id = ?`, [
      latLon.lat,
      latLon.lon,
      h,
      source,
      accuracy,
      benchmarkId,
    ]);
  }

  async rename(benchmarkId: string, name: string, description?: string): Promise<void> {
    await this.db.run(`UPDATE benchmarks SET name = ?, description = ? WHERE id = ?`, [name.trim() || 'Mojón', description ?? null, benchmarkId]);
  }
}
