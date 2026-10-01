// =============================================================================
// compatibility-gate.ts — IFC Compatibility Gate: 8 criterios de validación
// Basado en: IFC-Compatibility-Gate.md (Obsidian 03-Infraestructura/export-ifc)
//
// Valida un Room y sus objetos BIM ANTES de serializar a IFC.
// Criterios:
//   1. Room cerrado (warning si abierto)
//   2. Geometría válida — polígono no auto-intersectante (error)
//   3. Todos Walls: thickness > 0 (error)
//   4. Todos vanos: Wall padre válido (error)
//   5. Todos Rooms: levelId definido (error)
//   6. Proyecto georreferenciado (warning: sin amarre, el sitio queda en {0,0}).
//      Lo alimenta la Georeference del proyecto (domain/geo, M2); en M2b se
//      escribirá como IfcMapConversion.
//   7. Sin objetos is_deleted = true (excluir automáticamente)
//   8. Archivo .ifc escribible (error I/O) — validado externamente
// =============================================================================

import { Room } from '../../../domain/objects/room';
import { Wall } from '../../../domain/objects/wall';
import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { RevitObjectBase } from '../../../domain/objects/base';
import { GateValidationEntry, GateValidationResult } from './types';

/**
 * Valida los 8 criterios del IFC Compatibility Gate.
 *
 * @param room     — el Room a exportar
 * @param objects  — todos los objetos BIM del Room (Walls, Doors, Windows, Columns, Floor)
 * @param options  — opciones adicionales (hasGeoreference, canWriteFile)
 * @returns GateValidationResult con entries y valid (true si no hay errors)
 */
export function validate8Criteria(
  room: Room,
  objects: RevitObjectBase[],
  options?: {
    hasGeoreference?: boolean;
    canWriteFile?: boolean;
  }
): GateValidationResult {
  const entries: GateValidationEntry[] = [];
  const opts = {
    hasGeoreference: options?.hasGeoreference ?? true,
    canWriteFile: options?.canWriteFile ?? true,
  };

  // -------------------------------------------------------------------------
  // Criterio 1: Room cerrado (warning si abierto)
  // -------------------------------------------------------------------------
  if (room.isOpen) {
    entries.push({
      criterion: 1,
      severity: 'warning',
      message: 'Room aún está abierto — la exportación incluirá un polígono incompleto',
    });
  }

  // -------------------------------------------------------------------------
  // Criterio 2: Geometría válida — polígono no auto-intersectante
  // -------------------------------------------------------------------------
  if (room.geometry.length >= 3) {
    if (isPolygonSelfIntersecting(room.geometry)) {
      entries.push({
        criterion: 2,
        severity: 'error',
        message: 'Polígono del Room es auto-intersectante — geometría inválida para IFC',
      });
    }
  } else if (room.geometry.length > 0) {
    entries.push({
      criterion: 2,
      severity: 'error',
      message: `Room necesita al menos 3 vértices (tiene ${room.geometry.length})`,
    });
  }

  // -------------------------------------------------------------------------
  // Criterio 3: Todos los Walls tienen thickness > 0
  // -------------------------------------------------------------------------
  const walls = objects.filter((o): o is Wall => o.type === 'Wall' && !o.is_deleted);
  for (const wall of walls) {
    if ((wall.thickness as number) <= 0) {
      entries.push({
        criterion: 3,
        severity: 'error',
        message: `Wall ${wall.id} tiene espesor <= 0 (${wall.thickness}m)`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Criterio 4: Todos los vanos tienen Wall padre válido
  // -------------------------------------------------------------------------
  const wallIds = new Set(walls.map((w) => w.id as string));
  const doors = objects.filter((o): o is Door => o.type === 'Door' && !o.is_deleted);
  const windows = objects.filter((o): o is Window => o.type === 'Window' && !o.is_deleted);

  for (const door of doors) {
    if (!wallIds.has(door.parentWallId as string)) {
      entries.push({
        criterion: 4,
        severity: 'error',
        message: `Door ${door.id} referencia Wall padre inexistente (${door.parentWallId})`,
      });
    }
  }
  for (const win of windows) {
    if (!wallIds.has(win.parentWallId as string)) {
      entries.push({
        criterion: 4,
        severity: 'error',
        message: `Window ${win.id} referencia Wall padre inexistente (${win.parentWallId})`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Criterio 5: Room tiene levelId definido
  // -------------------------------------------------------------------------
  if (!room.levelId) {
    entries.push({
      criterion: 5,
      severity: 'error',
      message: 'Room no tiene levelId definido — requerido para IFC',
    });
  }

  // -------------------------------------------------------------------------
  // Criterio 6: proyecto georreferenciado (warning)
  // -------------------------------------------------------------------------
  if (!opts.hasGeoreference) {
    entries.push({
      criterion: 6,
      severity: 'warning',
      message: 'Proyecto sin georreferencia: el sitio quedará en (0,0)',
    });
  }

  // -------------------------------------------------------------------------
  // Criterio 7: Sin objetos is_deleted = true
  // Se maneja filtrando, no como error — pero reportamos si hay alguno
  // -------------------------------------------------------------------------
  const deletedCount = objects.filter((o) => o.is_deleted).length;
  if (deletedCount > 0) {
    entries.push({
      criterion: 7,
      severity: 'warning',
      message: `${deletedCount} objeto(s) marcados como borrados — excluidos de exportación`,
    });
  }

  // -------------------------------------------------------------------------
  // Criterio 8: Archivo .ifc escribible (validado externamente)
  // -------------------------------------------------------------------------
  if (!opts.canWriteFile) {
    entries.push({
      criterion: 8,
      severity: 'error',
      message: 'No se puede escribir el archivo .ifc — permisos insuficientes',
    });
  }

  // Resultado: valid = no hay ningún error (warnings permitidos)
  const hasErrors = entries.some((e) => e.severity === 'error');
  return { valid: !hasErrors, entries };
}

// ---------------------------------------------------------------------------
// Detección de auto-intersección de polígono
// ---------------------------------------------------------------------------

interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Verifica si un polígono (lista de vértices) se auto-intersecta.
 * Compara cada par de aristas no adyacentes usando cruce de segmentos.
 *
 * Complejidad: O(n²) — aceptable para polígonos típicos (< 100 vértices).
 */
function isPolygonSelfIntersecting(vertices: Point2D[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  // Crear aristas (incluyendo la que cierra el polígono)
  const edges: Array<[Point2D, Point2D]> = [];
  for (let i = 0; i < n; i++) {
    edges.push([vertices[i], vertices[(i + 1) % n]]);
  }

  // Comparar cada par de aristas no adyacentes
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 2; j < edges.length; j++) {
      // Saltar aristas adyacentes (la primera y la última son adyacentes)
      if (i === 0 && j === edges.length - 1) continue;

      if (segmentsIntersect(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determina si dos segmentos (p1→p2) y (p3→p4) se cruzan propiamente.
 * No cuenta intersecciones en los extremos (T-joints, esquinas).
 */
function segmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/** Producto cruzado 2D: (b-a) × (c-a). */
function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
