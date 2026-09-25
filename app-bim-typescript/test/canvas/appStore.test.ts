// =============================================================================
// appStore.test.ts — Estado Zustand
// =============================================================================

import { createAppStore, AppStore } from '../../src/state/appStore';
import { degrees, meters } from '../../src/domain/geometry/types';
import { revitObjectId } from '../../src/domain/objects/base';

describe('appStore (Zustand)', () => {
  let store: AppStore;

  beforeEach(() => {
    store = createAppStore();
  });

  // -------------------------------------------------------------------------
  // Survey slice
  // -------------------------------------------------------------------------

  test('setRoom changes currentRoomId', () => {
    expect(store.getState().currentRoomId).toBeNull();

    store.getState().setRoom('room-001');
    expect(store.getState().currentRoomId).toBe('room-001');
  });

  test('setMode changes currentMode', () => {
    expect(store.getState().currentMode).toBe('draw');

    store.getState().setMode('move');
    expect(store.getState().currentMode).toBe('move');
  });

  test('setState changes currentState and resets mode to draw', () => {
    store.getState().setMode('measure');
    store.getState().setState('editing');

    expect(store.getState().currentState).toBe('editing');
    expect(store.getState().currentMode).toBe('draw'); // reset
  });

  test('setState to idle resets commandStackSize', () => {
    // Simulate some commands
    store.getState().setState('creating');
    // commandStackSize starts at 0, stays at 0 in creating
    store.getState().setState('idle');

    expect(store.getState().commandStackSize).toBe(0);
  });

  // -------------------------------------------------------------------------
  // UI slice
  // -------------------------------------------------------------------------

  test('updateCanvasTransform updates transform', () => {
    store.getState().updateCanvasTransform({ scale: 200, offsetX: 50 });

    const t = store.getState().canvasTransform;
    expect(t.scale).toBe(200);
    expect(t.offsetX).toBe(50);
    expect(t.offsetY).toBe(0); // unchanged
  });

  test('updateCanvasTransform clamps scale to [MIN, MAX]', () => {
    store.getState().updateCanvasTransform({ scale: 1 }); // below MIN_SCALE (5)
    expect(store.getState().canvasTransform.scale).toBe(5);

    store.getState().updateCanvasTransform({ scale: 9999 }); // above MAX_SCALE (500)
    expect(store.getState().canvasTransform.scale).toBe(500);
  });

  test('setSelectedObjectId sets and clears selection', () => {
    const id = revitObjectId('obj-123');
    store.getState().setSelectedObjectId(id);
    expect(store.getState().selectedObjectId).toBe(id);

    store.getState().setSelectedObjectId(null);
    expect(store.getState().selectedObjectId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Control points slice
  // -------------------------------------------------------------------------

  test('addControlPoint appends to array', () => {
    expect(store.getState().controlPoints).toHaveLength(0);

    store.getState().addControlPoint({
      id: 'cp-001',
      name: 'Esquina NE',
      localCoordinates: { x: meters(10), y: meters(20), z: meters(0) },
      capturedAt: new Date(),
    });

    expect(store.getState().controlPoints).toHaveLength(1);
    expect(store.getState().controlPoints[0].name).toBe('Esquina NE');
  });

  test('removeControlPoint removes by id', () => {
    store.getState().addControlPoint({
      id: 'cp-001',
      localCoordinates: { x: meters(0), y: meters(0), z: meters(0) },
      capturedAt: new Date(),
    });
    store.getState().addControlPoint({
      id: 'cp-002',
      localCoordinates: { x: meters(5), y: meters(5), z: meters(0) },
      capturedAt: new Date(),
    });

    store.getState().removeControlPoint('cp-001');
    expect(store.getState().controlPoints).toHaveLength(1);
    expect(store.getState().controlPoints[0].id).toBe('cp-002');
  });

  // -------------------------------------------------------------------------
  // Multiple actions in sequence
  // -------------------------------------------------------------------------

  test('multiple actions in sequence maintain consistency', () => {
    const s = store.getState();

    s.setRoom('room-A');
    s.setState('creating');
    s.setMode('draw');
    s.updateCanvasTransform({ scale: 150, offsetX: 100, offsetY: -50 });
    s.setSnapAngularEnabled(false);
    s.addControlPoint({
      id: 'cp-seq',
      localCoordinates: { x: meters(1), y: meters(2), z: meters(3) },
      capturedAt: new Date(),
    });

    const final = store.getState();
    expect(final.currentRoomId).toBe('room-A');
    expect(final.currentState).toBe('creating');
    expect(final.currentMode).toBe('draw');
    expect(final.canvasTransform.scale).toBe(150);
    expect(final.canvasTransform.offsetX).toBe(100);
    expect(final.snapAngularEnabled).toBe(false);
    expect(final.controlPoints).toHaveLength(1);
  });
});
