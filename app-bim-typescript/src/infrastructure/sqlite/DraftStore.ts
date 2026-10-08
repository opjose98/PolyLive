// =============================================================================
// DraftStore.ts — Persistencia del dibujo técnico (F6b): tabla draft_items
// =============================================================================

import { IDatabase } from './database';
import { diagnostics } from '../../shared/diagnostics';
import type { DraftItem, DraftKind, DraftView } from '../../domain/drafting/drafting';

interface Row {
  id: string;
  space_id: string;
  view_json: string;
  level_id: string;
  kind: DraftKind;
  points_json: string;
  text: string;
  props_json: string;
  target_id: string | null;
  created_at: string;
}

function toItem(r: Row): DraftItem | null {
  try {
    return {
      id: r.id,
      spaceId: r.space_id,
      view: JSON.parse(r.view_json) as DraftView,
      levelId: r.level_id,
      kind: r.kind,
      points: JSON.parse(r.points_json),
      text: r.text,
      props: JSON.parse(r.props_json),
      ...(r.target_id ? { targetId: r.target_id } : {}),
      createdAt: r.created_at,
    };
  } catch (err) {
    // Un elemento ilegible se omite: no debe impedir ver el resto del dibujo.
    diagnostics.error('draft_items', `Se omitió una fila ilegible (${r.id})`, err);
    return null;
  }
}

export class DraftStore {
  constructor(private readonly db: IDatabase) {}

  async list(spaceId: string): Promise<DraftItem[]> {
    const rows = await this.db.all<Row>(`SELECT * FROM draft_items WHERE space_id = ? AND is_deleted = 0 ORDER BY created_at`, [spaceId]);
    return rows.map(toItem).filter((i): i is DraftItem => i !== null);
  }

  async add(i: DraftItem): Promise<void> {
    await this.db.run(
      `INSERT INTO draft_items (id, space_id, view_json, level_id, kind, points_json, text, props_json, target_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.spaceId, JSON.stringify(i.view), i.levelId, i.kind, JSON.stringify(i.points), i.text, JSON.stringify(i.props), i.targetId ?? null, i.createdAt],
    );
  }

  /** Reescribe puntos, texto y propiedades (edición). */
  async update(i: DraftItem): Promise<void> {
    await this.db.run(`UPDATE draft_items SET points_json = ?, text = ?, props_json = ? WHERE id = ?`, [
      JSON.stringify(i.points),
      i.text,
      JSON.stringify(i.props),
      i.id,
    ]);
  }

  async setDeleted(id: string, deleted: boolean): Promise<void> {
    await this.db.run(`UPDATE draft_items SET is_deleted = ? WHERE id = ?`, [deleted ? 1 : 0, id]);
  }
}
