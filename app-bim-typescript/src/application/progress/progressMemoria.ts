// =============================================================================
// progressMemoria.ts — Memoria de cálculo de cantidades de obra (Excel)
// =============================================================================
//
// Reproduce la plantilla de memorias del contrato (formato GES-FO-118: fuentes
// Times New Roman, grises D8D8D8, marco grueso, columnas B–S con sus anchos)
// pero acumulada en UNA hoja vertical:
//
//   encabezado del contrato (una vez)
//   por cada actividad (un ítem del presupuesto):
//     CAPÍTULO/ÍTEM · DESCRIPCIÓN · UNIDAD · FORMA DE PAGO
//     ESQUEMA Y REGISTRO FOTOGRÁFICO | LOCALIZACIÓN | DIMENSIONES | No. | PARCIAL | TOTAL
//       por cada corte: título «CORTE …», una fila por parte ejecutada con sus
//       medidas (fórmulas), y debajo los dibujos y las fotos del corte
//     OBSERVACIONES · TOTAL
//   firmas
//
// Los valores son los del avance de la app; la plantilla solo da la forma.
// =============================================================================

import { XlsxWorkbook, XlsxSheet, CellStyle, CellValue } from '../../infrastructure/export/xlsx/xlsxWriter';
import type { ReportCutBlock, ReportPart } from './progressReport';
import type { Activity } from '../../domain/progress/progress';

/** Encabezado del contrato (lo que se escribe a mano en la plantilla). Se recuerda por proyecto. */
export interface MemoriaHeader {
  readonly codigoFormato: string;
  readonly contrato: string;
  readonly actaParcial: string;
  readonly objeto: string;
  readonly contratista: string;
  readonly interventoria: string;
  readonly directorObra: string;
  readonly matriculaDirectorObra: string;
  readonly directorInterventoria: string;
  readonly matriculaDirectorInterventoria: string;
  readonly residenteObra: string;
  readonly matriculaResidenteObra: string;
  readonly residenteInterventoria: string;
  readonly matriculaResidenteInterventoria: string;
}

export const EMPTY_MEMORIA_HEADER: MemoriaHeader = {
  codigoFormato: '',
  contrato: '',
  actaParcial: '',
  objeto: '',
  contratista: '',
  interventoria: '',
  directorObra: '',
  matriculaDirectorObra: '',
  directorInterventoria: '',
  matriculaDirectorInterventoria: '',
  residenteObra: '',
  matriculaResidenteObra: '',
  residenteInterventoria: '',
  matriculaResidenteInterventoria: '',
};

/** Ítem del presupuesto de una actividad (editable; por defecto, el nombre de la actividad). */
export interface MemoriaItem {
  readonly code: string;
  readonly description: string;
  readonly unit: string;
}

/** Imagen ya rasterizada (dibujo PNG o foto JPEG) con su pie. */
export interface MemoriaImage {
  readonly data: Uint8Array;
  readonly format: 'png' | 'jpeg';
  readonly width: number;
  readonly height: number;
  readonly caption: string;
}

export interface MemoriaInput {
  readonly header: MemoriaHeader;
  readonly project: string;
  readonly space: string;
  readonly activities: readonly Activity[];
  readonly blocks: readonly ReportCutBlock[];
  readonly items: ReadonlyMap<string, MemoriaItem>;
  /** Dibujos y fotos de un corte para una actividad (en orden). */
  readonly images: (cutId: string, activityId: string) => readonly MemoriaImage[];
}

// ---------------------------------------------------------------------------
// Estilos de la plantilla
// ---------------------------------------------------------------------------

const TNR = 'Times New Roman';
const GREY = 'D8D8D8';
const L = 1; // columna B
const R = 18; // columna S
const COLS: Record<string, number> = { A: 5.63, B: 7.63, C: 16.63, D: 19.63, E: 18.13, F: 11, G: 25.63, H: 28, I: 20.75, J: 14.13, K: 3, L: 20.75, M: 27.88, N: 20.75, O: 20.75, P: 20.75, Q: 24.63, R: 17.75, S: 32.63 };

