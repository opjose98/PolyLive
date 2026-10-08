// =============================================================================
// reviewReport.ts — Acta de revisión: observaciones a SVG, CSV y HTML (PDF)
// =============================================================================

import type { ReviewItem } from '../../domain/review/review';
import { anchorOf, localStamp } from '../../domain/review/review';
import { cloudOutline } from './cloud';
import type { SvgMark } from '../report/planSvg';

/** Marcas de una lista de observaciones como elementos del SVG de la planta. */
export function reviewSvgMarks(items: readonly ReviewItem[]): SvgMark[] {
  const out: SvgMark[] = [];
  for (const i of items) {
    const m = i.markup;
    if (m.kind === 'freehand') out.push({ kind: 'polyline', points: m.points, color: i.color });
    else if (m.kind === 'arrow') out.push({ kind: 'arrow', a: m.a, b: m.b, color: i.color });
    else if (m.kind === 'rect') {
      out.push({ kind: 'polyline', points: [m.a, { x: m.b.x, y: m.a.y }, m.b, { x: m.a.x, y: m.b.y }], closed: true, color: i.color });
    } else if (m.kind === 'cloud') {
      out.push({ kind: 'polyline', points: cloudOutline(m.a, m.b), closed: true, color: i.color });
    } else out.push({ kind: 'text', at: m.at, text: m.text, color: i.color });
    out.push({ kind: 'pin', at: anchorOf(m), label: String(i.number), color: i.color });
  }
  return out;
}

interface ReviewMeta {
  readonly project: string;
  readonly space: string;
  readonly reviewer: string;
  readonly generatedAt: Date;
}

const csvCell = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const fmtDate = localStamp;

export function reviewCsv(meta: ReviewMeta, items: readonly ReviewItem[], where: (i: ReviewItem) => string): string {
  const head = ['Proyecto', 'Espacio', 'No.', 'Vista', 'Estado', 'Comentario', 'Autor', 'Fecha', 'Resuelto por', 'Fecha resuelto', 'Foto'];
  const rows = items.map((i) =>
    [
      meta.project,
      meta.space,
      String(i.number),
      where(i),
      i.status === 'open' ? 'Abierta' : 'Resuelta',
      i.comment,
      i.author,
      fmtDate(i.createdAt),
      i.resolvedBy ?? '',
      fmtDate(i.resolvedAt),
      i.photoId ? 'sí' : '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...rows].join('\n') + '\n';
}

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * HTML del acta (expo-print → PDF). `views` son los dibujos: la planta y las
 * caras de muro que tengan observaciones, cada uno con su SVG.
 */
export function reviewHtml(
  meta: ReviewMeta,
  items: readonly ReviewItem[],
  views: readonly { title: string; svg: string }[],
  where: (i: ReviewItem) => string,
  /** Fotos incrustadas (data URI) por id de foto: el acta lleva la evidencia, no solo "con foto". */
  photos: ReadonlyMap<string, string> = new Map(),
): string {
  const open = items.filter((i) => i.status === 'open').length;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#222;margin:18px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:14px 0 4px} .meta{color:#555;margin-bottom:10px}
  .view{border:1px solid #ccc;margin-bottom:10px;page-break-inside:avoid}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#f1f1f1} .num{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:9px;color:#fff;text-align:center;font-weight:bold;font-size:10px}
  .photo{max-width:220px;max-height:160px;margin-top:4px;border-radius:4px}
  .open{color:#c62828;font-weight:bold} .res{color:#2e7d32}
</style></head><body>
<h1>Acta de revisión</h1>
<div class="meta">${html(meta.project)} · ${html(meta.space)}<br/>
Revisó: ${html(meta.reviewer || '—')} · Generado: ${html(meta.generatedAt.toLocaleString('es-CO'))} ·
${items.length} observación(es), ${open} abierta(s)</div>
${views.map((v) => `<h2>${html(v.title)}</h2><div class="view">${v.svg}</div>`).join('\n')}
<h2>Observaciones</h2>
<table><tr><th>No.</th><th>Vista</th><th>Comentario</th><th>Autor y fecha</th><th>Estado</th></tr>
${items
  .map(
    (i) =>
      `<tr><td><span class="num" style="background:${html(i.color)}">${i.number}</span></td><td>${html(where(i))}</td>` +
      `<td>${html(i.comment || (i.markup.kind === 'text' ? i.markup.text : '—'))}` +
      `${i.photoId ? (photos.get(i.photoId) ? `<br/><img class="photo" src="${photos.get(i.photoId)}"/>` : '<br/><i>Con foto</i>') : ''}</td>` +
      `<td>${html(i.author || '—')}<br/>${html(fmtDate(i.createdAt))}</td>` +
      `<td>${i.status === 'open' ? '<span class="open">Abierta</span>' : `<span class="res">Resuelta</span><br/>${html(i.resolvedBy ?? '')} ${html(fmtDate(i.resolvedAt))}`}</td></tr>`,
  )
  .join('\n')}
</table>
</body></html>`;
}
