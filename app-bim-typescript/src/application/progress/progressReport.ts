// =============================================================================
// progressReport.ts — Reporte de avance: filas, CSV y HTML (PDF)
// =============================================================================
//
// Un reporte se arma para uno o varios CORTES, con un ALCANCE (todo el
// espacio o un elemento: un muro, un suelo, una columna), un filtro de
// actividades y opciones (elementos sin avance, fotos, dibujos). El modelo
// (`buildReport`) es puro; de él salen el PDF (HTML de expo-print), el CSV y
// la memoria de cantidades en Excel (progressMemoria.ts).
// =============================================================================

import { orderedCuts, type Activity, type ProgressCut, type QuantityPart, type QuantityRow } from '../../domain/progress/progress';

export interface ReportMeta {
  readonly project: string;
  readonly space: string;
  readonly cut: ProgressCut;
  readonly operator: string;
  readonly generatedAt: Date;
}

export interface ReportRow {
  readonly targetKey?: string;
  readonly activityId?: string;
  readonly activity: string;
  readonly color: string;
  readonly support: string;
  readonly inCut: number;
  readonly cumulative: number;
  readonly supportArea: number;
  /** Acumulado sobre el soporte, 0–100. */
  readonly percent: number;
}

export interface ActivityTotal {
  readonly activity: string;
  readonly color: string;
  readonly inCut: number;
  readonly cumulative: number;
}

export function reportRows(
  rows: readonly QuantityRow[],
  activities: readonly Activity[],
  supportLabel: (targetKey: string) => string,
): ReportRow[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const order = new Map(activities.map((a, i) => [a.id, i]));
  return [...rows]
    .sort((a, b) => (order.get(a.activityId) ?? 99) - (order.get(b.activityId) ?? 99) || supportLabel(a.targetKey).localeCompare(supportLabel(b.targetKey)))
    .map((r) => ({
      targetKey: r.targetKey,
      activityId: r.activityId,
      activity: byId.get(r.activityId)?.name ?? 'Actividad',
      color: byId.get(r.activityId)?.color ?? '#888888',
      support: supportLabel(r.targetKey),
      inCut: r.inCut,
      cumulative: r.cumulative,
      supportArea: r.supportArea,
      percent: r.supportArea > 0 ? Math.min(100, (r.cumulative / r.supportArea) * 100) : 0,
    }));
}

export function activityTotals(rows: readonly ReportRow[]): ActivityTotal[] {
  const out = new Map<string, { activity: string; color: string; inCut: number; cumulative: number }>();
  for (const r of rows) {
    const t = out.get(r.activity) ?? { activity: r.activity, color: r.color, inCut: 0, cumulative: 0 };
    t.inCut += r.inCut;
    t.cumulative += r.cumulative;
    out.set(r.activity, t);
  }
  return [...out.values()];
}

