// Regresiones de la prueba en el teléfono (2026-10-05).
import { bearingOf, clipToConvex } from '../../src/application/geo/surveyTools';
import { localStamp } from '../../src/domain/review/review';
import { faceSvg } from '../../src/application/report/planSvg';
import { reviewHtml } from '../../src/application/review/reviewReport';
import type { ReviewItem } from '../../src/domain/review/review';

describe('QA en teléfono — regresiones', () => {
  it('el rumbo de un azimut redondo no muestra 60 minutos', () => {
    expect(bearingOf(120)).toBe("S 60°00' E");
    expect(bearingOf(29.9999)).toBe("N 30°00' E");
  });

  it('la cuadrícula se recorta a la vista girada', () => {
    const view = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
    expect(clipToConvex({ x: -5, y: 2 }, { x: 20, y: 2 }, view)).toEqual([{ x: 0, y: 2 }, { x: 10, y: 2 }]);
    expect(clipToConvex({ x: -5, y: 9 }, { x: 20, y: 9 }, view)).toBeNull();
    // Mismo resultado con el polígono recorrido al revés.
    expect(clipToConvex({ x: 5, y: -3 }, { x: 5, y: 9 }, [...view].reverse())).toEqual([{ x: 5, y: 0 }, { x: 5, y: 5 }]);
  });

  it('las fechas del acta son locales', () => {
    const d = new Date(2026, 9, 5, 18, 27);
    expect(localStamp(d.toISOString())).toBe('2026-10-05 18:27');
    expect(localStamp(undefined)).toBe('');
  });

  it('el alzado del reporte lleva las celdas pintadas (y en espejo en el lado B)', () => {
    const face = { outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2.5 }, { x: 0, y: 2.5 }], holes: [] };
    const layers = [{ color: '#1E88E5', opacity: 1, runs: [{ x: 0, y: 0, w: 1, h: 0.05 }] }];
    expect(faceSvg(face, false, [], layers)).toContain('<rect x="0" y="-0.05"');
    expect(faceSvg(face, true, [], layers)).toContain('<rect x="3" y="-0.05"');
  });

  it('el acta incrusta la foto de la observación', () => {
    const item: ReviewItem = {
      id: 'i1',
      spaceId: 'S',
      number: 1,
      view: { kind: 'plan' },
      markup: { kind: 'arrow', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      color: '#E53935',
      comment: 'Fisura',
      author: 'Jose',
      createdAt: new Date().toISOString(),
      status: 'open',
      photoId: 'p1',
    };
    const meta = { project: 'P', space: 'E', reviewer: 'Jose', generatedAt: new Date() };
    const h = reviewHtml(meta, [item], [], () => 'Planta', new Map([['p1', 'data:image/jpeg;base64,AAAA']]));
    expect(h).toContain('<img class="photo" src="data:image/jpeg;base64,AAAA"/>');
    expect(reviewHtml(meta, [item], [], () => 'Planta')).toContain('Con foto');
  });
});
