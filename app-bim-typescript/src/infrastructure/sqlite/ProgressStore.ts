// =============================================================================
// ProgressStore.ts — Persistencia del avance de obra (M3)
// =============================================================================
//
// Actividades y cortes son del PROYECTO (el catálogo se comparte entre sus
// espacios); las marcas, del espacio donde se pintaron. Borrar es lógico:
// deshacer un trazo lo vuelve a la vida.
// =============================================================================

import { IDatabase } from './database';
import { diagnostics } from '../../shared/diagnostics';
import { generateId } from '../../domain/objects/base';
import {
  Activity,
  DEFAULT_ACTIVITIES,
  ProgressCut,
  ProgressMark,
  ProgressShape,
  ProgressTarget,
} from '../../domain/progress/progress';

interface ActivityRow {
  id: string;
  project_id: string;
  name: string;
  color: string;
  order_index: number;
}

interface CutRow {
  id: string;
  project_id: string;
  date: string;
  label: string;
  created_at: string;
}

interface MarkRow {
  id: string;
  space_id: string;
  cut_id: string;
  activity_id: string;
  target_json: string;
  shape_json: string;
  erase: number;
  operator: string;
  created_at: string;
}

const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  color: r.color,
  unit: 'm²',
  order: Number(r.order_index),
});

const toCut = (r: CutRow): ProgressCut => ({ id: r.id, projectId: r.project_id, date: r.date, label: r.label, createdAt: r.created_at });

function toMark(r: MarkRow): ProgressMark | null {
  try {
    return {
      id: r.id,
      spaceId: r.space_id,
      cutId: r.cut_id,
      activityId: r.activity_id,
      target: JSON.parse(r.target_json) as ProgressTarget,
      shape: JSON.parse(r.shape_json) as ProgressShape,
      erase: r.erase === 1,
      operator: r.operator,
      createdAt: r.created_at,
    };
  } catch (err) {
    // Una marca ilegible se omite: no debe impedir ver el resto del avance.
    diagnostics.error('progress_marks', `Se omitió una fila ilegible (${r.id})`, err);
    return null;
  }
}

export class ProgressStore {
  constructor(private readonly db: IDatabase) {}

  // --- Actividades ---

  /** Catálogo del proyecto. La primera vez se siembra con las actividades típicas. */
  async listActivities(projectId: string): Promise<Activity[]> {
    const read = () =>
      this.db.all<ActivityRow>(
        `SELECT * FROM progress_activities WHERE project_id = ? AND is_deleted = 0 ORDER BY order_index, created_at`,
        [projectId],
      );
    let rows = await read();
    if (rows.length === 0) {
      const any = await this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM progress_activities WHERE project_id = ?`, [projectId]);
      // Solo se siembra un catálogo que nunca existió: si el usuario borró todas, se respeta.
      if (!any?.n) {
        for (const [i, a] of DEFAULT_ACTIVITIES.entries()) await this.insertActivity(projectId, a.name, a.color, i);
        rows = await read();
      }
    }
    return rows.map(toActivity);
  }

  private async insertActivity(projectId: string, name: string, color: string, order: number): Promise<string> {
    const id = generateId() as string;
    await this.db.run(`INSERT INTO progress_activities (id, project_id, name, color, order_index) VALUES (?, ?, ?, ?, ?)`, [
      id,
      projectId,
      name,
      color,
      order,
    ]);
    return id;
  }

  async addActivity(projectId: string, name: string, color: string): Promise<string> {
    const row = await this.db.get<{ n: number | null }>(`SELECT MAX(order_index) AS n FROM progress_activities WHERE project_id = ?`, [projectId]);
    return this.insertActivity(projectId, name.trim() || 'Actividad', color, (row?.n ?? -1) + 1);
  }

  async updateActivity(id: string, edit: { name?: string; color?: string }): Promise<void> {
    if (edit.name !== undefined && edit.name.trim()) await this.db.run(`UPDATE progress_activities SET name = ? WHERE id = ?`, [edit.name.trim(), id]);
    if (edit.color !== undefined) await this.db.run(`UPDATE progress_activities SET color = ? WHERE id = ?`, [edit.color, id]);
  }

  /** Quita la actividad del catálogo. Lo pintado con ella se conserva (sigue en los reportes viejos). */
  async deleteActivity(id: string): Promise<void> {
    await this.db.run(`UPDATE progress_activities SET is_deleted = 1 WHERE id = ?`, [id]);
  }

  /** Todas, incluidas las quitadas del catálogo (para nombrar lo ya pintado). */
  async allActivities(projectId: string): Promise<Activity[]> {
    const rows = await this.db.all<ActivityRow>(`SELECT * FROM progress_activities WHERE project_id = ? ORDER BY order_index`, [projectId]);
    return rows.map(toActivity);
  }

  // --- Cortes ---

  async listCuts(projectId: string): Promise<ProgressCut[]> {
    const rows = await this.db.all<CutRow>(
      `SELECT * FROM progress_cuts WHERE project_id = ? AND is_deleted = 0 ORDER BY date, created_at`,
      [projectId],
    );
    return rows.map(toCut);
  }

  async addCut(projectId: string, date: string, label = ''): Promise<ProgressCut> {
    const cut: ProgressCut = { id: generateId() as string, projectId, date, label, createdAt: new Date().toISOString() };
    await this.db.run(`INSERT INTO progress_cuts (id, project_id, date, label, created_at) VALUES (?, ?, ?, ?, ?)`, [
      cut.id,
      projectId,
      date,
      label,
      cut.createdAt,
    ]);
    return cut;
  }

  async updateCut(id: string, edit: { date?: string; label?: string }): Promise<void> {
    if (edit.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(edit.date)) await this.db.run(`UPDATE progress_cuts SET date = ? WHERE id = ?`, [edit.date, id]);
    if (edit.label !== undefined) await this.db.run(`UPDATE progress_cuts SET label = ? WHERE id = ?`, [edit.label.trim(), id]);
  }

  // --- Marcas ---

  async listMarks(spaceId: string): Promise<ProgressMark[]> {
    const rows = await this.db.all<MarkRow>(`SELECT * FROM progress_marks WHERE space_id = ? AND is_deleted = 0 ORDER BY created_at`, [spaceId]);
    return rows.map(toMark).filter((m): m is ProgressMark => m !== null);
  }

  async addMark(m: ProgressMark): Promise<void> {
    await this.db.run(
      `INSERT INTO progress_marks (id, space_id, cut_id, activity_id, target_json, shape_json, erase, operator, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.spaceId, m.cutId, m.activityId, JSON.stringify(m.target), JSON.stringify(m.shape), m.erase ? 1 : 0, m.operator, m.createdAt],
    );
  }

  /** Borra (o recupera, al rehacer) una marca. */
  async setMarkDeleted(id: string, deleted: boolean): Promise<void> {
    await this.db.run(`UPDATE progress_marks SET is_deleted = ? WHERE id = ?`, [deleted ? 1 : 0, id]);
  }
}
