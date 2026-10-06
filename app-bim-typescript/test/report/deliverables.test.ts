import { areaScheduleCsv, areaTotals, photoRegisterHtml, planSheetHtml } from '../../src/application/report/deliverables';
import { planSvg, scaleBarLength } from '../../src/application/report/planSvg';

const meta = { project: 'Edificio <Ñuñoa>', projectCode: 'BIM001', space: 'Planta 1', level: 'Nivel 0', operator: 'Jose', generatedAt: new Date(2026, 9, 6, 18, 0) };
const rows = [
  { code: 'R-01', name: 'Sala', use: 'Sala', level: 'Nivel 0', netArea: 12.345, perimeter: 14.2, axisArea: 14 },
  { code: 'R-02', name: 'Baño; social', use: 'Baño', level: 'Nivel 0', netArea: 3.2, perimeter: 7.4, axisArea: 4 },
];

describe('Entregables', () => {
  it('cuadro de áreas: totales y CSV con decimales con coma y campos con ; entre comillas', () => {
    expect(areaTotals(rows).netArea).toBeCloseTo(15.545);
    const csv = areaScheduleCsv(meta, rows);
    expect(csv).toContain('R-01;Sala;Sala;Nivel 0;12,35;14,20;14,00');
    expect(csv).toContain('"Baño; social"');
    expect(csv).toContain('Total;;;;15,55;;18,00');
  });

  it('plano: rótulo, escala gráfica en el SVG, cuadro de áreas y texto escapado', () => {
    const svg = planSvg({ walls: [{ start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, thickness: 0.2 }], scaleBar: true });
    expect(svg).toContain(`${scaleBarLength(8)} m`);
    const html = planSheetHtml(meta, svg, rows);
    expect(html).toContain('Cuadro de áreas');
    expect(html).toContain('Edificio &lt;Ñuñoa&gt;');
    expect(html).toContain('Levantó');
  });

  it('escala gráfica redonda (~1/5 del ancho)', () => {
    expect(scaleBarLength(4)).toBe(1);
    expect(scaleBarLength(9)).toBe(2);
    expect(scaleBarLength(40)).toBe(10);
  });

  it('registro fotográfico: una tarjeta por foto, con imagen o aviso', () => {
    const html = photoRegisterHtml(meta, [
      { code: 'FOT001', takenAt: new Date(2026, 9, 6), author: 'Jose', where: 'Planta (1,20; 3,40) m', notes: 'Fisura', dataUri: 'data:image/jpeg;base64,AAA' },
      { code: 'FOT002', takenAt: new Date(2026, 9, 6), author: 'Jose', where: 'Alzado lado A', notes: '', dataUri: null },
    ]);
    expect(html.match(/class="ph"/g)).toHaveLength(2);
    expect(html).toContain('data:image/jpeg;base64,AAA');
    expect(html).toContain('Imagen no disponible');
    expect(html).toContain('2 fotos');
  });
});
