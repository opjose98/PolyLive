// =============================================================================
// SnapHandler.test.ts — Snap Angular
// =============================================================================

import { SnapHandler } from '../../src/application/canvas/SnapHandler';
import { degrees } from '../../src/domain/geometry/types';

describe('SnapHandler', () => {
  let handler: SnapHandler;

  beforeEach(() => {
    handler = new SnapHandler(true, degrees(5));
  });

  // -------------------------------------------------------------------------
  // snapAngle
  // -------------------------------------------------------------------------

  test('snapAngle(89°, 5°) → 90°', () => {
    const result = handler.snapAngle(degrees(89));
    expect(result as number).toBeCloseTo(90);
  });

  test('snapAngle(46°, 5°) → 45°', () => {
    const result = handler.snapAngle(degrees(46));
    expect(result as number).toBeCloseTo(45);
  });

  test('snapAngle(44°, 5°) → 45°', () => {
    const result = handler.snapAngle(degrees(44));
    expect(result as number).toBeCloseTo(45);
  });

  test('snapAngle(50°, 5°) → 50° (no snap, outside tolerance)', () => {
    const result = handler.snapAngle(degrees(50));
    expect(result as number).toBeCloseTo(50);
  });

  test('snapAngle disabled → returns original', () => {
    handler.setEnabled(false);
    const result = handler.snapAngle(degrees(89));
    expect(result as number).toBeCloseTo(89);
  });

  // -------------------------------------------------------------------------
  // snapPoint
  // -------------------------------------------------------------------------

  test('snapPoint: snaps to horizontal line (0°)', () => {
    const ref = { x: 0, y: 0 };
    const point = { x: 10, y: 0.5 }; // almost horizontal, angle ≈ 2.86°
    const snapped = handler.snapPoint(point, ref);

    // Should snap to 0° → y should be 0
    expect(snapped.y).toBeCloseTo(0, 5);
    // Distance preserved
    const origDist = Math.sqrt(10 * 10 + 0.5 * 0.5);
    expect(snapped.x).toBeCloseTo(origDist, 5);
  });

  test('snapPoint disabled → returns original', () => {
    handler.setEnabled(false);
    const point = { x: 10, y: 0.5 };
    const ref = { x: 0, y: 0 };
    const result = handler.snapPoint(point, ref);

    expect(result.x).toBe(point.x);
    expect(result.y).toBe(point.y);
  });
});
