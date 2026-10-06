// =============================================================================
// SkiaCanvasAdapter.ts — Adapter: Canvas2D API → Skia rendering
// Basado en: canvas-2d-skia-mapping.md, Canvas2D-interacción.md
// =============================================================================
//
// Implementa el Adapter Pattern para que la capa de dominio (que trabaja
// con una interfaz Canvas2D genérica) pueda renderizar vía @shopify/react-native-skia
// sin acoplarse directamente a Skia.
//
// INVARIANTES:
// - save/restore mantienen stack LIFO de estados
// - fillStyle / strokeStyle se aplican al siguiente draw, no retroactivamente
// - Coordenadas en píxeles de pantalla (ya transformadas por CanvasManager)
// =============================================================================

import type { SkCanvas, SkPaint } from '@shopify/react-native-skia';
import { Skia, PaintStyle, PointMode, StrokeCap, StrokeJoin, matchFont } from '@shopify/react-native-skia';

// ---------------------------------------------------------------------------
// Interfaz genérica que el dominio/aplicación consume
// ---------------------------------------------------------------------------

export interface ICanvasRenderer {
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillPolygon(points: { x: number; y: number }[]): void;
  /** Contorno de un polígono (cerrado). Complemento de `fillPolygon`. */
  strokePolygon(points: { x: number; y: number }[]): void;
  drawLine(x1: number, y1: number, x2: number, y2: number): void;
  /** Trazo abierto por varios puntos (arcos de puerta, curvas). */
  strokePolyline(points: { x: number; y: number }[]): void;
  fillCircle(x: number, y: number, r: number): void;
  /** Circunferencia sin relleno — para nodos y radios de snap. */
  strokeCircle(x: number, y: number, r: number): void;
  /**
   * Muchos puntos redondos del color de relleno en UNA llamada nativa (rejilla
   * de puntos): miles de `fillCircle` sueltos se comen el presupuesto del frame.
   */
  drawPoints(points: { x: number; y: number }[], radius: number): void;
  /**
   * Texto con el color de relleno actual. `align` posiciona respecto a (x, y):
   * 'left' hace de (x,y) el extremo izquierdo de la línea base; 'center', su
   * centro horizontal. Sin texto el editor no puede etiquetar cotas ni códigos
   * BIM, que es la mitad de la información útil de un plano.
   */
  drawText(text: string, x: number, y: number, size?: number, align?: 'left' | 'center' | 'right'): void;
  save(): void;
  restore(): void;
  setFillStyle(color: string): void;
  setStrokeStyle(color: string): void;
  setLineWidth(width: number): void;
  clear(color?: string): void;
}

// ---------------------------------------------------------------------------
// Estado interno del canvas (para save/restore)
// ---------------------------------------------------------------------------

interface CanvasState {
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
}

// ---------------------------------------------------------------------------
// SkiaCanvasAdapter — Implementación Skia del renderer
// ---------------------------------------------------------------------------

export class SkiaCanvasAdapter implements ICanvasRenderer {
  private canvas: SkCanvas;
  private fillPaint: SkPaint;
  private strokePaint: SkPaint;
  private stateStack: CanvasState[] = [];

  private fillColor: string = '#000000';
  private strokeColor: string = '#000000';
  private lineWidth: number = 1;

  constructor(canvas: SkCanvas) {
    this.canvas = canvas;

    this.fillPaint = Skia.Paint();
    this.fillPaint.setStyle(PaintStyle.Fill);
    this.fillPaint.setColor(Skia.Color(this.fillColor));

    this.strokePaint = Skia.Paint();
    this.strokePaint.setStyle(PaintStyle.Stroke);
    this.strokePaint.setColor(Skia.Color(this.strokeColor));
    this.strokePaint.setStrokeWidth(this.lineWidth);
    this.strokePaint.setStrokeCap(StrokeCap.Round);
    this.strokePaint.setStrokeJoin(StrokeJoin.Round);
  }

  // -------------------------------------------------------------------------
  // Draw methods
  // -------------------------------------------------------------------------

  fillRect(x: number, y: number, w: number, h: number): void {
    this.syncFillPaint();
    const rect = Skia.XYWHRect(x, y, w, h);
    this.canvas.drawRect(rect, this.fillPaint);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.syncStrokePaint();
    const rect = Skia.XYWHRect(x, y, w, h);
    this.canvas.drawRect(rect, this.strokePaint);
  }

  fillPolygon(points: { x: number; y: number }[]): void {
    if (points.length < 3) return;

    this.syncFillPaint();
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    path.close();
    this.canvas.drawPath(path, this.fillPaint);
  }

  strokePolygon(points: { x: number; y: number }[]): void {
    if (points.length < 2) return;

    this.syncStrokePaint();
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    path.close();
    this.canvas.drawPath(path, this.strokePaint);
  }

  strokePolyline(points: { x: number; y: number }[]): void {
    if (points.length < 2) return;
    this.syncStrokePaint();
    const path = Skia.Path.Make();
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
    this.canvas.drawPath(path, this.strokePaint);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    this.syncStrokePaint();
    this.canvas.drawLine(x1, y1, x2, y2, this.strokePaint);
  }

  fillCircle(x: number, y: number, r: number): void {
    this.syncFillPaint();
    this.canvas.drawCircle(x, y, r, this.fillPaint);
  }

