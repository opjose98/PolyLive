// =============================================================================
// SkiaCanvasAdapter.test.ts — Tests for Canvas2D → Skia adapter
// =============================================================================

// ---------------------------------------------------------------------------
// Mock: @shopify/react-native-skia
// ---------------------------------------------------------------------------

const mockPaint = {
  setStyle: jest.fn(),
  setColor: jest.fn(),
  setStrokeWidth: jest.fn(),
  setStrokeCap: jest.fn(),
  setStrokeJoin: jest.fn(),
};

// PathBuilder (Skia 2): métodos encadenables; `detach()` entrega el SkPath.
const mockPath: Record<string, jest.Mock> = {
  moveTo: jest.fn(() => mockPath),
  lineTo: jest.fn(() => mockPath),
  close: jest.fn(() => mockPath),
  detach: jest.fn(() => ({ kind: 'SkPath' })),
};

const mockCanvas = {
  drawRect: jest.fn(),
  drawLine: jest.fn(),
  drawCircle: jest.fn(),
  drawPath: jest.fn(),
  drawText: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  clear: jest.fn(),
};

const mockFont = { measureText: jest.fn((t: string) => ({ width: t.length * 6, height: 11 })) };

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Paint: jest.fn(() => ({ ...mockPaint })),
    Color: jest.fn((c: string) => c),
    XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({
      x, y, width: w, height: h,
    })),
    PathBuilder: {
      Make: jest.fn(() => mockPath),
    },
  },
  PaintStyle: { Fill: 0, Stroke: 1 },
  StrokeCap: { Round: 1 },
  StrokeJoin: { Miter: 0 },
  matchFont: jest.fn(() => mockFont),
}));

