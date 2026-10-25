// =============================================================================
// xlsxWriter.ts — Libro de Excel (OOXML) mínimo, sin dependencias nuevas
// =============================================================================
//
// La memoria de cantidades sale en .xlsx con los estilos de la plantilla del
// contrato (fuentes, rellenos, bordes, celdas combinadas, anchos y altos) y
// con fotos e imágenes ancladas. No hay librería de Excel en la app: un .xlsx
// es un zip de XML, y `fflate` (ya instalado para el paquete .polylive) lo
// comprime. Se escribe lo justo para que Excel, LibreOffice y Google Sheets lo
// abran sin reparar: una hoja, estilos deduplicados, cadenas en línea,
// fórmulas con su valor ya calculado y dibujos con anclas de una celda.
// =============================================================================

import { strToU8, zipSync, Zippable } from 'fflate';

type BorderStyle = 'thin' | 'medium' | 'thick' | null;

export interface CellStyle {
  readonly font?: { readonly name?: string; readonly size?: number; readonly bold?: boolean; readonly italic?: boolean; readonly color?: string };
  /** Relleno sólido, `RRGGBB`. */
  readonly fill?: string;
  readonly border?: { readonly left?: BorderStyle; readonly right?: BorderStyle; readonly top?: BorderStyle; readonly bottom?: BorderStyle };
  readonly align?: { readonly h?: 'left' | 'center' | 'right'; readonly v?: 'top' | 'center' | 'bottom'; readonly wrap?: boolean };
  /** Formato numérico ("0.00", "#,##0"). */
  readonly numFmt?: string;
}

export type CellValue = string | number | { readonly formula: string; readonly value?: number } | null;

export interface SheetImage {
  /** Celda de anclaje (0-based) y desplazamiento dentro de ella (px). */
  readonly col: number;
  readonly row: number;
  readonly dx?: number;
  readonly dy?: number;
  /** Tamaño en px. */
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly format: 'png' | 'jpeg';
  readonly name?: string;
}

const EMU_PER_PX = 9525;
/** Quita caracteres de control que XML 1.0 no admite (p. ej. si se pega texto con NUL/BEL). */
const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Letra(s) de columna de un índice 0-based (0 → A, 26 → AA). */
export function colName(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "B12" → { col: 1, row: 11 } (0-based). */
export function parseRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Celda no válida: ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

const ref = (col: number, row: number) => `${colName(col)}${row + 1}`;

export class XlsxSheet {
  private readonly cells = new Map<string, { col: number; row: number; value: CellValue; style: number }>();
  private readonly merges: string[] = [];
  private readonly colWidths = new Map<number, number>();
  private readonly rowHeights = new Map<number, number>();
  readonly images: SheetImage[] = [];
  /** Hoja horizontal ajustada al ancho de la página. */
  landscape = true;

  constructor(
    readonly name: string,
    private readonly styles: StyleRegistry,
  ) {}

  /** Escribe una celda ("B4" o col/fila 0-based). */
  set(at: string | { col: number; row: number }, value: CellValue, style?: CellStyle): void {
    const { col, row } = typeof at === 'string' ? parseRef(at) : at;
    this.cells.set(`${row}:${col}`, { col, row, value, style: style ? this.styles.id(style) : 0 });
  }

  /** Aplica un estilo a todas las celdas del rango (sin cambiar sus valores). */
  styleRange(range: string, style: CellStyle): void {
    const [a, b] = range.split(':').map(parseRef);
    const id = this.styles.id(style);
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
        const k = `${r}:${c}`;
        const cur = this.cells.get(k);
        this.cells.set(k, { col: c, row: r, value: cur?.value ?? null, style: id });
      }
    }
  }

  /** Combina un rango ("B2:D2"); el estilo, si se da, va a todas sus celdas (los bordes se ven completos). */
  merge(range: string, style?: CellStyle): void {
    this.merges.push(range);
    if (style) {
      const first = range.split(':')[0];
      const cur = this.cells.get((({ row, col }) => `${row}:${col}`)(parseRef(first)));
      this.styleRange(range, style);
      if (cur) this.set(first, cur.value, style);
    }
  }

  setColWidth(col: string | number, width: number): void {
    this.colWidths.set(typeof col === 'number' ? col : parseRef(`${col}1`).col, width);
  }

  setRowHeight(row: number, heightPt: number): void {
    this.rowHeights.set(row, heightPt);
  }

  /** Ancho en px de una columna (fórmula de Excel para Calibri 11 / Arial 10). */
  colPx(col: number): number {
    const w = this.colWidths.get(col) ?? 8.43;
    return Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
  }

  rowPx(row: number): number {
    return ((this.rowHeights.get(row) ?? 15) * 96) / 72;
  }

  addImage(img: SheetImage): void {
    this.images.push(img);
  }

  xml(drawingRel: string | null): string {
    const rows = new Map<number, { col: number; xml: string }[]>();
    for (const c of this.cells.values()) {
      const list = rows.get(c.row) ?? [];
      list.push({ col: c.col, xml: cellXml(c.col, c.row, c.value, c.style) });
      rows.set(c.row, list);
    }
    for (const r of this.rowHeights.keys()) if (!rows.has(r)) rows.set(r, []);
    const rowXml = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cs]) => {
        const h = this.rowHeights.get(r);
        const attrs = h !== undefined ? ` ht="${h}" customHeight="1"` : '';
        return `<row r="${r + 1}"${attrs}>${cs.sort((a, b) => a.col - b.col).map((c) => c.xml).join('')}</row>`;
      })
      .join('');
    const cols = [...this.colWidths.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, w]) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`)
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<sheetViews><sheetView workbookViewId="0" zoomScale="70" zoomScaleNormal="70"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${rowXml}</sheetData>` +
      (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
      '<pageMargins left="0.51" right="0.51" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
      `<pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
      (drawingRel ? `<drawing r:id="${drawingRel}"/>` : '') +
      '</worksheet>'
    );
  }
}

function cellXml(col: number, row: number, value: CellValue, style: number): string {
  const r = ref(col, row);
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${r}"${s}/>`;
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${r}"${s}><v>${value}</v></c>` : `<c r="${r}"${s}/>`;
  if (typeof value === 'string') return `<c r="${r}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  const v = value.value !== undefined && Number.isFinite(value.value) ? `<v>${value.value}</v>` : '';
  return `<c r="${r}"${s}><f>${esc(value.formula)}</f>${v}</c>`;
}

// ---------------------------------------------------------------------------
// Estilos (deduplicados)
// ---------------------------------------------------------------------------

class StyleRegistry {
  private readonly fonts: string[] = ['<font><sz val="10"/><name val="Arial"/></font>'];
  private readonly fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private readonly borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private readonly numFmts: string[] = [];
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly byKey = new Map<string, number>();

  private index(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  id(s: CellStyle): number {
    const key = JSON.stringify(s);
    const known = this.byKey.get(key);
    if (known !== undefined) return known;
    const f = s.font ?? {};
    const font = this.index(
      this.fonts,
      `<font>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}<sz val="${f.size ?? 10}"/>${f.color ? `<color rgb="FF${f.color}"/>` : ''}<name val="${esc(f.name ?? 'Arial')}"/></font>`,
    );
    const fill = s.fill ? this.index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const b = s.border ?? {};
    const side = (tag: string, st?: BorderStyle) => (st ? `<${tag} style="${st}"><color rgb="FF000000"/></${tag}>` : `<${tag}/>`);
    const border = this.index(this.borders, `<border>${side('left', b.left)}${side('right', b.right)}${side('top', b.top)}${side('bottom', b.bottom)}<diagonal/></border>`);
    let numFmtId = 0;
    if (s.numFmt) {
      const builtin: Record<string, number> = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4 };
      numFmtId = builtin[s.numFmt] ?? 164 + this.index(this.numFmts, s.numFmt);
    }
    const a = s.align;
    const align = a ? `<alignment${a.h ? ` horizontal="${a.h}"` : ''}${a.v ? ` vertical="${a.v}"` : ''}${a.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ''} applyFont="1"${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    const id = this.index(this.xfs, xf);
    this.byKey.set(key, id);
    return id;
  }

  xml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

