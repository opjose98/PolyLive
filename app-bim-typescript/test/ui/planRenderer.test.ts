// =============================================================================
// planRenderer.test.ts — Lo que el editor DIBUJA de verdad
// =============================================================================
//
// El dibujo de la planta vivía como un `useCallback` dentro de SurveyScreen, y
// por tanto no se podía verificar nada de él. Extraído a una función pura sobre
// `ICanvasRenderer`, se puede afirmar con un renderer que registra llamadas:
// que un muro seleccionado se resalta, que un vano se dibuja sobre su muro,
// que las cotas aparecen y que la rejilla no se descontrola al alejar.
// =============================================================================

import { drawPlan, gridStepMeters, PlanScene } from '../../src/ui/canvas/planRenderer';
import type { ICanvasRenderer } from '../../src/native/canvas/SkiaCanvasAdapter';
import { Wall } from '../../src/domain/objects/wall';
import { Room } from '../../src/domain/objects/room';
import { Column } from '../../src/domain/objects/column';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { revitObjectId, roomId, levelId, wallId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { CANVAS_PALETTES } from '../../src/ui/design/canvasThemes';

const GRID_COLOR = CANVAS_PALETTES.claro.grid;

const ROOM_ID = roomId('room-1');

// ---------------------------------------------------------------------------
// Renderer de prueba: registra cada llamada
// ---------------------------------------------------------------------------

interface Call {
  op: string;
  args: unknown[];
}

class RecordingRenderer implements ICanvasRenderer {
  readonly calls: Call[] = [];
  private fill = '';
  private stroke = '';
  private width = 1;

  private record(op: string, args: unknown[]): void {
    this.calls.push({ op, args: [...args, { fill: this.fill, stroke: this.stroke, width: this.width }] });
  }

  fillRect(...a: number[]): void {
    this.record('fillRect', a);
  }
  strokeRect(...a: number[]): void {
    this.record('strokeRect', a);
  }
  fillPolygon(points: { x: number; y: number }[]): void {
    this.record('fillPolygon', [points]);
  }
  strokePolygon(points: { x: number; y: number }[]): void {
    this.record('strokePolygon', [points]);
  }
  drawLine(...a: number[]): void {
    this.record('drawLine', a);
  }
  fillCircle(...a: number[]): void {
    this.record('fillCircle', a);
  }
  strokeCircle(...a: number[]): void {
    this.record('strokeCircle', a);
  }
  drawPoints(points: { x: number; y: number }[], radius: number): void {
    this.record('drawPoints', [points, radius]);
  }
  drawText(text: string, x: number, y: number, size?: number, align?: string): void {
    this.record('drawText', [text, x, y, size, align]);
  }
  save(): void {
    this.record('save', []);
  }
  restore(): void {
    this.record('restore', []);
  }
  setFillStyle(c: string): void {
    this.fill = c;
  }
  setStrokeStyle(c: string): void {
    this.stroke = c;
  }
  setLineWidth(w: number): void {
    this.width = w;
  }
  clear(): void {
    this.record('clear', []);
  }

  ops(op: string): Call[] {
    return this.calls.filter((c) => c.op === op);
  }

  texts(): string[] {
    return this.ops('drawText').map((c) => c.args[0] as string);
  }
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function makeWall(id: string, ax: number, ay: number, bx: number, by: number, structural = true): Wall {
  return new Wall({
    id: revitObjectId(id),
    roomId: ROOM_ID,
    startPoint: { x: ax, y: ay },
    endPoint: { x: bx, y: by },
    thickness: meters(0.15),
    height: meters(2.8),
    isStructural: structural,
  });
}

function scene(overrides: Partial<PlanScene> = {}): PlanScene {
  return {
    objects: [],
    vertices: [],
    transform: { scale: 100, offsetX: 0, offsetY: 0 },
    selectedId: null,
    handles: [],
    width: 400,
    height: 300,
    showGrid: false,
    showLabels: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rejilla
// ---------------------------------------------------------------------------

describe('gridStepMeters', () => {
  it('elige un paso que deja al menos 20 px por celda', () => {
    for (const scale of [5, 20, 50, 100, 250, 500]) {
      expect(gridStepMeters(scale) * scale).toBeGreaterThanOrEqual(20);
    }
  });

  it('afina el paso al acercar y lo agranda al alejar', () => {
    expect(gridStepMeters(500)).toBeLessThan(gridStepMeters(20));
  });

  it('a zoom muy bajo no dibuja miles de líneas por frame', () => {
    // El paso fijo de 20px del código original producía, a escala 5 px/m en un
    // viewport de 400px, una línea cada 0.2 m de mundo sobre 80 m visibles.
    // Con paso adaptativo, el número de líneas queda acotado.
    const r = new RecordingRenderer();
    drawPlan(r, scene({ showGrid: true, transform: { scale: 5, offsetX: 0, offsetY: 0 } }));
    expect(r.ops('drawLine').length).toBeLessThan(60);
  });

  it('la rejilla queda anclada al origen del mundo, no a la esquina del viewport', () => {
    // Panear una cantidad exactamente igual al paso deja la rejilla en las
    // mismas posiciones de pantalla; si estuviera anclada al viewport,
    // resbalaría y dejaría de servir de referencia.
    const step = gridStepMeters(100); // 1 m a 100 px/m → 100 px
    const a = new RecordingRenderer();
    const b = new RecordingRenderer();
    drawPlan(a, scene({ showGrid: true, transform: { scale: 100, offsetX: 0, offsetY: 0 } }));
    drawPlan(b, scene({ showGrid: true, transform: { scale: 100, offsetX: step * 100, offsetY: 0 } }));

    // Solo las líneas de la rejilla: los ejes del mundo SÍ se mueven con el
    // paneo, que es justamente lo que deben hacer.
    const gridLines = (rec: RecordingRenderer) =>
      rec
        .ops('drawLine')
        .filter((c) => (c.args[4] as { stroke: string }).stroke === GRID_COLOR)
        .map((c) => c.args[0]);

    expect(gridLines(b)).toEqual(gridLines(a));
  });
});

// ---------------------------------------------------------------------------
// Muros
// ---------------------------------------------------------------------------

describe('drawPlan — muros', () => {
  it('dibuja un segmento por muro, en coordenadas de pantalla', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0)] }));

    const lines = r.ops('drawLine');
    expect(lines).toHaveLength(1);
    expect(lines[0].args.slice(0, 4)).toEqual([0, 0, 400, 0]);
  });

  it('distingue visualmente un muro portante de una partición ligera', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0, true), makeWall('w2', 0, 1, 4, 1, false)] }));

    const strokes = r.ops('drawLine').map((c) => (c.args[4] as { stroke: string }).stroke);
    expect(new Set(strokes).size).toBe(2);
  });

  it('dibuja el muro con su espesor real a escala, con un mínimo visible', () => {
    const thick = new RecordingRenderer();
    drawPlan(thick, scene({ objects: [makeWall('w1', 0, 0, 4, 0)] }));
    const widthAt100 = (thick.ops('drawLine')[0].args[4] as { width: number }).width;
    expect(widthAt100).toBeCloseTo(15); // 0.15 m × 100 px/m

    const zoomedOut = new RecordingRenderer();
    drawPlan(
      zoomedOut,
      scene({ objects: [makeWall('w1', 0, 0, 4, 0)], transform: { scale: 5, offsetX: 0, offsetY: 0 } }),
    );
    // 0.15 × 5 = 0.75 px: por debajo del mínimo, el muro desaparecería.
    expect((zoomedOut.ops('drawLine')[0].args[4] as { width: number }).width).toBeGreaterThanOrEqual(2);
  });

  it('subraya el muro elegido como destino de medición', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0)], measureTargetId: 'w1' }));

    expect(r.ops('drawLine')).toHaveLength(2); // el muro + el subrayado
  });
});