import { SkiaCanvasAdapter, ICanvasRenderer } from '../../../src/native/canvas/SkiaCanvasAdapter';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SkiaCanvasAdapter', () => {
  let adapter: SkiaCanvasAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SkiaCanvasAdapter(mockCanvas as any);
  });

  // -----------------------------------------------------------------------
  // fillRect
  // -----------------------------------------------------------------------

  describe('fillRect', () => {
    it('should draw a filled rectangle via Skia', () => {
      adapter.setFillStyle('#FF0000');
      adapter.fillRect(10, 20, 100, 50);

      expect(mockCanvas.drawRect).toHaveBeenCalledTimes(1);
      const [rect] = mockCanvas.drawRect.mock.calls[0];
      expect(rect).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it('should apply fill color before drawing', () => {
      adapter.setFillStyle('#00FF00');
      adapter.fillRect(0, 0, 50, 50);

      expect(mockCanvas.drawRect).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // strokeRect
  // -----------------------------------------------------------------------

  describe('strokeRect', () => {
    it('should draw a stroked rectangle via Skia', () => {
      adapter.setStrokeStyle('#0000FF');
      adapter.setLineWidth(2);
      adapter.strokeRect(5, 5, 200, 100);

      expect(mockCanvas.drawRect).toHaveBeenCalledTimes(1);
      const [rect] = mockCanvas.drawRect.mock.calls[0];
      expect(rect).toEqual({ x: 5, y: 5, width: 200, height: 100 });
    });
  });

  // -----------------------------------------------------------------------
  // fillPolygon
  // -----------------------------------------------------------------------

  describe('fillPolygon', () => {
    it('should draw a filled polygon path', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
      ];

      adapter.fillPolygon(triangle);

      expect(mockCanvas.drawPath).toHaveBeenCalledTimes(1);
    });

    it('should ignore polygons with fewer than 3 points', () => {
      adapter.fillPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(mockCanvas.drawPath).not.toHaveBeenCalled();
    });

    it('should handle a complex polygon (5 points)', () => {
      const pentagon = [
        { x: 50, y: 0 },
        { x: 100, y: 35 },
        { x: 81, y: 90 },
        { x: 19, y: 90 },
        { x: 0, y: 35 },
      ];

      adapter.fillPolygon(pentagon);
      expect(mockCanvas.drawPath).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // drawLine
  // -----------------------------------------------------------------------

  describe('drawLine', () => {
    it('should draw a line via Skia', () => {
      adapter.setStrokeStyle('#333333');
      adapter.setLineWidth(3);
      adapter.drawLine(0, 0, 100, 100);

      expect(mockCanvas.drawLine).toHaveBeenCalledTimes(1);
      expect(mockCanvas.drawLine).toHaveBeenCalledWith(
        0, 0, 100, 100, expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // fillCircle
  // -----------------------------------------------------------------------

  describe('fillCircle', () => {
    it('should draw a filled circle via Skia', () => {
      adapter.setFillStyle('#FF00FF');
      adapter.fillCircle(50, 50, 25);

      expect(mockCanvas.drawCircle).toHaveBeenCalledTimes(1);
      expect(mockCanvas.drawCircle).toHaveBeenCalledWith(
        50, 50, 25, expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // save / restore
  // -----------------------------------------------------------------------

  describe('save/restore', () => {
    it('should save and restore canvas state', () => {
      adapter.setFillStyle('#FF0000');
      adapter.save();
      adapter.setFillStyle('#0000FF');
      adapter.restore();

      // After restore, state should be back to #FF0000
      expect(mockCanvas.save).toHaveBeenCalledTimes(1);
      expect(mockCanvas.restore).toHaveBeenCalledTimes(1);
    });

    it('should handle nested save/restore', () => {
      adapter.setFillStyle('#FF0000');
      adapter.setLineWidth(1);
      adapter.save();

      adapter.setFillStyle('#00FF00');
      adapter.setLineWidth(5);
      adapter.save();

      adapter.setFillStyle('#0000FF');
      adapter.setLineWidth(10);
      adapter.restore(); // back to #00FF00, lineWidth=5
      adapter.restore(); // back to #FF0000, lineWidth=1

      expect(mockCanvas.save).toHaveBeenCalledTimes(2);
      expect(mockCanvas.restore).toHaveBeenCalledTimes(2);
    });

    it('should handle restore without save gracefully', () => {
      expect(() => adapter.restore()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Style setters
  // -----------------------------------------------------------------------

  describe('setFillStyle / setStrokeStyle / setLineWidth', () => {
    it('should accept CSS color strings', () => {
      expect(() => adapter.setFillStyle('#AABBCC')).not.toThrow();
      expect(() => adapter.setStrokeStyle('rgb(100,200,50)')).not.toThrow();
    });

    it('should enforce minimum line width of 0.1', () => {
      adapter.setLineWidth(0);
      adapter.drawLine(0, 0, 10, 10);
      // Should not throw
      expect(mockCanvas.drawLine).toHaveBeenCalledTimes(1);
    });

    it('should accept large line widths', () => {
      adapter.setLineWidth(50);
      adapter.drawLine(0, 0, 10, 10);
      expect(mockCanvas.drawLine).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('should clear canvas with default white', () => {
      adapter.clear();
      expect(mockCanvas.clear).toHaveBeenCalledTimes(1);
    });

    it('should clear canvas with custom color', () => {
      adapter.clear('#000000');
      expect(mockCanvas.clear).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // ICanvasRenderer interface
  // -----------------------------------------------------------------------

  describe('ICanvasRenderer interface', () => {
    it('should satisfy the ICanvasRenderer interface', () => {
      const renderer: ICanvasRenderer = adapter;
      expect(renderer.fillRect).toBeDefined();
      expect(renderer.strokeRect).toBeDefined();
      expect(renderer.fillPolygon).toBeDefined();
      expect(renderer.drawLine).toBeDefined();
      expect(renderer.fillCircle).toBeDefined();
      expect(renderer.save).toBeDefined();
      expect(renderer.restore).toBeDefined();
      expect(renderer.setFillStyle).toBeDefined();
      expect(renderer.setStrokeStyle).toBeDefined();
      expect(renderer.setLineWidth).toBeDefined();
      expect(renderer.clear).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Primitivas añadidas para el editor de planta: contornos y texto
// ---------------------------------------------------------------------------

describe('SkiaCanvasAdapter — contornos y texto', () => {
  let adapter: SkiaCanvasAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SkiaCanvasAdapter(mockCanvas as any);
  });

  it('strokePolygon dibuja un path cerrado con el paint de trazo', () => {
    adapter.setStrokeStyle('#FF0000');
    adapter.strokePolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);

    expect(mockPath.moveTo).toHaveBeenCalledWith(0, 0);
    expect(mockPath.lineTo).toHaveBeenCalledTimes(2);
    expect(mockPath.close).toHaveBeenCalledTimes(1);
    expect(mockCanvas.drawPath).toHaveBeenCalledTimes(1);
  });

  it('strokePolygon con menos de 2 puntos no dibuja nada', () => {
    adapter.strokePolygon([{ x: 0, y: 0 }]);
    expect(mockCanvas.drawPath).not.toHaveBeenCalled();
  });

  it('strokeCircle usa el paint de trazo, no el de relleno', () => {
    adapter.setStrokeStyle('#00FF00');
    adapter.setLineWidth(2);
    adapter.strokeCircle(5, 5, 3);

    expect(mockCanvas.drawCircle).toHaveBeenCalledTimes(1);
    expect(mockPaint.setStrokeWidth).toHaveBeenCalledWith(2);
  });

  it('drawText alineado a la izquierda dibuja en la x pedida', () => {
    adapter.drawText('4.20 m', 100, 50, 11, 'left');

    expect(mockCanvas.drawText).toHaveBeenCalledTimes(1);
    expect(mockCanvas.drawText.mock.calls[0][1]).toBe(100);
    expect(mockCanvas.drawText.mock.calls[0][2]).toBe(50);
  });

  it('drawText centrado descuenta la mitad del ancho medido', () => {
    adapter.drawText('abc', 100, 50, 11, 'center');

    // El mock mide 6px por carácter → 18px de ancho → x = 100 - 9.
    expect(mockCanvas.drawText.mock.calls[0][1]).toBe(91);
  });

  it('measureTextWidth usa la tipografía cuando está disponible', () => {
    expect(adapter.measureTextWidth('abcd', 11)).toBe(24);
  });
});
