// =============================================================================
// MarkerStore.ts — Persistencia de niveles y fases (tabla project_markers)
// =============================================================================

import { IDatabase } from './database';
import { generateId } from '../../domain/objects/base';
import { BASE_MARKER_NAME, MarkerKind, ProjectMarker, baseMarkerId } from '../../domain/objects/marker';

interface MarkerRow {
  id: string;
  project_id: string;
  kind: MarkerKind;
  name: string;
  value: number;
  is_base: number;
}

const toMarker = (r: MarkerRow): ProjectMarker => ({
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  name: r.name,
  value: Number(r.value),
  isBase: r.is_base === 1,
});

export class MarkerStore {
  constructor(private readonly db: IDatabase) {}

  /** Niveles o fases del proyecto, de menor a mayor valor. Crea la base si falta. */
  async list(projectId: string, kind: MarkerKind): Promise<ProjectMarker[]> {
    await this.ensureBase(projectId, kind);
    const rows = await this.db.all<MarkerRow>(
      `SELECT id, project_id, kind, name, value, is_base FROM project_markers
       WHERE project_id = ? AND kind = ? AND is_deleted = 0 ORDER BY value ASC`,
      [projectId, kind],
    );
    return rows.map(toMarker);
  }

  /** Agrega uno nuevo con el siguiente valor libre (máximo + 1). */
  async add(projectId: string, kind: MarkerKind, label: string): Promise<ProjectMarker> {
    const current = await this.list(projectId, kind);
    const value = Math.max(...current.map((m) => m.value)) + 1;
    const id = generateId() as string;
    const name = `${label} ${value}`;
    await this.db.run(
      `INSERT INTO project_markers (id, project_id, kind, name, value, is_base) VALUES (?, ?, ?, ?, ?, 0)`,
      [id, projectId, kind, name, value],
    );
    return { id, projectId, kind, name, value, isBase: false };
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.db.run(`UPDATE project_markers SET name = ?, updated_at = datetime('now') WHERE id = ?`, [trimmed, id]);
  }

  /**
   * Cambia el valor (cota u orden). La base no cambia de valor y no se admiten
   * dos elementos con el mismo valor en un proyecto.
   */
  async setValue(id: string, value: number): Promise<{ ok: true } | { ok: false; reason: 'base' | 'duplicate' | 'invalid' | 'not-found' }> {
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    const row = await this.db.get<MarkerRow>(`SELECT * FROM project_markers WHERE id = ? AND is_deleted = 0`, [id]);
    if (!row) return { ok: false, reason: 'not-found' };
    if (row.is_base === 1) return { ok: false, reason: 'base' };
    const clash = await this.db.get<MarkerRow>(
      `SELECT id FROM project_markers WHERE project_id = ? AND kind = ? AND value = ? AND id <> ? AND is_deleted = 0`,
      [row.project_id, row.kind, value, id],
    );
    if (clash) return { ok: false, reason: 'duplicate' };
    await this.db.run(`UPDATE project_markers SET value = ?, updated_at = datetime('now') WHERE id = ?`, [value, id]);
    return { ok: true };
  }

  /**
   * Borra (soft-delete). Los objetos que estaban en él pasan a leerse como de
   * la base, porque un id desconocido se trata como base.
   */
  async remove(id: string): Promise<boolean> {
    const res = await this.db.run(
      `UPDATE project_markers SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND is_base = 0`,
      [id],
    );
    return res.changes > 0;
  }

  private async ensureBase(projectId: string, kind: MarkerKind): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO project_markers (id, project_id, kind, name, value, is_base) VALUES (?, ?, ?, ?, 0, 1)`,
      [baseMarkerId(projectId, kind), projectId, kind, BASE_MARKER_NAME[kind]],
    );
  }
}
