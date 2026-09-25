// =============================================================================
// MiterHandler.test.ts — Encuentros limpios
// =============================================================================

import { MiterHandler } from '../../src/application/canvas/MiterHandler';
import { Wall, meters, degrees } from '../../src/domain/geometry/types';

describe('MiterHandler', () => {
  let handler: MiterHandler;

  beforeEach(() => {
    handler = new MiterHandler();
  });

  // -------------------------------------------------------------------------
  // calculateMiterPoint
  // -------------------------------------------------------------------------

  test('calculateMiterPoint: horizontal + vertical → exact intersection', () => {
    const horizontal: Wall = {
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 5, y: 0 },
      thickness: meters(0.15),
      length: meters(5),
    };

    const vertical: Wall = {
      startPoint: { x: 5, y: 0 },
      endPoint: { x: 5, y: 4 },
      thickness: meters(0.15),
      length: meters(4),
    };

    const meetPoint = handler.calculateMiterPoint(horizontal, vertical);

    expect(meetPoint.x).toBeCloseTo(5, 5);
    expect(meetPoint.y).toBeCloseTo(0, 5);
  });

  test('calculateMiterPoint: 45° angle walls → correct intersection', () => {
    const wall1: Wall = {
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 3, y: 0 },
      thickness: meters(0.15),
      length: meters(3),
    };

    const wall2: Wall = {
      startPoint: { x: 3, y: 0 },
      endPoint: { x: 6, y: 3 },
      thickness: meters(0.15),
      length: meters(Math.sqrt(18)),
    };

    const meetPoint = handler.calculateMiterPoint(wall1, wall2);

    expect(meetPoint.x).toBeCloseTo(3, 5);
    expect(meetPoint.y).toBeCloseTo(0, 5);
  });

  // -------------------------------------------------------------------------
  // validateMiterAngle
  // -------------------------------------------------------------------------

  test('validateMiterAngle(5°) → invalid (below 10° threshold)', () => {
    const result = handler.validateMiterAngle(degrees(5));

    expect(result.isValid).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('acute_angle');
  });

  test('validateMiterAngle(45°) → valid', () => {
    const result = handler.validateMiterAngle(degrees(45));

    expect(result.isValid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  test('validateMiterAngle(10°) → valid (exactly at threshold)', () => {
    const result = handler.validateMiterAngle(degrees(10));

    expect(result.isValid).toBe(true);
  });

  test('validateMiterAngle(9.9°) → invalid (just below threshold)', () => {
    const result = handler.validateMiterAngle(degrees(9.9));

    expect(result.isValid).toBe(false);
  });
});
