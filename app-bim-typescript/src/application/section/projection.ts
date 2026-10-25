// =============================================================================
// projection.ts — Vistas por plano vertical: corte (sección) y columna desdoblada
// =============================================================================
//
// CORTE: el operador traza una línea en planta y ve, en alzado, todo lo que
// esa línea atraviesa (muros con sus vanos, columnas, losas, vigas) rayado,
// con las líneas de nivel. Sirve para revisar lo que choca (H-75 obs. 2).
//
// COLUMNA: sus cuatro caras una al lado de otra (desdobladas), con lo que
// atraviesa cada cara (el muro en que está embebida, una viga…). Una columna
// circular se desdobla en cuatro cuartos de su perímetro.
//
// Todo en el mismo sistema que el alzado de un muro: x a lo largo de la vista,
// y sobre la cota más baja (`yBase`), para dibujarlo con el mismo lienzo.
// =============================================================================

import type { AppServices } from '../AppServices';
import type { RoomId } from '../../domain/objects/base';
import type { Point2D } from '../../domain/geometry/types';
import { Column } from '../../domain/objects/column';
import { LEVEL_PROP, ProjectMarker } from '../../domain/objects/marker';
import { columnVerticalOf, resolveExtent } from '../../domain/objects/vertical';
import { CutKind, columnFaces, sectionCuts } from '../../domain/section/sectionCut';
import { loadCutModel } from './cutModel';

interface ProjectionCut {
  readonly id: string;
  readonly kind: CutKind;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface Projection {
  readonly title: string;
  readonly detail: string;
  /** Largo de la vista (m). */
  readonly length: number;
  /** Cota absoluta del y = 0 de la vista. */
  readonly yBase: number;
  /** Alto útil de la vista sobre `yBase` (m). */
  readonly height: number;
  readonly cuts: readonly ProjectionCut[];
  /** Columna: alto de su silueta (se dibuja como el muro); corte: sin silueta. */
  readonly silhouette: number | null;
  readonly dividers?: readonly { readonly x: number; readonly label: string }[];
}

const elevationsOf = (levels: readonly ProjectMarker[]) => new Map(levels.map((m) => [m.id, m.value] as [string, number]));
const baseOf = (levels: readonly ProjectMarker[]) => levels.find((m) => m.isBase)?.id ?? '';

/** Lo que corta la línea a → b, en alzado visto desde la izquierda de la línea. */
export async function sectionProjection(
  services: AppServices,
  spaceId: RoomId,
  levels: readonly ProjectMarker[],
  a: Point2D,
  b: Point2D,
): Promise<Projection> {
  const model = await loadCutModel(services, spaceId, elevationsOf(levels), baseOf(levels));
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const pieces = sectionCuts({ origin: a, dir: { x: b.x - a.x, y: b.y - a.y }, length, halfWidth: 0.005 }, model);
  const zs = pieces.flatMap((p) => p.bands.flat());
  const yBase = Math.min(0, ...zs);
  const top = Math.max(yBase + 1, ...zs);
  const counts = new Map<CutKind, number>();
  for (const p of pieces) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  const label: Record<CutKind, string> = { wall: 'muro(s)', column: 'columna(s)', slab: 'losa(s)', beam: 'viga(s)' };
  return {
    title: 'Corte',
    detail: pieces.length ? [...counts].map(([k, n]) => `${n} ${label[k]}`).join(' · ') : 'No corta nada',
    length,
    yBase,
    height: top - yBase,
    cuts: pieces.flatMap((p) => p.bands.map(([z0, z1]) => ({ id: p.id, kind: p.kind, x0: p.x0, x1: p.x1, y0: z0 - yBase, y1: z1 - yBase }))),
    silhouette: null,
  };
}

/** Las caras de la columna desdobladas, con lo que atraviesa cada una. */
export async function columnProjection(
  services: AppServices,
  spaceId: RoomId,
  levels: readonly ProjectMarker[],
  column: Column,
): Promise<Projection> {
  const elev = elevationsOf(levels);
  const model = await loadCutModel(services, spaceId, elev, baseOf(levels));
  const e = resolveExtent(columnVerticalOf(column, baseOf(levels), LEVEL_PROP), elev);
  const circular = column.sectionShape === 'circular';
  const w = column.dimensionX as number;
  const d = circular ? w : ((column.dimensionY as number | undefined) ?? w);
  // Circular: cuatro cuartos del perímetro (π·d/4 cada uno) sobre las caras del cuadrado circunscrito.
  const stretch = circular ? Math.PI / 4 : 1;
  const others = { ...model, columns: model.columns?.filter((c) => c.id !== (column.id as string)) };
  let x = 0;
  const cuts: ProjectionCut[] = [];
  const dividers: { x: number; label: string }[] = [];
  for (const face of columnFaces(column.position, w, d, column.rotation ?? 0)) {
    dividers.push({ x, label: face.label });
    for (const p of sectionCuts(face.line, others)) {
      for (const [z0, z1] of p.bands) {
        const lo = Math.max(z0, e.base);
        const hi = Math.min(z1, e.top);
        if (hi - lo > 0.005) cuts.push({ id: p.id, kind: p.kind, x0: x + p.x0 * stretch, x1: x + p.x1 * stretch, y0: lo - e.base, y1: hi - e.base });
      }
    }
    x += face.line.length * stretch;
  }
  const name = (column.properties.name as string | undefined) ?? 'Columna';
  return {
    title: `Alzado · ${name}`,
    detail: `${circular ? `Ø ${w.toFixed(2)}` : `${w.toFixed(2)} × ${d.toFixed(2)}`} m · ${(e.top - e.base).toFixed(2)} m de alto`,
    length: x,
    yBase: e.base,
    height: e.top - e.base,
    cuts,
    silhouette: e.top - e.base,
    dividers,
  };
}