// ---------------------------------------------------------------------------
// Libro
// ---------------------------------------------------------------------------

export class XlsxWorkbook {
  private readonly styles = new StyleRegistry();
  private readonly sheets: XlsxSheet[] = [];

  addSheet(name: string): XlsxSheet {
    const s = new XlsxSheet(name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), this.styles);
    this.sheets.push(s);
    return s;
  }

  /** El .xlsx como bytes. */
  toBytes(): Uint8Array {
    const files: Zippable = {};
    const ct: string[] = [];
    const wbRels: string[] = [];
    let imageN = 0;
    this.sheets.forEach((sheet, i) => {
      const n = i + 1;
      wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
      ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
      let drawingRel: string | null = null;
      if (sheet.images.length) {
        drawingRel = 'rId1';
        files[`xl/worksheets/_rels/sheet${n}.xml.rels`] = strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`,
        );
        ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        const rels: string[] = [];
        const anchors: string[] = [];
        sheet.images.forEach((img, k) => {
          imageN++;
          const file = `image${imageN}.${img.format === 'png' ? 'png' : 'jpeg'}`;
          files[`xl/media/${file}`] = img.data;
          rels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${file}"/>`);
          anchors.push(
            '<xdr:oneCellAnchor>' +
              `<xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>${Math.round((img.dx ?? 0) * EMU_PER_PX)}</xdr:colOff><xdr:row>${img.row}</xdr:row><xdr:rowOff>${Math.round((img.dy ?? 0) * EMU_PER_PX)}</xdr:rowOff></xdr:from>` +
              `<xdr:ext cx="${Math.round(img.width * EMU_PER_PX)}" cy="${Math.round(img.height * EMU_PER_PX)}"/>` +
              `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="${esc(img.name ?? `Imagen ${k + 1}`)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
              `<xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
              `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(img.width * EMU_PER_PX)}" cy="${Math.round(img.height * EMU_PER_PX)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
              '<xdr:clientData/></xdr:oneCellAnchor>',
          );
        });
        files[`xl/drawings/_rels/drawing${n}.xml.rels`] = strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>',
        );
        files[`xl/drawings/drawing${n}.xml`] = strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            anchors.join('') +
            '</xdr:wsDr>',
        );
      }
      files[`xl/worksheets/sheet${n}.xml`] = strToU8(sheet.xml(drawingRel));
    });
    const defaults =
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>';
    files['[Content_Types].xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        defaults +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        ct.join('') +
        '</Types>',
    );
    files['_rels/.rels'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    );
    files['xl/workbook.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    );
    wbRels.push(`<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    files['xl/_rels/workbook.xml.rels'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels.join('') + '</Relationships>',
    );
    files['xl/styles.xml'] = strToU8(this.styles.xml());
    return zipSync(files, { level: 6 });
  }
}
