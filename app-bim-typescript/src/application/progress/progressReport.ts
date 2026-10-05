// =============================================================================
// progressReport.ts — Reporte de avance de un corte: filas, CSV y HTML (PDF)
// =============================================================================

import type { Activity, ProgressCut, QuantityRow } from '../../domain/progress/progress';

export interface ReportMeta {
  readonly project: string;
  readonly space: string;
  readonly cut: ProgressCut;
  readonly operator: string;
  readonly generatedAt: Date;
}

export interface ReportRow {
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
<p style="color:#777;margin-top:10px">Cantidades medidas sobre el modelo: suelos a cara interior de muros; caras de muro descontando vanos. Resolución de medición: 5 cm.</p>
</body></html>`;
}
