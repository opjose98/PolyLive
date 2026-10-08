// labelBackdrop.test.ts — el fondo de un rótulo contrasta con su texto (tema oscuro / claro)
import { labelBackdrop } from '../../src/ui/canvas/sketch';

describe('labelBackdrop', () => {
  test('texto claro (tema oscuro) → fondo oscuro', () => {
    expect(labelBackdrop('#E0E0E0')).toContain('18, 18, 18');
    expect(labelBackdrop('#FFB74D')).toContain('18, 18, 18');
  });
  test('texto oscuro (tema claro y alto contraste) → fondo blanco', () => {
    expect(labelBackdrop('#212121')).toContain('255, 255, 255');
    expect(labelBackdrop('#000000')).toContain('255, 255, 255');
  });
  test('un color que no es #RRGGBB cae al fondo blanco de siempre', () => {
    expect(labelBackdrop('rgba(0,0,0,0.5)')).toContain('255, 255, 255');
  });
});
