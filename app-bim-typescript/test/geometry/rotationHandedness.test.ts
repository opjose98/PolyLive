// Giro de la vista (solo visual) y Y de intercambio (hacia arriba).
import { screenToWorld, worldToScreen } from '../../src/domain/geometry/coordinates';
import { toLocal, wallForExport } from '../../src/domain/geometry/handedness';
import { Wall } from '../../src/domain/objects/wall';
import { revitObjectId, roomId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';

describe('cámara con giro', () => {
  const t = { scale: 100, offsetX: 200, offsetY: 300, rotation: Math.PI / 2 };

  it('un giro de 90° lleva la +X del mundo hacia abajo en pantalla', () => {
    const p = worldToScreen({ x: 1, y: 0 }, t);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(400);
  });

  it('screenToWorld es la inversa de worldToScreen', () => {
    for (const w of [{ x: 1.3, y: -2.2 }, { x: 0, y: 0 }, { x: -4, y: 7 }]) {
      const back = screenToWorld(worldToScreen(w, { ...t, rotation: 0.7 }), { ...t, rotation: 0.7 });
      expect(back.x).toBeCloseTo(w.x);
      expect(back.y).toBeCloseTo(w.y);
    }
  });

  it('sin giro se comporta como antes', () => {
    expect(worldToScreen({ x: 1, y: 2 }, { scale: 10, offsetX: 5, offsetY: 6 })).toEqual({ x: 15, y: 26 });
  });
});

describe('Y de intercambio', () => {
  it('lo que en pantalla está arriba queda al norte (Y positiva)', () => {
    // Un punto dibujado 3 m "arriba" en pantalla tiene y = −3 en el modelo.
    expect(toLocal({ x: 2, y: -3 })).toEqual({ x: 2, y: 3 });
  });

  it('el muro exportado conserva longitud e id y espeja su eje', () => {
    const w = new Wall({
      id: revitObjectId('w'),
      roomId: roomId('r'),
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 3, y: -4 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    const e = wallForExport(w);
    expect(e).toBeInstanceOf(Wall);
    expect(e.endPoint).toEqual({ x: 3, y: 4 });
    expect(Number(e.length)).toBeCloseTo(5);
    expect(e.id).toBe(w.id);
    expect(w.endPoint).toEqual({ x: 3, y: -4 }); // el original no se toca
  });
});
