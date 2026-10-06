// =============================================================================
// deliverables.ts — Entregables: plano con cuadro de áreas y registro fotográfico
// =============================================================================
//
// Lo que antes había que armar a mano en la oficina:
//   · PLANO: la planta con rótulo (proyecto, espacio, nivel, fecha, responsable)
//     y escala gráfica, más el CUADRO DE ÁREAS por recinto (neta y al eje).
//   · REGISTRO FOTOGRÁFICO: cada foto con su código, fecha, autor, ubicación
//     (planta o cara de muro) y notas: la evidencia que pide la interventoría.
// HTML para imprimir a PDF; el cuadro de áreas también como CSV.
// =============================================================================

export interface SheetMeta {
  readonly project: string;
  readonly projectCode?: string;
  readonly space: string;
  readonly level?: string;
  readonly operator: string;
  readonly generatedAt: Date;
}

export interface AreaRow {
  readonly code: string;
  readonly name: string;
  readonly use: string;
  readonly level: string;
  readonly netArea: number;
  readonly perimeter: number;
  readonly axisArea: number;
}

export interface PhotoEntry {
  readonly code: string;
  readonly takenAt: Date;
  readonly author: string;
  readonly where: string;
  readonly notes: string;
  readonly gps?: string;
  /** Imagen como data URI (o null si no se pudo leer). */
  readonly dataUri: string | null;
  /** Sello de evidencia: hash corto y si la imagen sigue íntegra (null: foto sin sello). */
  readonly seal?: { readonly hash: string; readonly intact: boolean } | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d: Date) => d.toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function areaTotals(rows: readonly AreaRow[]): { netArea: number; axisArea: number } {
  return rows.reduce((t, r) => ({ netArea: t.netArea + r.netArea, axisArea: t.axisArea + r.axisArea }), { netArea: 0, axisArea: 0 });
}

/** Cuadro de áreas como CSV (separador ;, decimales con coma: lo que abre Excel en es-CO). */
export function areaScheduleCsv(meta: SheetMeta, rows: readonly AreaRow[]): string {
  const c = (v: number) => v.toFixed(2).replace('.', ',');
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const t = areaTotals(rows);
  return [
    `Proyecto;${q(meta.project)}`,
    `Espacio;${q(meta.space)}`,
    `Generado;${when(meta.generatedAt)}`,
    '',
    'Código;Recinto;Uso;Nivel;Área neta (m²);Perímetro neto (m);Área al eje (m²)',
    ...rows.map((r) => [r.code, q(r.name), q(r.use), q(r.level), c(r.netArea), c(r.perimeter), c(r.axisArea)].join(';')),
    `Total;;;;${c(t.netArea)};;${c(t.axisArea)}`,
  ].join('\r\n');
}

const BASE_CSS = `
  @page{size:A4;margin:12mm}
  body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:10.5px;color:#222;margin:0}
  h1{font-size:16px;margin:0 0 2px} h2{font-size:13px;margin:14px 0 6px}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}
  th{background:#efefef} td.n{text-align:right;font-variant-numeric:tabular-nums}
  .plan{border:1px solid #888}
  .rotulo{display:grid;grid-template-columns:2fr 1fr 1fr;border:1.5px solid #222;margin-top:6px}
  .rotulo div{border:0.5px solid #888;padding:4px 6px}
  .rotulo b{display:block;font-size:8px;color:#666;font-weight:normal;text-transform:uppercase}
  .muted{color:#666}
`;

function rotulo(meta: SheetMeta, title: string): string {
  return `<div class="rotulo">
  <div><b>Proyecto</b>${esc(meta.project)}${meta.projectCode ? ` · ${esc(meta.projectCode)}` : ''}</div>
  <div><b>Plano</b>${esc(title)}</div>
  <div><b>Fecha</b>${esc(when(meta.generatedAt))}</div>
  <div><b>Espacio</b>${esc(meta.space)}${meta.level ? ` · ${esc(meta.level)}` : ''}</div>
  <div><b>Levantó</b>${esc(meta.operator || '—')}</div>
  <div><b>Escala</b>gráfica (ver barra)</div>
</div>`;
}

/** Plano de planta con rótulo y cuadro de áreas. `svg` debe traer la escala gráfica. */
export function planSheetHtml(meta: SheetMeta, svg: string, rows: readonly AreaRow[]): string {
  const t = areaTotals(rows);
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.use)}</td><td>${esc(r.level)}</td><td class="n">${num(r.netArea)}</td><td class="n">${num(r.perimeter)}</td><td class="n">${num(r.axisArea)}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
<div class="plan">${svg}</div>
${rotulo(meta, 'Planta de levantamiento')}
<h2>Cuadro de áreas</h2>
<table><tr><th>Código</th><th>Recinto</th><th>Uso</th><th>Nivel</th><th>Área neta (m²)</th><th>Perímetro (m)</th><th>Área al eje (m²)</th></tr>
${body}
<tr><th colspan="4">Total</th><th class="n">${num(t.netArea)}</th><th></th><th class="n">${num(t.axisArea)}</th></tr>
</table>
<p class="muted">Área neta: a cara interior de muros (la que se pisa). Área al eje: por los ejes de los muros. Medidas levantadas con PolyLive (criterio de cierre: docs/24).</p>
</body></html>`;
}

/** Registro fotográfico: dos fotos por fila, con sus datos. */
export function photoRegisterHtml(meta: SheetMeta, photos: readonly PhotoEntry[]): string {
  const card = (p: PhotoEntry) => `<div class="ph">
  ${p.dataUri ? `<img src="${p.dataUri}"/>` : '<div class="noimg">Imagen no disponible</div>'}
  <div class="pd"><b>${esc(p.code)}</b> · ${esc(when(p.takenAt))} · ${esc(p.author || '—')}<br/>
  ${esc(p.where)}${p.gps ? `<br/><span class="muted">GPS ${esc(p.gps)}</span>` : ''}${p.notes ? `<br/>${esc(p.notes)}` : ''}
  ${p.seal ? `<br/><span class="muted">Sello SHA-256 ${esc(p.seal.hash)}… · ${p.seal.intact ? 'íntegra' : '<b style="color:#c62828">ALTERADA</b>'}</span>` : ''}</div>
</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .ph{border:1px solid #bbb;break-inside:avoid;page-break-inside:avoid}
  .ph img{width:100%;height:62mm;object-fit:cover;display:block;background:#eee}
  .noimg{height:62mm;display:flex;align-items:center;justify-content:center;background:#eee;color:#888}
  .pd{padding:4px 6px}
</style></head><body>
<h1>Registro fotográfico</h1>
${rotulo(meta, `Registro fotográfico (${photos.length} foto${photos.length === 1 ? '' : 's'})`)}
<div class="grid" style="margin-top:10px">
${photos.map(card).join('\n')}
</div>
</body></html>`;
}
