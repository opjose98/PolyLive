import { reportRows, reportCsv, reportHtml, activityTotals } from '../../src/application/progress/progressReport';
import { planSvg } from '../../src/application/report/planSvg';
import type { Activity, QuantityRow, ProgressCut } from '../../src/domain/progress/progress';

const activities: Activity[] = [
  { id: 'a1', projectId: 'P', name: 'Pañete', color: '#8D8D8D', unit: 'm²', order: 0 },
  { id: 'a2', projectId: 'P', name: 'Pintura', color: '#1E88E5', unit: 'm²', order: 1 },
];
const q: QuantityRow[] = [
  { targetKey: 'wall:w1:A', activityId: 'a2', inCut: 3, cumulative: 5, supportArea: 10 },
  { targetKey: 'floor:z1', activityId: 'a1', inCut: 2, cumulative: 2, supportArea: 8 },
  { targetKey: 'wall:w1:B', activityId: 'a2', inCut: 1, cumulative: 1, supportArea: 10 },
];
const cut: ProgressCut = { id: 'c1', projectId: 'P', date: '2026-10-03', label: 'Acta 3', createdAt: '2026-10-03T00:00:00Z' };
const label = (k: string) => ({ 'wall:w1:A': 'Muro 1 · cara A', 'wall:w1:B': 'Muro 1 · cara B', 'floor:z1': 'R-01 Sala · suelo' })[k] ?? k;

describe('reporte de avance', () => {
  it('filas ordenadas por actividad y porcentaje acumulado', () => {
    const rows = reportRows(q, activities, label);
    expect(rows.map((r) => [r.activity, r.support])).toEqual([
      ['Pañete', 'R-01 Sala · suelo'],
      ['Pintura', 'Muro 1 · cara A'],
      ['Pintura', 'Muro 1 · cara B'],
    ]);
    expect(rows[1].percent).toBeCloseTo(50);
    expect(activityTotals(rows).find((t) => t.activity === 'Pintura')).toMatchObject({ inCut: 4, cumulative: 6 });
  });

  it('CSV con encabezado y una fila por soporte', () => {
    const csv = reportCsv({ project: 'Obra, Norte', space: 'Casa', cut, operator: 'Ana', generatedAt: new Date() }, reportRows(q, activities, label));
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('"Obra, Norte",Casa,Acta 3,2026-10-03,Pañete,R-01 Sala · suelo,2.00,2.00,8.00,25.0');
  });

  it('HTML incluye la planta, el resumen y escapa el texto', () => {
    const svg = planSvg({ walls: [{ start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.15 }] });
    const h = reportHtml({ project: 'A<B', space: 'Casa', cut, operator: 'Ana', generatedAt: new Date() }, reportRows(q, activities, label), svg);
    expect(h).toContain('<svg');
    expect(h).toContain('A&lt;B');
    expect(h).toContain('Resumen por actividad');
  });
});

describe('planSvg', () => {
  it('encuadra el dibujo y dibuja muros, recintos, capas y marcas', () => {
    const s = planSvg({
      walls: [{ start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.15 }],
      zones: [{ polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], label: 'R-01 <Sala>', at: { x: 2, y: 1 } }],
      layers: [{ color: '#1E88E5', opacity: 1, runs: [{ x: 0, y: 0, w: 1, h: 0.05 }] }],
      marks: [
        { kind: 'arrow', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, color: '#E53935' },
        { kind: 'pin', at: { x: 2, y: 2 }, label: '1', color: '#8E24AA' },
      ],
      margin: 1,
    });
    expect(s).toContain('viewBox="-1 -1 6 5"');
    expect(s).toContain('R-01 &lt;Sala&gt;');
    expect(s).toContain('<rect x="0" y="0" width="1" height="0.051"/>');
    expect(s).toContain('<circle');
  });
});