// ---------------------------------------------------------------------------
// Recintos
// ---------------------------------------------------------------------------

describe('drawPlan — recintos', () => {
  const room = new Room({
    id: revitObjectId('room-1'),
    roomId: ROOM_ID,
    levelId: levelId('level-1'),
    geometry: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
    area: squareMeters(12),
  });

  it('rellena y contornea el polígono del recinto', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [room] }));

    expect(r.ops('fillPolygon')).toHaveLength(1);
    expect(r.ops('strokePolygon')).toHaveLength(1);
  });

  it('no dibuja un recinto con menos de 3 vértices (todavía en trazo)', () => {
    const open = new Room({
      id: revitObjectId('room-2'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [open] }));

    expect(r.ops('fillPolygon')).toHaveLength(0);
  });

  it('dibuja las sugerencias de detección solo con contorno, para no confundirlas con recintos reales', () => {
    const r = new RecordingRenderer();
    drawPlan(
      r,
      scene({
        suggestions: [{ polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }],
      }),
    );

    expect(r.ops('strokePolygon')).toHaveLength(1);
    expect(r.ops('fillPolygon')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Vanos
// ---------------------------------------------------------------------------

describe('drawPlan — vanos', () => {
  const wall = makeWall('w1', 0, 0, 4, 0);
  const door = new Door({
    id: revitObjectId('d1'),
    roomId: ROOM_ID,
    parentWallId: wallId('w1'),
    offsetAlongWall: meters(1),
    offsetPerpendicular: meters(0),
    width: meters(0.9),
    height: meters(2.1),
  });

  it('dibuja la puerta como un hueco sobre el muro más su símbolo', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [wall, door] }));

    // 1 muro + 1 hueco (color de fondo) + 1 símbolo de puerta.
    expect(r.ops('drawLine')).toHaveLength(3);
  });

  it('centra el hueco en la posición derivada del muro padre', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [wall, door] }));

    // Puerta de 0.9 m con offset 1 → centro en x=1.45 → hueco de 1.0 a 1.9 m
    // → 100 a 190 px.
    const hole = r.ops('drawLine')[1];
    expect(hole.args[0]).toBeCloseTo(100);
    expect(hole.args[2]).toBeCloseTo(190);
  });

  it('una ventana añade las dos líneas desplazadas del símbolo convencional', () => {
    const win = new Window({
      id: revitObjectId('win1'),
      roomId: ROOM_ID,
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(2),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1.0),
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [wall, win] }));

    // 1 muro + hueco + línea central + 2 líneas desplazadas.
    expect(r.ops('drawLine')).toHaveLength(5);
  });

  it('no dibuja un vano cuyo muro padre ya no existe', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [door] })); // sin el muro

    expect(r.ops('drawLine')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

describe('drawPlan — columnas', () => {
  it('dibuja una columna circular como círculo relleno de radio a escala', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 2, y: 1 },
      diameter: meters(0.4),
      height: meters(3),
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [column] }));

    const circles = r.ops('fillCircle');
    expect(circles).toHaveLength(1);
    expect(circles[0].args.slice(0, 3)).toEqual([200, 100, 20]); // r = 0.2 m × 100
  });

  it('dibuja una columna rectangular como su huella rotada', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 2, y: 1 },
      sectionShape: 'rectangular',
      dimensionX: meters(0.4),
      dimensionY: meters(0.6),
      rotation: Math.PI / 4,
      height: meters(3),
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [column] }));

    expect(r.ops('fillPolygon')).toHaveLength(1);
    expect((r.ops('fillPolygon')[0].args[0] as unknown[]).length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Trazo en curso
// ---------------------------------------------------------------------------

describe('drawPlan — trazo en curso', () => {
  it('une los vértices y marca cada uno', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }));

    expect(r.ops('drawLine')).toHaveLength(2);
    expect(r.ops('fillCircle')).toHaveLength(4); // 3 vértices + el último resaltado
  });

  it('con un solo vértice no dibuja segmentos, pero sí el punto', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ vertices: [{ x: 0, y: 0 }] }));

    expect(r.ops('drawLine')).toHaveLength(0);
    expect(r.ops('fillCircle')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Selección
// ---------------------------------------------------------------------------

describe('drawPlan — selección', () => {
  it('resalta el muro seleccionado con un trazo más grueso que el propio muro', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [wall], selectedId: wall.id }));

    const widths = r.ops('drawLine').map((c) => (c.args[4] as { width: number }).width);
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  it('dibuja los handles del objeto seleccionado como círculos con borde', () => {
    const wall = makeWall('w1', 0, 0, 4, 0);
    const r = new RecordingRenderer();
    drawPlan(
      r,
      scene({
        objects: [wall],
        selectedId: wall.id,
        handles: [
          { kind: 'start', position: { x: 0, y: 0 } },
          { kind: 'end', position: { x: 4, y: 0 } },
          { kind: 'center', position: { x: 2, y: 0 } },
        ],
      }),
    );

    expect(r.ops('fillCircle')).toHaveLength(3);
    expect(r.ops('strokeCircle')).toHaveLength(3);
  });

  it('un selectedId que ya no corresponde a ningún objeto no rompe el dibujo', () => {
    const r = new RecordingRenderer();
    expect(() =>
      drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0)], selectedId: revitObjectId('fantasma') })),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

