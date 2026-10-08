// =============================================================================
// ReviewStore.ts — Persistencia de observaciones de revisión (M4)
// =============================================================================

import { IDatabase } from './database';
import { diagnostics } from '../../shared/diagnostics';
import type { Markup, ReviewItem, ReviewStatus, ReviewView } from '../../domain/review/review';

interface Row {
  id: string;
  space_id: string;
  number: number;
  view_json: string;
  markup_json: string;
  color: string;
  comment: string;
  author: string;
  status: ReviewStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  photo_id: string | null;
  created_at: string;
}

function toItem(r: Row): ReviewItem | null {
  try {
    return {
      id: r.id,
      spaceId: r.space_id,
      number: Number(r.number),
      view: JSON.parse(r.view_json) as ReviewView,
      markup: JSON.parse(r.markup_json) as Markup,
      color: r.color,
      comment: r.comment,
      author: r.author,
      createdAt: r.created_at,
      status: r.status === 'resolved' ? 'resolved' : 'open',
      ...(r.resolved_by ? { resolvedBy: r.resolved_by } : {}),
      ...(r.resolved_at ? { resolvedAt: r.resolved_at } : {}),
      ...(r.photo_id ? { photoId: r.photo_id } : {}),
    };
  } catch (err) {
    // Una observación ilegible se omite: no debe impedir ver las demás.
    diagnostics.error('review_items', `Se omitió una fila ilegible (${r.id})`, err);
    return null;
  }
}

export class ReviewStore {
  constructor(private readonly db: IDatabase) {}

  async list(spaceId: string): Promise<ReviewItem[]> {
    const rows = await this.db.all<Row>(`SELECT * FROM review_items WHERE space_id = ? AND is_deleted = 0 ORDER BY number`, [spaceId]);
    return rows.map(toItem).filter((i): i is ReviewItem => i !== null);
  }

  /** Siguiente número del espacio (los borrados no se reutilizan: el acta los puede citar). */
  async nextNumber(spaceId: string): Promise<number> {
    const r = await this.db.get<{ n: number | null }>(`SELECT MAX(number) AS n FROM review_items WHERE space_id = ?`, [spaceId]);
    return (r?.n ?? 0) + 1;
  }

  async add(i: ReviewItem): Promise<void> {
    await this.db.run(
      `INSERT INTO review_items (id, space_id, number, view_json, markup_json, color, comment, author, status, photo_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.spaceId, i.number, JSON.stringify(i.view), JSON.stringify(i.markup), i.color, i.comment, i.author, i.status, i.photoId ?? null, i.createdAt],
    );
  }

  async update(id: string, edit: { comment?: string; color?: string; photoId?: string | null; markup?: Markup }): Promise<void> {
    if (edit.comment !== undefined) await this.db.run(`UPDATE review_items SET comment = ? WHERE id = ?`, [edit.comment, id]);
    if (edit.color !== undefined) await this.db.run(`UPDATE review_items SET color = ? WHERE id = ?`, [edit.color, id]);
    if (edit.photoId !== undefined) await this.db.run(`UPDATE review_items SET photo_id = ? WHERE id = ?`, [edit.photoId, id]);
    if (edit.markup !== undefined) await this.db.run(`UPDATE review_items SET markup_json = ? WHERE id = ?`, [JSON.stringify(edit.markup), id]);
  }

  async setStatus(id: string, status: ReviewStatus, by: string, at: string): Promise<void> {
    await this.db.run(`UPDATE review_items SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`, [
      status,
      status === 'resolved' ? by : null,
      status === 'resolved' ? at : null,
      id,
    ]);
  }

  async setDeleted(id: string, deleted: boolean): Promise<void> {
    await this.db.run(`UPDATE review_items SET is_deleted = ? WHERE id = ?`, [deleted ? 1 : 0, id]);
  }
}
