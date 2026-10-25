// =============================================================================
// MarkerStore.ts — Persistencia de niveles y fases (tabla project_markers)
// =============================================================================
//
// Niveles y fases son de cada espacio (migración v4): la clave es (space_id, id),
// así que toda operación lleva su `MarkerScope`.
// =============================================================================

import { IDatabase } from './database';
import { generateId } from '../../domain/objects/base';
import { BASE_MARKER_NAME, MarkerKind, MarkerScope, ProjectMarker, baseMarkerId } from '../../domain/objects/marker';

interface MarkerRow {
  id: string;
  project_id: string;
  space_id: string;
  kind: MarkerKind;
  name: string;
  value: number;
  is_base: number;
}

const toMarker = (r: MarkerRow): ProjectMarker => ({
  id: r.id,
  projectId: r.project_id,
  spaceId: r.space_id,
  kind: r.kind,
  name: r.name,
  value: Number(r.value),
  isBase: r.is_base === 1,
});

type SetValueResult = { ok: true } | { ok: false; reason: 'base' | 'duplicate' | 'invalid' | 'not-found' };

export class MarkerStore {
  constructor(private readonly db: IDatabase) {}

  /** Niveles o fases del espacio, de menor a mayor valor. Crea la base si falta. */
  async list(scope: MarkerScope, kind: MarkerKind): Promise<ProjectMarker[]> {
    await this.ensureBase(scope, kind);
    const rows = await this.db.all<MarkerRow>(
      `SELECT id, project_id, space_id, kind, name, value, is_base FROM project_markers
       WHERE space_id = ? AND kind = ? AND is_deleted = 0 ORDER BY value ASC`,
      [scope.spaceId, kind],
    );
    return rows.map(toMarker);
  }

  /** Agrega uno nuevo con el siguiente valor libre (máximo + 1). */
  async add(scope: MarkerScope, kind: MarkerKind, label: string): Promise<ProjectMarker> {
    const current = await this.list(scope, kind);
    const value = Math.max(...current.map((m) => m.value)) + 1;
    return this.insert(scope, kind, `${label} ${value}`, value);
  }

  async rename(scope: MarkerScope, id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.db.run(`UPDATE project_markers SET name = ?, updated_at = datetime('now') WHERE space_id = ? AND id = ?`, [
      trimmed,
      scope.spaceId,
      id,
    ]);
  }

  /**
   * Cambia el valor (cota u orden). La base no cambia de valor y no se admiten
   * dos elementos con el mismo valor en un espacio.
   */
  async setValue(scope: MarkerScope, id: string, value: number): Promise<SetValueResult> {
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    const row = await this.db.get<MarkerRow>(`SELECT * FROM project_markers WHERE space_id = ? AND id = ? AND is_deleted = 0`, [scope.spaceId, id]);
    if (!row) return { ok: false, reason: 'not-found' };
    if (row.is_base === 1) return { ok: false, reason: 'base' };
    const clash = await this.db.get<MarkerRow>(
      `SELECT id FROM project_markers WHERE space_id = ? AND kind = ? AND value = ? AND id <> ? AND is_deleted = 0`,
      [scope.spaceId, row.kind, value, id],
    );
    if (clash) return { ok: false, reason: 'duplicate' };
    await this.db.run(`UPDATE project_markers SET value = ?, updated_at = datetime('now') WHERE space_id = ? AND id = ?`, [value, scope.spaceId, id]);
    return { ok: true };
  }

  /**
   * Borra (soft-delete). Los objetos que estaban en él pasan a leerse como de
   * la base, porque un id desconocido se trata como base.
   */
  async remove(scope: MarkerScope, id: string): Promise<boolean> {
    const res = await this.db.run(
      `UPDATE project_markers SET is_deleted = 1, updated_at = datetime('now') WHERE space_id = ? AND id = ? AND is_base = 0`,
      [scope.spaceId, id],
    );
    return res.changes > 0;
  }

  /**
   * Deja en el espacio exactamente estos niveles o fases: el primero renombra la base
   * (su valor sigue siendo 0) y los demás reemplazan a los que hubiera.
   */
  async replaceAll(scope: MarkerScope, kind: MarkerKind, items: readonly { name: string; value: number }[]): Promise<void> {
    await this.db.transaction(async () => {
      await this.ensureBase(scope, kind);
      await this.db.run(
        `UPDATE project_markers SET is_deleted = 1, updated_at = datetime('now') WHERE space_id = ? AND kind = ? AND is_base = 0`,
        [scope.spaceId, kind],
      );
      const [base, ...rest] = items;
      if (base) await this.rename(scope, baseMarkerId(scope.projectId, kind), base.name);
      const seen = new Set([0]);
      for (const it of rest) {
        if (!Number.isFinite(it.value) || seen.has(it.value) || !it.name.trim()) continue;
        seen.add(it.value);
        await this.insert(scope, kind, it.name.trim(), it.value);
      }
    });
  }

  /** Copia los nombres y valores de niveles y fases de otro espacio (para uno nuevo, sin objetos). */
  async copyFrom(from: MarkerScope, to: MarkerScope): Promise<void> {
    for (const kind of ['level', 'phase'] as const) {
      const list = await this.list(from, kind);
      await this.replaceAll(
        to,
        kind,
        list.map((m) => ({ name: m.name, value: m.value })),
      );
    }
  }

  private async insert(scope: MarkerScope, kind: MarkerKind, name: string, value: number): Promise<ProjectMarker> {
    const id = generateId() as string;
    await this.db.run(
      `INSERT INTO project_markers (id, project_id, space_id, kind, name, value, is_base) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [id, scope.projectId, scope.spaceId, kind, name, value],
    );
    return { id, projectId: scope.projectId, spaceId: scope.spaceId, kind, name, value, isBase: false };
  }

  private async ensureBase(scope: MarkerScope, kind: MarkerKind): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO project_markers (id, project_id, space_id, kind, name, value, is_base) VALUES (?, ?, ?, ?, ?, 0, 1)`,
      [baseMarkerId(scope.projectId, kind), scope.projectId, scope.spaceId, kind, BASE_MARKER_NAME[kind]],
    );
  }
}
