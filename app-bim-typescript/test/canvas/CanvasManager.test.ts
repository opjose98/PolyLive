// =============================================================================
// CanvasManager.test.ts — Transformaciones de coordenadas
// =============================================================================

import { CanvasManager } from '../../src/application/canvas/CanvasManager';
import { canvasPoint } from '../../src/application/canvas/types';
import { degrees } from '../../src/domain/geometry/types';

describe('CanvasManager', () => {
  // -------------------------------------------------------------------------
  // worldToScreen
  // -------------------------------------------------------------------------

  test('worldToScreen: (0,0) world → offset position on screen', () => {
    const cm = new CanvasManager({ scale: 100, offsetX: 200, offsetY: 300 });
    const result = cm.worldToScreen({ x: 0, y: 0 });

    expect(result.x).toBeCloseTo(200);
    expect(result.y).toBeCloseTo(300);
  });

  // -------------------------------------------------------------------------
  // screenToWorld
  // -------------------------------------------------------------------------

  test('screenToWorld: offset position → (0,0) world', () => {
    const cm = new CanvasManager({ scale: 100, offsetX: 200, offsetY: 300 });
    const result = cm.screenToWorld(canvasPoint(200, 300));

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  // -------------------------------------------------------------------------
  // Round-trip
  // -------------------------------------------------------------------------

  test('worldToScreen → screenToWorld round-trip preserves coordinates', () => {
    const cm = new CanvasManager({ scale: 75, offsetX: 150, offsetY: 250 });
    const original = { x: 3.5, y: -2.1 };

    const screen = cm.worldToScreen(original);
    const back = cm.screenToWorld(screen);

    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });

  // -------------------------------------------------------------------------
  // Pan
  // -------------------------------------------------------------------------

  test('pan: offsetX/offsetY shifts screen coordinates', () => {
    const cm = new CanvasManager({ scale: 100, offsetX: 0, offsetY: 0 });
    const noOffset = cm.worldToScreen({ x: 1, y: 1 });

    cm.setTransform({ scale: 100, offsetX: 50, offsetY: -30 });
    const withOffset = cm.worldToScreen({ x: 1, y: 1 });

    expect(withOffset.x).toBeCloseTo(noOffset.x + 50);
    expect(withOffset.y).toBeCloseTo(noOffset.y - 30);
  });

  // -------------------------------------------------------------------------
  // Zoom
  // -------------------------------------------------------------------------

  test('zoom: scale affects world-to-screen distance', () => {
    const cm1 = new CanvasManager({ scale: 50, offsetX: 0, offsetY: 0 });
    const cm2 = new CanvasManager({ scale: 200, offsetX: 0, offsetY: 0 });

    const p1 = cm1.worldToScreen({ x: 1, y: 0 });
    const p2 = cm2.worldToScreen({ x: 1, y: 0 });

    // 200/50 = 4x farther from origin on screen
    expect(p2.x).toBeCloseTo(p1.x * 4);
  });

  // -------------------------------------------------------------------------
  // Rotate2D
  // -------------------------------------------------------------------------

  test('rotate2D: 90° rotation around origin', () => {
    const cm = new CanvasManager();
    const result = cm.rotate2D({ x: 1, y: 0 }, { x: 0, y: 0 }, degrees(90));

    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  test('rotate2D: rotation around arbitrary center', () => {
    const cm = new CanvasManager();
    // Rotating (2, 0) around (1, 0) by 180° → (0, 0)
    const result = cm.rotate2D({ x: 2, y: 0 }, { x: 1, y: 0 }, degrees(180));

    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  // -------------------------------------------------------------------------
  // validateCanvasPoint
  // -------------------------------------------------------------------------

  test('validateCanvasPoint: valid point within viewport', () => {
    const cm = new CanvasManager();
    expect(cm.validateCanvasPoint(canvasPoint(100, 200), 400, 800)).toBe(true);
  });

  test('validateCanvasPoint: point outside viewport', () => {
    const cm = new CanvasManager();
    expect(cm.validateCanvasPoint(canvasPoint(500, 200), 400, 800)).toBe(false);
  });

  test('validateCanvasPoint: NaN/Infinity rejected', () => {
    const cm = new CanvasManager();
    expect(cm.validateCanvasPoint(canvasPoint(NaN, 100))).toBe(false);
    expect(cm.validateCanvasPoint(canvasPoint(100, Infinity))).toBe(false);
  });
});