const thinBox = { left: 'thin', right: 'thin', top: 'thin', bottom: 'thin' } as const;
const label: CellStyle = { font: { name: TNR, size: 12, bold: true }, align: { h: 'right', v: 'center', wrap: true } };
const value: CellStyle = { font: { name: TNR, size: 12 }, border: { bottom: 'thin' }, align: { v: 'center', wrap: true } };
const head: CellStyle = { font: { name: TNR, size: 12, bold: true }, fill: GREY, border: thinBox, align: { h: 'center', v: 'center', wrap: true } };
const boxBold: CellStyle = { font: { name: TNR, size: 12, bold: true }, border: thinBox, align: { h: 'center', v: 'center', wrap: true } };
const boxText: CellStyle = { font: { name: TNR, size: 12 }, border: thinBox, align: { h: 'center', v: 'center', wrap: true } };
const num: CellStyle = { ...boxText, numFmt: '0.00' };
const numBold: CellStyle = { ...boxBold, numFmt: '0.00' };
const caption: CellStyle = { font: { name: TNR, size: 10 }, border: thinBox, align: { h: 'left', v: 'top', wrap: true } };

/** Marco grueso del formato: borde izquierdo en B y derecho en S. */
function framed(col: number, s: CellStyle | undefined): CellStyle | undefined {
  if (col !== L && col !== R) return s;
  const base = s ?? { font: { name: TNR, size: 12 } };
  return { ...base, border: { ...base.border, ...(col === L ? { left: 'medium' } : { right: 'medium' }) } };
}

class Sheet {
  constructor(readonly s: XlsxSheet) {}

  put(col: number, row: number, v: CellValue, style?: CellStyle): void {
    this.s.set({ col, row }, v, framed(col, style));
  }

  /** Rango combinado con su estilo en todas las celdas (bordes completos) y el valor arriba a la izquierda. */
  box(c0: number, r0: number, c1: number, r1: number, v: CellValue, style: CellStyle): void {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.s.set({ col: c, row: r }, r === r0 && c === c0 ? v : null, framed(c, style));
    if (c1 > c0 || r1 > r0) this.s.merge(`${ref(c0, r0)}:${ref(c1, r1)}`);
  }

  /** Fila con solo el marco (para que el borde exterior no se corte). */
  frame(row: number): void {
    this.s.set({ col: L, row }, null, framed(L, undefined));
    this.s.set({ col: R, row }, null, framed(R, undefined));
  }
}

const COL = (letter: string) => letter.charCodeAt(0) - 65;
const ref = (col: number, row: number) => `${String.fromCharCode(65 + col)}${row + 1}`;

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

/** Periodo de los cortes del reporte ("DEL 2026-09-01 AL 2026-10-03"). */
export function memoriaPeriod(blocks: readonly ReportCutBlock[]): string {
  const dates = blocks.map((b) => b.cut.date).sort();
  if (!dates.length) return '';
  return dates[0] === dates[dates.length - 1] ? dates[0] : `DEL ${dates[0]} AL ${dates[dates.length - 1]}`;
}

