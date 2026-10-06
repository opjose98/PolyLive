// =============================================================================
// ZoneStore.ts — Persistencia de recintos con identidad (tabla zones)
// =============================================================================
//
// Los recintos son metadatos derivados de los muros más lo que el operador les
// agrega (nombre, uso, notas): no entran al historial de deshacer. Lo que sí
// se deshace son los muros, y la reconciliación vuelve a ligar el recinto.
// =============================================================================

import { IDatabase } from './database';
import { diagnostics } from '../../shared/diagnostics';
import type { Point2D } from '../../domain/geometry/types';
import type { Zone } from '../../domain/objects/zone';

interface ZoneRow {
  id: string;
  space_id: string;
  level_id: string;
  number: number;
  name: string;
  use_label: string;
  notes: string;
  polygon_json: string;
  net_polygon_json: string;
  seed_x: number;
  seed_y: number;
  area: number;
  net_area: number;
  perimeter: number;
  bound: number;
  created_at: string;
}

function points(json: string): Point2D[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
  } catch (err) {
    // Un contorno ilegible no debe impedir abrir el espacio: el recinto se
    // re-liga en la próxima recarga con el contorno que detecten los muros.
    diagnostics.warn('zones', 'Contorno de recinto ilegible; se recalcula', err);
    return [];
  }
}

const toZone = (r: ZoneRow): Zone => ({
  id: r.id,
  spaceId: r.space_id,
  levelId: r.level_id,
  number: Number(r.number),
  name: r.name,
  use: r.use_label,
  notes: r.notes,
  polygon: points(r.polygon_json),
  netPolygon: points(r.net_polygon_json),
  seed: { x: Number(r.seed_x), y: Number(r.seed_y) },
  area: Number(r.area),
  netArea: Number(r.net_area),
  perimeter: Number(r.perimeter),
  bound: r.bound === 1,
  createdAt: r.created_at,
});

export type ZoneEdit = Partial<Pick<Zone, 'name' | 'use' | 'notes'>>;

export class ZoneStore {
  constructor(private readonly db: IDatabase) {}

  /** Recintos de un espacio (todos los niveles si `levelId` es undefined), por número. */
  async list(spaceId: string, levelId?: string): Promise<Zone[]> {
    const rows =
      levelId === undefined
        ? await this.db.all<ZoneRow>(`SELECT * FROM zones WHERE space_id = ? AND is_deleted = 0 ORDER BY number`, [spaceId])
        : await this.db.all<ZoneRow>(
            `SELECT * FROM zones WHERE space_id = ? AND level_id = ? AND is_deleted = 0 ORDER BY number`,
            [spaceId, levelId],
          );
    return rows.map(toZone);
  }

  async get(id: string): Promise<Zone | null> {
    const row = await this.db.get<ZoneRow>(`SELECT * FROM zones WHERE id = ? AND is_deleted = 0`, [id]);
    return row ? toZone(row) : null;
  }

  /** Siguiente número libre del espacio (incluye los borrados: un número no se reutiliza). */
  async nextNumber(spaceId: string): Promise<number> {
    const row = await this.db.get<{ n: number | null }>(`SELECT MAX(number) AS n FROM zones WHERE space_id = ?`, [spaceId]);
    return (row?.n ?? 0) + 1;
  }

  /** Inserta o reemplaza la geometría y el estado de ligado (no toca nombre, uso ni notas de uno existente). */
  async saveGeometry(zones: readonly Zone[]): Promise<void> {
    if (zones.length === 0) return;
    await this.db.transaction(async () => {
      for (const z of zones) {
        await this.db.run(
          `INSERT INTO zones (id, space_id, level_id, number, name, use_label, notes, polygon_json, net_polygon_json,
                              seed_x, seed_y, area, net_area, perimeter, bound, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             level_id = excluded.level_id,
             polygon_json = excluded.polygon_json,
             net_polygon_json = excluded.net_polygon_json,
             seed_x = excluded.seed_x,
             seed_y = excluded.seed_y,
             area = excluded.area,
             net_area = excluded.net_area,
             perimeter = excluded.perimeter,
             bound = excluded.bound,
             updated_at = datetime('now')`,
          [
            z.id, z.spaceId, z.levelId, z.number, z.name, z.use, z.notes,
            JSON.stringify(z.polygon), JSON.stringify(z.netPolygon),
            z.seed.x, z.seed.y, z.area, z.netArea, z.perimeter, z.bound ? 1 : 0, z.createdAt,
          ],
        );
      }
    });
  }

  /** Nombre, uso y notas: lo que escribe el operador. */
  async edit(id: string, edit: ZoneEdit): Promise<void> {
    const cur = await this.get(id);
    if (!cur) return;
    const name = edit.name !== undefined ? edit.name.trim() || cur.name : cur.name;
    await this.db.run(
      `UPDATE zones SET name = ?, use_label = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      [name, (edit.use ?? cur.use).trim(), edit.notes ?? cur.notes, id],
    );
  }
}
