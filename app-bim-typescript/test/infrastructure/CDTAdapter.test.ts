// =============================================================================
// CDTAdapter.test.ts — Adapta domain/geometry/CDT al contrato ICDT
// =============================================================================

import { CDTAdapter } from '../../src/infrastructure/geometry/CDTAdapter';

describe('CDTAdapter', () => {
  it('triangula un cuadrado simple y retorna área positiva', async () => {
    const adapter = new CDTAdapter();
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];

    const result = await adapter.triangulate(square);

    expect(result.valid).toBe(true);
    expect(result.totalArea).toBeCloseTo(16, 3);
    expect(result.triangles.length).toBeGreaterThan(0);
  });

  it('resta el área de un hueco (columna) del área total', async () => {
    const adapter = new CDTAdapter();
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hole = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
    ];

    const withoutHole = await adapter.triangulate(square);
    const withHole = await adapter.triangulate(square, [hole]);

    expect(withHole.totalArea).toBeLessThan(withoutHole.totalArea);
  });

  it('reporta valid:false para un polígono con menos de 3 vértices', async () => {
    const adapter = new CDTAdapter();
    const result = await adapter.triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(result.valid).toBe(false);
  });
});