describe('drawPlan — etiquetas', () => {
  it('rotula la longitud de cada muro cuando showLabels está activo', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0)], showLabels: true }));

    expect(r.texts()).toContain('4.00 m');
  });

  it('no rotula nada si showLabels está apagado', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [makeWall('w1', 0, 0, 4, 0)], showLabels: false }));

    expect(r.texts()).toHaveLength(0);
  });

  it('omite la cota de un muro demasiado corto en pantalla para que sea legible', () => {
    const r = new RecordingRenderer();
    drawPlan(
      r,
      scene({
        objects: [makeWall('w1', 0, 0, 0.2, 0)], // 20 px a escala 100
        showLabels: true,
      }),
    );

    expect(r.texts()).toHaveLength(0);
  });

  it('rotula nombre y área de un recinto cerrado', () => {
    const room = new Room({
      id: revitObjectId('room-1'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      area: squareMeters(12),
      properties: { name: 'Salón' },
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [room], showLabels: true }));

    expect(r.texts()).toContain('Salón');
    expect(r.texts()).toContain('12.00 m²');
  });

  it('no rotula el área de un recinto todavía abierto (área null)', () => {
    const open = new Room({
      id: revitObjectId('room-1'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
    });
    const r = new RecordingRenderer();
    drawPlan(r, scene({ objects: [open], showLabels: true }));

    expect(r.texts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Temas, estilos de rejilla y margen para la cámara del hilo UI
// ---------------------------------------------------------------------------

describe('drawPlan — temas y rejilla', () => {
  it('el tema cambia los colores del muro y de la rejilla', () => {
    const claro = new RecordingRenderer();
    const oscuro = new RecordingRenderer();
    const objects = [makeWall('w1', 0, 0, 4, 0)];
    drawPlan(claro, scene({ objects, showGrid: true }));
    drawPlan(oscuro, scene({ objects, showGrid: true, palette: CANVAS_PALETTES.oscuro }));

    const strokes = (rec: RecordingRenderer) => new Set(rec.ops('drawLine').map((c) => (c.args[4] as { stroke: string }).stroke));
    expect(strokes(oscuro).has(CANVAS_PALETTES.oscuro.ink)).toBe(true);
    expect(strokes(oscuro).has(CANVAS_PALETTES.claro.ink)).toBe(false);
    expect(strokes(claro).has(CANVAS_PALETTES.claro.grid)).toBe(true);
  });

  it('alto contraste engrosa la rejilla', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ showGrid: true, palette: CANVAS_PALETTES.contraste }));
    const gridLine = r.ops('drawLine').find((c) => (c.args[4] as { stroke: string }).stroke === CANVAS_PALETTES.contraste.grid)!;
    expect((gridLine.args[4] as { width: number }).width).toBe(0.5 * CANVAS_PALETTES.contraste.lineScale);
  });

  it('la rejilla de puntos se dibuja en una sola llamada', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ showGrid: true, gridStyle: { lines: false, dots: true } }));
    expect(r.ops('drawPoints')).toHaveLength(1);
    expect((r.ops('drawPoints')[0].args[0] as unknown[]).length).toBeGreaterThan(4);
    // Sin líneas de rejilla: solo los ejes del mundo.
    expect(r.ops('drawLine').length).toBeLessThanOrEqual(2);
  });

  it('con overscan la rejilla cubre más allá del viewport', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ showGrid: true, gridOverscanPx: 200, transform: { scale: 100, offsetX: 50, offsetY: 50 } }));
    const xs = r.ops('drawLine').map((c) => c.args[0] as number);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(400);
  });

  it('marca con un anillo el nodo al que se engancha un arrastre', () => {
    const r = new RecordingRenderer();
    drawPlan(r, scene({ snapIndicator: { x: 1, y: 1 } }));
    const ring = r.ops('strokeCircle').find((c) => c.args[0] === 100 && c.args[1] === 100);
    expect(ring).toBeDefined();
  });
});
