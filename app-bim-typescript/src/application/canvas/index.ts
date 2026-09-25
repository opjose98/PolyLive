// =============================================================================
// application/canvas/index.ts — Re-exports públicos del módulo Canvas
// =============================================================================

export { CanvasManager } from './CanvasManager';
export { SnapHandler, PREDEFINED_ANGLES } from './SnapHandler';
export { MiterHandler, ACUTE_ANGLE_THRESHOLD } from './MiterHandler';
export { SelectionService, touchToleranceMeters } from './SelectionService';
export type { Handle, HandleKind, HitTestInput } from './SelectionService';

export { canvasPoint, MIN_SCALE, MAX_SCALE, DEFAULT_SCALE } from './types';
export type { CanvasPoint } from './types';