export function buildMemoria(input: MemoriaInput): XlsxWorkbook {
  const wb = new XlsxWorkbook();
  const xs = wb.addSheet('Memoria de cantidades');
  const sh = new Sheet(xs);
  for (const [k, w] of Object.entries(COLS)) xs.setColWidth(k, w);
  const h = input.header;

  // --- Encabezado (filas 2 a 13 de la plantilla) ---
  xs.setRowHeight(1, 87.75);
  sh.box(L, 1, COL('D'), 1, `${input.project}\n${input.space}`, { font: { name: TNR, size: 12, bold: true }, border: { top: 'medium', bottom: 'medium' }, align: { h: 'center', v: 'center', wrap: true } });
  sh.box(COL('E'), 1, COL('R'), 1, 'MEMORIA DE CÁLCULO DE CANTIDADES DE OBRA', { font: { name: TNR, size: 16, bold: true }, border: { left: 'medium', right: 'medium', top: 'medium', bottom: 'medium' }, align: { h: 'center', v: 'center', wrap: true } });
  sh.put(R, 1, h.codigoFormato, { font: { name: TNR, size: 12, bold: true }, border: { left: 'medium', top: 'medium', bottom: 'medium' }, align: { h: 'left', v: 'center', wrap: true } });
  for (let r = 2; r <= 13; r++) sh.frame(r);
  const field = (lr: string, lc0: string, lc1: string, text: string, vc0: string, vc1: string, val: string) => {
    const row = Number(lr) - 1;
    if (lc1 !== lc0) sh.box(COL(lc0), row, COL(lc1), row, text, label);
    // Un rótulo de una sola celda desborda hacia la izquierda, sin partirse (como en la plantilla).
    else sh.put(COL(lc0), row, text, { ...label, align: { h: 'right', v: 'center' } });
    if (vc1 !== vc0) sh.box(COL(vc0), row, COL(vc1), row, val, value);
    else sh.put(COL(vc0), row, val, value);
  };
  field('4', 'B', 'D', 'CONTRATO No.', 'E', 'G', h.contrato);
  field('4', 'H', 'H', 'ACTA PARCIAL No.', 'I', 'I', h.actaParcial);
  field('4', 'K', 'L', 'PERIODO DE FACTURACIÓN', 'M', 'O', memoriaPeriod(input.blocks));
  xs.setRowHeight(6, 30);
  sh.box(L, 5, COL('D'), 5, 'OBJETO:', label);
  sh.box(COL('E'), 5, COL('R'), 6, h.objeto, { font: { name: TNR, size: 12 }, border: thinBox, align: { h: 'left', v: 'top', wrap: true } });
  field('9', 'B', 'D', 'CONTRATISTA', 'E', 'H', h.contratista);
  sh.box(COL('J'), 8, COL('N'), 8, h.interventoria, value);
  field('10', 'B', 'D', 'DIRECTOR DE OBRA', 'E', 'G', h.directorObra);
  field('10', 'I', 'I', 'DIRECTOR INTERVENTORÍA', 'J', 'L', h.directorInterventoria);
  field('11', 'B', 'D', 'MATRÍCULA PROFESIONAL', 'E', 'F', h.matriculaDirectorObra);
  field('11', 'I', 'I', 'MATRÍCULA PROFESIONAL', 'J', 'K', h.matriculaDirectorInterventoria);
  field('12', 'B', 'D', 'RESIDENTE DE OBRA', 'E', 'G', h.residenteObra);
  field('12', 'I', 'I', 'RESIDENTE INTERVENTORÍA', 'J', 'L', h.residenteInterventoria);
  field('13', 'B', 'D', 'MATRÍCULA PROFESIONAL', 'E', 'F', h.matriculaResidenteObra);
  field('13', 'I', 'I', 'MATRÍCULA PROFESIONAL', 'J', 'K', h.matriculaResidenteInterventoria);
  for (const r of [3, 5, 6, 7, 8, 9, 10, 11, 12]) xs.setRowHeight(r, r === 6 ? 30 : r >= 8 ? 26.25 : 15.75);

  // --- Bloques por actividad ---
  const blocks = input.blocks;
  const order = new Map(input.activities.map((a, i) => [a.id, i]));
  const actIds = [...new Set(blocks.flatMap((b) => b.parts.map((p) => p.activityId)))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  let r = 14;
  for (const actId of actIds) {
    const act = input.activities.find((a) => a.id === actId);
    const item = input.items.get(actId) ?? { code: '', description: act?.name ?? 'Actividad', unit: 'M2' };
    r = writeActivity(sh, xs, r, actId, item, blocks, input);
  }
  if (!actIds.length) {
    sh.frame(r);
    sh.box(COL('C'), r, COL('R'), r + 1, 'Sin avance en los cortes y actividades elegidos.', { font: { name: TNR, size: 12, italic: true }, align: { h: 'center', v: 'center' } });
    sh.frame(r + 1);
    r += 3;
  }

  // --- Firmas (como las filas 65 a 68 de la plantilla) ---
  sh.frame(r);
  sh.frame(r + 1);
  r += 2;
  const bold: CellStyle = { font: { name: TNR, size: 12, bold: true }, align: { h: 'left', v: 'center' } };
  const sign: CellStyle = { ...bold, border: { bottom: 'thin' } };
  for (const k of [0, 1, 2]) sh.frame(r + k);
  sh.box(L, r, COL('E'), r, 'FIRMA ', sign);
  sh.box(COL('H'), r, COL('K'), r, 'FIRMA ', sign);
  sh.put(L, r + 1, `CONTRATISTA: ${h.residenteObra || h.contratista}`, bold);
  sh.put(COL('H'), r + 1, `INTERVENTOR: ${h.residenteInterventoria || h.interventoria}`, bold);
  sh.box(L, r + 2, COL('D'), r + 2, 'RESIDENTE DE OBRA', bold);
  sh.box(COL('H'), r + 2, COL('K'), r + 2, 'DIRECTOR DE INTERVENTORÍA', bold);
  // Cierre del marco: borde grueso abajo de B a S.
  for (let c = L; c <= R; c++) sh.put(c, r + 3, null, { border: { bottom: 'medium' } });
  return wb;
}

/** Fila de medidas: N ancho, O alto, P largo, Q número, R parcial, S total (fórmulas con su valor). */
function writePart(sh: Sheet, row: number, p: ReportPart): void {
  const n = row + 1;
  sh.put(COL('M'), row, p.support, boxBold);
  if (p.plane === 'floor') {
    sh.put(COL('N'), row, round2(p.height), num);
    sh.put(COL('O'), row, null, num);
  } else {
    sh.put(COL('N'), row, null, num);
    sh.put(COL('O'), row, round2(p.height), num);
  }
  sh.put(COL('P'), row, round2(p.length), num);
  sh.put(COL('Q'), row, 1, num);
  sh.put(COL('R'), row, { formula: p.plane === 'floor' ? `P${n}*N${n}` : `P${n}*O${n}`, value: round2(p.length) * round2(p.height) }, num);
  sh.put(COL('S'), row, { formula: `Q${n}*R${n}`, value: round2(p.length) * round2(p.height) }, num);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Alto (pt) de una banda de imágenes. */
const BAND_PT = 190;

function writeActivity(
  sh: Sheet,
  xs: XlsxSheet,
  start: number,
  actId: string,
  item: MemoriaItem,
  blocks: readonly ReportCutBlock[],
  input: MemoriaInput,
): number {
  let r = start;
  // Ítem.
  sh.frame(r);
  sh.box(COL('C'), r, COL('D'), r, 'CAPÍTULO / ÍTEM', boxBold);
  sh.box(COL('G'), r, COL('H'), r, 'ÍTEM / DESCRIPCIÓN', boxBold);
  sh.box(COL('J'), r, COL('L'), r, 'UNIDAD', boxBold);
  sh.box(COL('N'), r, COL('P'), r, 'FORMA DE PAGO', boxBold);
  xs.setRowHeight(r + 1, 60);
  sh.frame(r + 1);
  sh.box(COL('C'), r + 1, COL('D'), r + 1, item.code, boxText);
  sh.box(COL('G'), r + 1, COL('H'), r + 1, item.description, { ...boxText, align: { h: 'center', v: 'top', wrap: true } });
  sh.box(COL('J'), r + 1, COL('L'), r + 1, item.unit, boxText);
  sh.box(COL('N'), r + 1, COL('P'), r + 1, item.unit, boxText);
  sh.frame(r + 2);
  r += 3;

  // Encabezado de la tabla.
  xs.setRowHeight(r, 23.25);
  xs.setRowHeight(r + 1, 26.25);
  sh.box(L, r, COL('L'), r + 1, 'ESQUEMA DE UBICACIÓN EN PLANOS Y REGISTRO FOTOGRÁFICO', head);
  sh.box(COL('M'), r, COL('M'), r + 1, 'LOCALIZACIÓN', head);
  sh.box(COL('N'), r, COL('P'), r, 'DIMENSIONES', head);
  sh.put(COL('N'), r + 1, 'ANCHO', head);
  sh.put(COL('O'), r + 1, 'ALTO', head);
  sh.put(COL('P'), r + 1, 'LONGITUD', head);
  sh.box(COL('Q'), r, COL('Q'), r + 1, 'No. ELEMENTOS', head);
  sh.box(COL('R'), r, COL('R'), r + 1, 'CANTIDAD PARCIAL', head);
  sh.box(R, r, R, r + 1, 'CANTIDAD TOTAL', head);
  r += 2;
  const bodyStart = r;

  for (const b of blocks) {
    const parts = b.parts.filter((p) => p.activityId === actId);
    const images = input.images(b.cut.id, actId);
    if (!parts.length && !images.length) continue;
    // Título del corte.
    xs.setRowHeight(r, 23.25);
    sh.box(COL('M'), r, R, r, `CORTE ${b.cut.label ? `${b.cut.label} · ` : ''}${b.cut.date}`.toUpperCase(), head);
    r++;
    for (const p of parts) {
      xs.setRowHeight(r, 26.25);
      writePart(sh, r, p);
      r++;
    }
    // Dibujos y fotos: dos por banda, B–F y G–L; sus pies en M–S.
    for (let k = 0; k < images.length; k += 2) {
      xs.setRowHeight(r, BAND_PT);
      const pair = images.slice(k, k + 2);
      const bandPx = xs.rowPx(r);
      const leftW = [1, 2, 3, 4, 5].reduce((a, c) => a + xs.colPx(c), 0);
      const rightW = [6, 7, 8, 9, 10, 11].reduce((a, c) => a + xs.colPx(c), 0);
      pair.forEach((img, i) => {
        const boxW = (i === 0 ? leftW : rightW) - 16;
        const boxH = bandPx - 16;
        const s = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * s;
        const hgt = img.height * s;
        xs.addImage({
          col: i === 0 ? 1 : 6,
          row: r,
          dx: 8 + (boxW - w) / 2,
          dy: 8 + (boxH - hgt) / 2,
          width: w,
          height: hgt,
          data: img.data,
          format: img.format,
          name: img.caption.slice(0, 60),
        });
      });
      sh.box(COL('M'), r, R, r, pair.map((p, i) => `${i === 0 ? 'Izq.' : 'Der.'}: ${p.caption}`).join('\n'), caption);
      r++;
    }
  }
  const bodyEnd = Math.max(bodyStart, r - 1);
  if (r === bodyStart) r++;
  // El esquema (B–L) es un solo recuadro, como en la plantilla; las imágenes flotan sobre él.
  sh.box(L, bodyStart, COL('L'), bodyEnd, '', { border: thinBox });

  // Observaciones y total.
  sh.box(L, r, COL('L'), r + 2, 'OBSERVACIONES:', { font: { name: TNR, size: 14, bold: true }, border: thinBox, align: { h: 'left', v: 'top', wrap: true } });
  for (let k = 0; k < 2; k++) sh.box(COL('M'), r + k, R, r + k, '', boxText);
  sh.box(COL('M'), r + 2, COL('R'), r + 2, 'TOTAL', { ...boxBold, align: { h: 'right', v: 'center' } });
  const total = blocks.flatMap((b) => b.parts.filter((p) => p.activityId === actId)).reduce((a, p) => a + round2(p.length) * round2(p.height), 0);
  sh.put(R, r + 2, { formula: `SUM(S${bodyStart + 1}:S${bodyEnd + 1})`, value: Math.round(total * 100) / 100 }, numBold);
  sh.frame(r + 3);
  return r + 4;
}
