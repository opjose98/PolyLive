// layout.test.ts — Teléfono/tableta, vertical/horizontal
import { layoutClass, SHEET_MAX_WIDTH } from '../../src/ui/design/layout';

describe('layoutClass', () => {
  test('teléfono vertical: hoja a todo el ancho, 3 columnas', () => {
    const l = layoutClass(392, 850);
    expect(l).toMatchObject({ landscape: false, tablet: false, sheetWidth: 392, sheetMinRatio: 0, galleryColumns: 3 });
  });

  test('teléfono horizontal: hoja centrada y casi a todo el alto, más columnas', () => {
    const l = layoutClass(850, 392);
    expect(l.landscape).toBe(true);
    expect(l.tablet).toBe(false);
    expect(l.sheetWidth).toBe(SHEET_MAX_WIDTH);
    expect(l.sheetMinRatio).toBeGreaterThan(0.8);
    expect(l.galleryColumns).toBe(7);
  });

  test('tableta vertical: hoja limitada de ancho, alto normal', () => {
    const l = layoutClass(800, 1280);
    expect(l).toMatchObject({ landscape: false, tablet: true, sheetWidth: SHEET_MAX_WIDTH, sheetMinRatio: 0, galleryColumns: 6 });
  });

  test('las columnas de la galería quedan entre 3 y 8', () => {
    expect(layoutClass(300, 600).galleryColumns).toBe(3);
    expect(layoutClass(1920, 1200).galleryColumns).toBe(8);
  });
});