  strokeCircle(x: number, y: number, r: number): void {
    this.syncStrokePaint();
    this.canvas.drawCircle(x, y, r, this.strokePaint);
  }

  drawPoints(points: { x: number; y: number }[], radius: number): void {
    if (points.length === 0) return;
    const paint = Skia.Paint();
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setStrokeWidth(radius * 2);
    paint.setColor(Skia.Color(this.fillColor));
    this.canvas.drawPoints(PointMode.Points, points.map((p) => Skia.Point(p.x, p.y)), paint);
  }

  drawText(
    text: string,
    x: number,
    y: number,
    size: number = 11,
    align: 'left' | 'center' | 'right' = 'left',
  ): void {
    const font = SkiaCanvasAdapter.fontOfSize(size);
    // Sin tipografía disponible no se dibuja nada: una etiqueta ausente es un
    // defecto cosmético, pero lanzar aquí tumbaría el frame entero del canvas
    // y con él el plano, que es información crítica en campo.
    if (!font) return;

    this.syncFillPaint();
    const w = align === 'left' ? 0 : this.measureTextWidth(text, size);
    const drawX = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.canvas.drawText(text, drawX, y, this.fillPaint, font);
  }

  /**
   * Ancho aproximado del texto. Se usa para centrar etiquetas; si la
   * tipografía no está disponible cae a una estimación por número de
   * caracteres, que descentra un poco pero no desaparece.
   */
  measureTextWidth(text: string, size: number = 11): number {
    const font = SkiaCanvasAdapter.fontOfSize(size);
    if (!font) return text.length * size * 0.55;
    try {
      return font.measureText(text).width;
    } catch {
      return text.length * size * 0.55;
    }
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  save(): void {
    this.stateStack.push({
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      lineWidth: this.lineWidth,
    });
    this.canvas.save();
  }

  restore(): void {
    const state = this.stateStack.pop();
    if (state) {
      this.fillColor = state.fillColor;
      this.strokeColor = state.strokeColor;
      this.lineWidth = state.lineWidth;
    }
    this.canvas.restore();
  }

  // -------------------------------------------------------------------------
  // Style setters
  // -------------------------------------------------------------------------

  setFillStyle(color: string): void {
    this.fillColor = color;
  }

  setStrokeStyle(color: string): void {
    this.strokeColor = color;
  }

  setLineWidth(width: number): void {
    this.lineWidth = Math.max(0.1, width);
  }

  clear(color: string = '#FFFFFF'): void {
    this.canvas.clear(Skia.Color(color));
  }

  // -------------------------------------------------------------------------
  // Internal sync
  // -------------------------------------------------------------------------

  // Una planta son miles de trazos: convertir el color (cadena → Skia) y
  // tocar el pincel solo cuando cambia ahorra miles de llamadas JSI por grabado.
  private paintedFill: string | null = null;
  private paintedStroke: string | null = null;
  private paintedWidth = -1;

  private syncFillPaint(): void {
    if (this.paintedFill === this.fillColor) return;
    this.paintedFill = this.fillColor;
    this.fillPaint.setColor(SkiaCanvasAdapter.color(this.fillColor));
  }

  private syncStrokePaint(): void {
    if (this.paintedStroke !== this.strokeColor) {
      this.paintedStroke = this.strokeColor;
      this.strokePaint.setColor(SkiaCanvasAdapter.color(this.strokeColor));
    }
    if (this.paintedWidth !== this.lineWidth) {
      this.paintedWidth = this.lineWidth;
      this.strokePaint.setStrokeWidth(this.lineWidth);
    }
  }

  /** Colores ya convertidos (la paleta del lienzo es corta y fija). */
  private static colorCache = new Map<string, ReturnType<typeof Skia.Color>>();

  private static color(c: string): ReturnType<typeof Skia.Color> {
    let v = SkiaCanvasAdapter.colorCache.get(c);
    if (!v) {
      v = Skia.Color(c);
      SkiaCanvasAdapter.colorCache.set(c, v);
    }
    return v;
  }

  // -------------------------------------------------------------------------
  // Tipografía
  // -------------------------------------------------------------------------

  /**
   * Fuentes memoizadas por tamaño. `matchFont` resuelve una tipografía del
   * sistema y es una operación relativamente costosa: construirla dentro de
   * cada `drawText` significaría crearla docenas de veces por frame, con el
   * presupuesto de 16 ms que fija presupuesto-frame.md.
   *
   * El caché es estático porque un SkiaCanvasAdapter nuevo se instancia en
   * CADA repintado (ver SkiaCanvas.tsx: `createPicture` construye uno por
   * frame); un caché de instancia no llegaría a reutilizarse nunca.
   */
  private static fontCache = new Map<number, ReturnType<typeof matchFont> | null>();

  private static fontOfSize(size: number): ReturnType<typeof matchFont> | null {
    const cached = SkiaCanvasAdapter.fontCache.get(size);
    if (cached !== undefined) return cached;

    let font: ReturnType<typeof matchFont> | null = null;
    try {
      font = matchFont({ fontFamily: 'sans-serif', fontSize: size });
    } catch {
      font = null; // entorno sin tipografías (tests en Node, por ejemplo)
    }
    SkiaCanvasAdapter.fontCache.set(size, font);
    return font;
  }
}