const csvCell = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV con punto decimal y coma como separador (el que abre Excel en configuración internacional y LibreOffice). */
export function reportCsv(meta: ReportMeta, rows: readonly ReportRow[]): string {
  const head = ['Proyecto', 'Espacio', 'Corte', 'Fecha', 'Actividad', 'Soporte', 'Ejecutado en el corte (m2)', 'Acumulado (m2)', 'Area del soporte (m2)', 'Avance (%)'];
  const lines = rows.map((r) =>
    [meta.project, meta.space, meta.cut.label || meta.cut.date, meta.cut.date, r.activity, r.support, r.inCut.toFixed(2), r.cumulative.toFixed(2), r.supportArea.toFixed(2), r.percent.toFixed(1)]
      .map(String)
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n') + '\n';
}

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML del reporte (expo-print lo convierte en PDF). `svg` es la planta coloreada. */
export function reportHtml(
  meta: ReportMeta,
  rows: readonly ReportRow[],
  svg: string,
  title = 'Reporte de avance de obra',
  /** Caras de muro pintadas (alzados con su avance). */
  faces: readonly { title: string; svg: string }[] = [],
): string {
  const totals = activityTotals(rows);
  const f2 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const swatch = (c: string) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${html(c)};margin-right:6px"></span>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#222;margin:18px}
  h1{font-size:18px;margin:0 0 4px} .meta{color:#555;margin-bottom:12px}
  table{border-collapse:collapse;width:100%;margin-top:10px} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  th{background:#f1f1f1} td.n{text-align:right;font-variant-numeric:tabular-nums}
  .plan{border:1px solid #ccc;margin-top:8px}
</style></head><body>
<h1>${html(title)}</h1>
<div class="meta">${html(meta.project)} · ${html(meta.space)}<br/>
Corte: <b>${html(meta.cut.label || meta.cut.date)}</b> (${html(meta.cut.date)}) · Responsable: ${html(meta.operator || '—')} ·
Generado: ${html(meta.generatedAt.toLocaleString('es-CO'))}</div>
<div class="plan">${svg}</div>
${faces.map((f) => `<h2 style="font-size:13px;margin-top:12px">${html(f.title)}</h2><div class="plan" style="max-width:60%">${f.svg}</div>`).join('\n')}
<h2 style="font-size:14px;margin-top:14px">Resumen por actividad</h2>
<table><tr><th>Actividad</th><th>En el corte (m²)</th><th>Acumulado (m²)</th></tr>
${totals.map((t) => `<tr><td>${swatch(t.color)}${html(t.activity)}</td><td class="n">${f2(t.inCut)}</td><td class="n">${f2(t.cumulative)}</td></tr>`).join('\n')}
</table>
<h2 style="font-size:14px;margin-top:14px">Detalle por soporte</h2>
<table><tr><th>Actividad</th><th>Soporte</th><th>En el corte (m²)</th><th>Acumulado (m²)</th><th>Soporte (m²)</th><th>Avance</th></tr>
${rows
  .map(
    (r) =>
      `<tr><td>${swatch(r.color)}${html(r.activity)}</td><td>${html(r.support)}</td><td class="n">${f2(r.inCut)}</td><td class="n">${f2(r.cumulative)}</td><td class="n">${f2(r.supportArea)}</td><td class="n">${r.percent.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td></tr>`,
  )
  .join('\n')}
</table>
<p style="color:#777;margin-top:10px">Cantidades medidas sobre el modelo: suelos a cara interior de muros; caras de muro descontando vanos. Resolución de medición: 2 cm.</p>
</body></html>`;
}

// =============================================================================
// Reporte con opciones (H-90): varios cortes, alcance, actividades, fotos
// =============================================================================

export interface ReportOptions {
  /** Cortes a reportar (se ordenan cronológicamente). */
  readonly cutIds: readonly string[];
  /** Actividades a incluir; `null` = todas. */
  readonly activityIds: readonly string[] | null;
  /** Soportes del alcance (claves `floor:…`, `wall:…`, `column:…`); `null` = todo el espacio. */
  readonly scopeKeys: readonly string[] | null;
  /** Nombre del alcance ("Todo el espacio", "Muro 3 · cara A"). */
  readonly scopeTitle: string;
  /** Listar también los elementos del alcance sin avance en el corte. */
  readonly includeEmpty: boolean;
  readonly includePhotos: boolean;
  /** Planta y alzados con lo pintado. */
  readonly includeDrawings: boolean;
}

/** Foto de avance: tomada en un corte, quizá ligada a un elemento y a una actividad. */
export interface ReportPhoto {
  readonly id: string;
  readonly code: string;
  readonly takenAt: Date;
  readonly cutId: string;
  readonly targetKey?: string;
  readonly activityId?: string;
  readonly notes?: string;
  readonly operator?: string;
}

/** Parte ejecutada con sus medidas (una fila de la memoria). */
export interface ReportPart {
  readonly targetKey: string;
  readonly support: string;
  readonly activityId: string;
  readonly activity: string;
  readonly color: string;
  /** Largo a lo largo del soporte (muro, columna) o en X (suelo), m. */
  readonly length: number;
  /** Alto (muro, columna) o ancho en Y (suelo), m. */
  readonly height: number;
  readonly area: number;
  /** Suelo: ancho × largo; cara de muro o columna: alto × largo. */
  readonly plane: 'floor' | 'vertical';
}

export interface ReportCutBlock {
  readonly cut: ProgressCut;
  readonly rows: readonly ReportRow[];
  readonly totals: readonly ActivityTotal[];
  readonly parts: readonly ReportPart[];
  /** Elementos del alcance sin avance en este corte (si se pidió). */
  readonly empty: readonly { readonly targetKey: string; readonly support: string; readonly area: number }[];
  readonly photos: readonly ReportPhoto[];
}

export interface ReportSource {
  readonly cuts: readonly ProgressCut[];
  /** Todas las actividades (incluidas las quitadas del catálogo). */
  readonly activities: readonly Activity[];
  readonly supportKeys: readonly string[];
  readonly supportArea: (key: string) => number;
  readonly supportLabel: (key: string) => string;
  readonly quantities: (cutId: string) => readonly QuantityRow[];
  readonly parts: (cutId: string) => readonly QuantityPart[];
  readonly photos: readonly ReportPhoto[];
}

/** Arma el reporte: un bloque por corte elegido, en orden cronológico. */
export function buildReport(src: ReportSource, opt: ReportOptions): ReportCutBlock[] {
  const inScope = (key: string) => !opt.scopeKeys || opt.scopeKeys.includes(key);
  const inActs = (id: string) => !opt.activityIds || opt.activityIds.includes(id);
  const byId = new Map(src.activities.map((a) => [a.id, a]));
  const wanted = new Set(opt.cutIds);
  return orderedCuts(src.cuts)
    .filter((c) => wanted.has(c.id))
    .map((cut) => {
      const q = src.quantities(cut.id).filter((r) => inScope(r.targetKey) && inActs(r.activityId));
      const rows = reportRows(q, src.activities, src.supportLabel).filter((r) => r.inCut > 0 || r.cumulative > 0);
      const parts = src
        .parts(cut.id)
        .filter((p) => inScope(p.targetKey) && inActs(p.activityId))
        .map((p): ReportPart => ({
          targetKey: p.targetKey,
          support: src.supportLabel(p.targetKey),
          activityId: p.activityId,
          activity: byId.get(p.activityId)?.name ?? 'Actividad',
          color: byId.get(p.activityId)?.color ?? '#888888',
          length: p.w,
          height: p.h,
          area: p.w * p.h,
          plane: p.targetKey.startsWith('floor:') ? 'floor' : 'vertical',
        }));
      const withProgress = new Set(q.filter((r) => r.inCut > 0).map((r) => r.targetKey));
      const empty = opt.includeEmpty
        ? src.supportKeys
            .filter((k) => inScope(k) && !withProgress.has(k))
            .map((k) => ({ targetKey: k, support: src.supportLabel(k), area: src.supportArea(k) }))
            .sort((a, b) => a.support.localeCompare(b.support))
        : [];
      const photos = opt.includePhotos
        ? src.photos
            .filter(
              (p) =>
                p.cutId === cut.id &&
                (!opt.scopeKeys || (p.targetKey !== undefined && inScope(p.targetKey))) &&
                (!p.activityId || inActs(p.activityId)),
            )
            .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime())
        : [];
      return { cut, rows, totals: activityTotals(rows), parts, empty, photos };
    });
}

/** CSV de varios cortes (una fila por soporte y actividad en cada corte). */
export function reportCsvBlocks(meta: Omit<ReportMeta, 'cut'>, blocks: readonly ReportCutBlock[]): string {
  const head = ['Proyecto', 'Espacio', 'Corte', 'Fecha', 'Actividad', 'Soporte', 'Ejecutado en el corte (m2)', 'Acumulado (m2)', 'Area del soporte (m2)', 'Avance (%)'];
  const lines: string[] = [];
  for (const b of blocks) {
    const cutName = b.cut.label || b.cut.date;
    for (const r of b.rows) {
      lines.push(
        [meta.project, meta.space, cutName, b.cut.date, r.activity, r.support, r.inCut.toFixed(2), r.cumulative.toFixed(2), r.supportArea.toFixed(2), r.percent.toFixed(1)]
          .map(csvCell)
          .join(','),
      );
    }
    for (const e of b.empty) {
      lines.push([meta.project, meta.space, cutName, b.cut.date, '(sin avance)', e.support, '0.00', '', e.area.toFixed(2), ''].map(csvCell).join(','));
    }
  }
  return [head.join(','), ...lines].join('\n') + '\n';
}

/** Dibujo de un corte para el PDF (planta o alzado con lo pintado). */
export interface ReportDrawing {
  readonly title: string;
  readonly svg: string;
}

const REPORT_CSS = [
  'body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#222;margin:18px}',
  'h1{font-size:18px;margin:0 0 4px} h2.cut{font-size:15px;margin:18px 0 4px;border-bottom:2px solid #FF8F00;padding-bottom:2px}',
  'h2 small{color:#666;font-weight:normal} h3{font-size:12.5px;margin:12px 0 4px}',
  '.meta{color:#555;margin-bottom:12px} .muted{color:#777}',
  'table{border-collapse:collapse;width:100%;margin-top:4px} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}',
  'th{background:#f1f1f1} td.n{text-align:right;font-variant-numeric:tabular-nums}',
  '.plan{border:1px solid #ccc;margin-top:4px;page-break-inside:avoid}',
  '.photos{display:flex;flex-wrap:wrap;gap:8px}',
  'figure{margin:0;width:48%;page-break-inside:avoid} figure img{width:100%;border:1px solid #ccc}',
  'figcaption{font-size:10px;color:#444;margin-top:2px}',
  '.nophoto{height:120px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#999}',
].join('\n');

/**
 * HTML del reporte con opciones (expo-print lo convierte en PDF). Por cada
 * corte: dibujos, resumen, detalle, medidas de lo ejecutado, elementos sin
 * avance y registro fotográfico (con fecha, corte y elemento).
 */
export function reportHtmlBlocks(
  meta: Omit<ReportMeta, 'cut'>,
  opt: ReportOptions,
  blocks: readonly ReportCutBlock[],
  drawings: (cutId: string) => readonly ReportDrawing[],
  photoData: ReadonlyMap<string, string>,
  supportLabel: (key: string) => string,
): string {
  const f2 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const swatch = (c: string) =>
    '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + html(c) + ';margin-right:6px"></span>';
  const when = (d: Date) => d.toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const table = (head: readonly string[], rows: readonly string[][]) =>
    '<table><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr>' + rows.map((r) => '<tr>' + r.join('') + '</tr>').join('\n') + '</table>';
  const td = (s: string, num = false) => (num ? '<td class="n">' : '<td>') + s + '</td>';

  const section = (b: ReportCutBlock): string => {
    const out: string[] = [];
    out.push('<h2 class="cut">Corte ' + html(b.cut.label || b.cut.date) + ' <small>(' + html(b.cut.date) + ')</small></h2>');
    if (opt.includeDrawings) {
      for (const d of drawings(b.cut.id)) out.push('<h3>' + html(d.title) + '</h3><div class="plan">' + d.svg + '</div>');
    }
    out.push('<h3>Resumen por actividad</h3>');
    out.push(
      b.totals.length
        ? table(['Actividad', 'En el corte (m²)', 'Acumulado (m²)'], b.totals.map((t) => [td(swatch(t.color) + html(t.activity)), td(f2(t.inCut), true), td(f2(t.cumulative), true)]))
        : '<p class="muted">Sin avance en este corte.</p>',
    );
    if (b.rows.length) {
      out.push('<h3>Detalle por elemento</h3>');
      out.push(
        table(
          ['Actividad', 'Elemento', 'En el corte (m²)', 'Acumulado (m²)', 'Elemento (m²)', 'Avance'],
          b.rows.map((r) => [
            td(swatch(r.color) + html(r.activity)),
            td(html(r.support)),
            td(f2(r.inCut), true),
            td(f2(r.cumulative), true),
            td(f2(r.supportArea), true),
            td(r.percent.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %', true),
          ]),
        ),
      );
    }
    if (b.parts.length) {
      out.push('<h3>Medidas de lo ejecutado</h3>');
      out.push(
        table(
          ['Actividad', 'Elemento', 'Largo (m)', 'Alto / ancho (m)', 'Área (m²)'],
          b.parts.map((p) => [td(swatch(p.color) + html(p.activity)), td(html(p.support)), td(f2(p.length), true), td(f2(p.height), true), td(f2(p.area), true)]),
        ),
      );
    }
    if (b.empty.length) {
      out.push('<h3>Elementos sin avance en este corte</h3>');
      out.push(table(['Elemento', 'Área (m²)'], b.empty.map((e) => [td(html(e.support)), td(f2(e.area), true)])));
    }
    if (b.photos.length) {
      out.push('<h3>Registro fotográfico</h3><div class="photos">');
      for (const p of b.photos) {
        const src = photoData.get(p.id);
        const caption = [p.code, when(p.takenAt), p.targetKey ? supportLabel(p.targetKey) : 'Foto libre', p.notes ?? ''].filter(Boolean).map(html).join(' · ');
        out.push('<figure>' + (src ? '<img src="' + src + '"/>' : '<div class="nophoto">Foto no disponible</div>') + '<figcaption>' + caption + '</figcaption></figure>');
      }
      out.push('</div>');
    }
    return out.join('\n');
  };

  return [
    '<!doctype html><html><head><meta charset="utf-8"/><style>',
    REPORT_CSS,
    '</style></head><body>',
    '<h1>Reporte de avance de obra</h1>',
    '<div class="meta">' + html(meta.project) + ' · ' + html(meta.space) + ' · <b>' + html(opt.scopeTitle) + '</b><br/>',
    'Cortes: ' + (blocks.map((b) => html(b.cut.label || b.cut.date)).join(', ') || '—') + ' · Responsable: ' + html(meta.operator || '—') + ' · ',
    'Generado: ' + html(meta.generatedAt.toLocaleString('es-CO')) + '</div>',
    blocks.map(section).join('\n'),
    '<p class="muted" style="margin-top:10px">Cantidades medidas sobre el modelo: suelos a cara interior de muros; caras de muro descontando vanos; columnas por su perímetro. ' +
      'Lo ejecutado con una actividad en un corte no se vuelve a contar en cortes posteriores. Resolución de medición: 2 cm.</p>',
    '</body></html>',
  ].join('\n');
}
