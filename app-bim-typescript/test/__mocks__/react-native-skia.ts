// Mock: @shopify/react-native-skia (for Node test environment)

const mockPaint = () => ({
  setStyle: jest.fn(),
  setColor: jest.fn(),
  setStrokeWidth: jest.fn(),
  setStrokeCap: jest.fn(),
  setStrokeJoin: jest.fn(),
});

const mockPath = () => ({
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  close: jest.fn(),
});

/** PathBuilder (Skia 2): métodos encadenables y `detach()` devuelve el SkPath. */
const mockPathBuilder = () => {
  const b: Record<string, jest.Mock> = {};
  for (const m of ['moveTo', 'lineTo', 'close', 'addArc', 'addCircle']) b[m] = jest.fn(() => b);
  b.detach = jest.fn(() => mockPath());
  b.build = jest.fn(() => mockPath());
  return b;
};

/**
 * `matchFont` en el entorno de Node no tiene tipografías del sistema que
 * resolver. Se devuelve un objeto con `measureText` para que el adapter pueda
 * ejercitar su rama "con fuente" y los tests verifiquen que llama a
 * `canvas.drawText` en vez de saltárselo.
 */
export const matchFont = jest.fn((_style?: unknown) => ({
  measureText: (text: string) => ({ width: text.length * 6, height: 11 }),
}));

export const Skia = {
  Paint: mockPaint,
  Color: (c: string) => c,
  XYWHRect: (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h }),
  Path: {
    Make: mockPath,
    Circle: mockPath,
  },
  PathBuilder: {
    Make: mockPathBuilder,
  },
};

export const PaintStyle = { Fill: 0, Stroke: 1 };
export const StrokeCap = { Round: 1 };
export const StrokeJoin = { Miter: 0 };

export const Canvas = 'Canvas';
export const Picture = 'Picture';
export const createPicture = (_cb: any, _rect?: any) => {
  // Return a mock SkPicture
  return { __typename: 'SkPicture' };
};
export const useCanvasRef = () => ({ current: null });
