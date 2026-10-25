// =============================================================================
// memoria.test.ts — Memoria de cantidades en Excel (H-90)
// =============================================================================
//
// Con EXPORT_SAMPLES=<carpeta> escribe sample-memoria.xlsx para validarlo con
// openpyxl (scripts/validate_exports.py), como los IFC y DXF de muestra.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { XlsxWorkbook, colName, parseRef } from '../../src/infrastructure/export/xlsx/xlsxWriter';
import { EMPTY_MEMORIA_HEADER, buildMemoria, memoriaPeriod } from '../../src/application/progress/progressMemoria';
import { buildReport, ReportSource } from '../../src/application/progress/progressReport';
import type { Activity, ProgressCut, QuantityPart, QuantityRow } from '../../src/domain/progress/progress';

// PNG de 1×1 (blanco).
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));

describe('xlsxWriter', () => {
  it('columnas y referencias', () => {
    expect(colName(0)).toBe('A');
    expect(colName(18)).toBe('S');
    expect(colName(26)).toBe('AA');
    expect(parseRef('S62')).toEqual({ col: 18, row: 61 });
  });

  it('un libro con estilos deduplicados, celdas combinadas, fórmulas e imagen', () => {
    const wb = new XlsxWorkbook();
    const s = wb.addSheet('Hoja');
    const st = { font: { name: 'Times New Roman', size: 12, bold: true }, fill: 'D8D8D8' };
    s.set('B2', 'Título <&>', st);
    s.set('C2', 'Otro', st);
    s.set('B3', 2.5);
    s.set('C3', { formula: 'B3*2', value: 5 });
    s.merge('B2:D2', st);
    s.setColWidth('B', 7.63);
    s.setRowHeight(1, 87.75);
    s.addImage({ col: 1, row: 4, width: 100, height: 50, data: PNG, format: 'png' });
    const files = unzipSync(wb.toBytes());
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/drawings/_rels/drawing1.xml.rels',
        'xl/drawings/drawing1.xml',
        'xl/media/image1.png',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/_rels/sheet1.xml.rels',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    );
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('Título &lt;&amp;&gt;');
    expect(sheet).toContain('<f>B3*2</f><v>5</v>');
    expect(sheet).toContain('<mergeCell ref="B2:D2"/>');
    expect(sheet).toContain('<row r="2" ht="87.75" customHeight="1">');
    // B2, C2 y D2 comparten el mismo estilo (uno solo en el registro).
    const ids = [...sheet.matchAll(/r="[BCD]2" s="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(1);
    expect(strFromU8(files['xl/styles.xml'])).toContain('<fgColor rgb="FFD8D8D8"/>');
  });
});

describe('memoria de cantidades', () => {
  const activities: Activity[] = [
    { id: 'mamp', projectId: 'P', name: 'Mampostería', color: '#B5651D', unit: 'm²', order: 0 },
    { id: 'pint', projectId: 'P', name: 'Pintura', color: '#1E88E5', unit: 'm²', order: 1 },
  ];
  const cuts: ProgressCut[] = [
    { id: 'c1', projectId: 'P', date: '2026-09-01', label: 'Acta 1', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'c2', projectId: 'P', date: '2026-10-03', label: 'Acta 2', createdAt: '2026-10-03T00:00:00Z' },
  ];
  const parts: Record<string, QuantityPart[]> = {
    c1: [{ targetKey: 'wall:w1:A', activityId: 'mamp', cutId: 'c1', x: 0, y: 0, w: 4, h: 2.5 }],
    c2: [
      { targetKey: 'wall:w1:A', activityId: 'pint', cutId: 'c2', x: 0, y: 0, w: 2, h: 2.5 },
      { targetKey: 'floor:z1', activityId: 'mamp', cutId: 'c2', x: 0, y: 0, w: 3, h: 1.5 },
    ],
  };
  const q = (cutId: string): QuantityRow[] =>
    parts[cutId].map((p) => ({ targetKey: p.targetKey, activityId: p.activityId, inCut: p.w * p.h, cumulative: p.w * p.h, supportArea: 12 }));
  const src: ReportSource = {
    cuts,
    activities,
    supportKeys: ['wall:w1:A', 'wall:w1:B', 'floor:z1'],
    supportArea: () => 12,
    supportLabel: (k) => ({ 'wall:w1:A': 'Muro 1 · cara A', 'wall:w1:B': 'Muro 1 · cara B', 'floor:z1': 'R-01 Aula · suelo' })[k] ?? k,
    quantities: q,
    parts: (c) => parts[c],
    photos: [
      { id: 'f1', code: 'FOT001', takenAt: new Date('2026-10-03T10:00:00Z'), cutId: 'c2', targetKey: 'wall:w1:A', activityId: 'pint' },
      { id: 'f2', code: 'FOT002', takenAt: new Date('2026-10-03T11:00:00Z'), cutId: 'c2' },
    ],
  };

  it('el reporte filtra por cortes, alcance y actividades, y lista lo que no tiene avance', () => {
    const all = buildReport(src, { cutIds: ['c2', 'c1'], activityIds: null, scopeKeys: null, scopeTitle: 'Todo', includeEmpty: true, includePhotos: true, includeDrawings: false });
    expect(all.map((b) => b.cut.id)).toEqual(['c1', 'c2']);
    expect(all[1].empty.map((e) => e.support)).toEqual(['Muro 1 · cara B']);
    expect(all[1].photos.map((p) => p.code)).toEqual(['FOT001', 'FOT002']);
    expect(memoriaPeriod(all)).toBe('DEL 2026-09-01 AL 2026-10-03');

    const wall = buildReport(src, { cutIds: ['c2'], activityIds: ['pint'], scopeKeys: ['wall:w1:A'], scopeTitle: 'Muro 1 · cara A', includeEmpty: true, includePhotos: true, includeDrawings: false });
    expect(wall[0].parts.map((p) => [p.activity, p.length, p.height])).toEqual([['Pintura', 2, 2.5]]);
    // Una foto libre no entra en el reporte de un elemento.
    expect(wall[0].photos.map((p) => p.code)).toEqual(['FOT001']);
    expect(wall[0].empty).toEqual([]);
  });

  it('una hoja vertical: encabezado, un bloque por actividad con título por corte, medidas, fotos y total', () => {
    const blocks = buildReport(src, { cutIds: ['c1', 'c2'], activityIds: null, scopeKeys: null, scopeTitle: 'Todo', includeEmpty: false, includePhotos: true, includeDrawings: true });
    const wb = buildMemoria({
      header: { ...EMPTY_MEMORIA_HEADER, contrato: 'No 000-2026', objeto: 'Mejoramiento de la sede' },
      project: 'NARG29 BRIS',
      space: 'B1 Primer piso',
      activities,
      blocks,
      items: new Map([['mamp', { code: '8.1.3.10', description: 'MAMPOSTERÍA EN BLOQUE', unit: 'M2' }]]),
      images: (cutId, actId) => (cutId === 'c2' && actId === 'pint' ? [{ data: PNG, format: 'png', width: 800, height: 400, caption: 'Muro 1 · cara A' }] : []),
    });
    const bytes = wb.toBytes();
    const files = unzipSync(bytes);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('MEMORIA DE CÁLCULO DE CANTIDADES DE OBRA');
    expect(sheet).toContain('No 000-2026');
    expect(sheet).toContain('8.1.3.10');
    expect(sheet).toContain('CORTE ACTA 1 · 2026-09-01');
    expect(sheet).toContain('CORTE ACTA 2 · 2026-10-03');
    expect(sheet).toContain('ESQUEMA DE UBICACIÓN EN PLANOS Y REGISTRO FOTOGRÁFICO');
    // Mampostería: 4 × 2,5 (corte 1) + 3 × 1,5 (corte 2) = 14,5 m².
    expect(sheet).toMatch(/<f>SUM\(S\d+:S\d+\)<\/f><v>14\.5<\/v>/);
    expect(files['xl/media/image1.png']).toBeDefined();
    const out = process.env.EXPORT_SAMPLES;
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'sample-memoria.xlsx'), bytes);
    }
  });
});
