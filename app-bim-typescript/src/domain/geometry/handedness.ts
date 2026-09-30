// =============================================================================
// handedness.ts — Y del modelo (hacia abajo) ↔ Y de intercambio (hacia arriba)
// =============================================================================
//
// El modelo de PolyLive guarda las coordenadas de planta con la Y creciendo
// HACIA ABAJO, igual que la pantalla (así worldToScreen es solo escala +
// desplazamiento). Los formatos de intercambio —IFC, DXF, coordenadas
// topográficas (Norte)— usan la Y HACIA ARRIBA.
//
// BUG CORREGIDO: los exportadores escribían la Y tal cual. Todo lo levantado
// llegaba a Revit y a AutoCAD espejado norte-sur respecto de lo que se veía en
// el teléfono. La conversión se hace en el BORDE (al exportar, al calcular
// coordenadas reales), no en los datos: los levantamientos ya guardados no se
// tocan y se siguen viendo igual.
//
// Coordenadas LOCALES del proyecto (las que ve el usuario en los ejes XYZ y la
// base de la topografía): X = x del modelo, Y = −y del modelo, Z = cota.
// =============================================================================

import type { Point2D } from './types';
import { Wall } from '../objects/wall';
import { Column } from '../objects/column';
import { Room } from '../objects/room';
import type { Shape } from './shapes';
import { lineShape } from './shapes';

/** Punto del modelo → coordenadas locales (Y hacia arriba). Es su propia inversa. */
export function toLocal(p: Point2D): Point2D {
  return { x: p.x, y: -p.y };
}

export const fromLocal = toLocal;

function mirrorShape(shape: Shape): Shape {
  switch (shape.kind) {
    case 'line':
      return lineShape(toLocal(shape.start), toLocal(shape.end));
    case 'arc':
      // Espejar en Y invierte el sentido de giro de los ángulos.
      return { ...shape, center: toLocal(shape.center), startAngle: -shape.startAngle, sweepAngle: -shape.sweepAngle };
    case 'polyline':
      return { ...shape, vertices: shape.vertices.map(toLocal) };
  }
}

/** Copia del objeto con su clase, cambiando algunos campos (para exportar). */
function cloneWith<T extends object>(obj: T, changes: Partial<T>): T {
  return Object.assign(Object.create(Object.getPrototypeOf(obj)), obj, changes);
}

/** Muro con la geometría en coordenadas de intercambio (Y hacia arriba). */
export function wallForExport(w: Wall): Wall {
  const shape = mirrorShape(w.shape);
  return cloneWith(w, { startPoint: toLocal(w.startPoint), endPoint: toLocal(w.endPoint), shape });
}

export function columnForExport(c: Column): Column {
  // El giro de la sección también se espeja.
  return cloneWith(c, { position: toLocal(c.position), rotation: -c.rotation });
}

export function roomForExport(r: Room): Room {
  return cloneWith(r, { geometry: r.geometry.map(toLocal) } as Partial<Room>);
}
