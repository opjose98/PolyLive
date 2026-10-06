// =============================================================================
// ValidationService.ts — Implementación de producción de IValidationService
// Basado en: matriz-reglas-de-negocio.md, docs/09-PRODUCTION-READINESS.md §5.4
//
// GAP CERRADO: hasta ahora IValidationService (application/use-cases/types.ts)
// no tenía NINGUNA implementación concreta en src/ — todos los 27 suites de
// test la mockeaban (jest.fn().mockReturnValue({valid:true, warnings:[]})).
// Eso significa que, en producción, CreateWallUseCase/CreateDoorUseCase/etc.
// no tenían nada real que inyectarles: la validación descrita en
// 09-PRODUCTION-READINESS.md §5.4 ("Domain-level validation on all inputs")
// no existía como código ejecutable, solo como afirmación en la documentación.
// =============================================================================
//
// NOTA SOBRE ValidationWarning.type: el union type `ValidationWarningType`
// (domain/geometry/types.ts) nació para warnings geométricos
// ('degenerate_triangle', 'self_intersecting_polygon', etc.) — no existe un
// tipo dedicado para "muro demasiado delgado" o "puerta se sale del muro".
// Esta implementación reutiliza 'degenerate_triangle' como
// el tipo más cercano para "objeto geométricamente inválido" y deja el
// detalle real en `message`, que es lo que la UI muestra.
// =============================================================================

import { ValidationWarning } from '../../domain/geometry/types';
import { ValidationResult, IValidationService } from '../../application/use-cases/types';

const MIN_WALL_THICKNESS = 0.1; // metros — docs/09-PRODUCTION-READINESS.md §5.4
const MAX_WALL_THICKNESS = 1.0;
// Sin tope de altura: un muro atado a niveles puede subir varios pisos (Revit).

function ok(): ValidationResult {
  return { valid: true, warnings: [] };
}

function invalid(message: string, details?: Record<string, unknown>): ValidationResult {
  const warning: ValidationWarning = { type: 'degenerate_triangle', message, details };
  return { valid: false, warnings: [warning] };
}

function isDegeneratePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

export class ValidationService implements IValidationService {
  validateWall(wall: any): ValidationResult {
    if (!wall?.startPoint || !wall?.endPoint) {
      return invalid('El muro necesita un punto de inicio y un punto final.');
    }
    if (isDegeneratePoint(wall.startPoint, wall.endPoint)) {
      return invalid('El muro no puede tener el mismo punto de inicio y fin (longitud cero).');
    }
    const thickness = wall.thickness as number;
    if (!(thickness > 0)) {
      return invalid('El espesor del muro debe ser mayor que cero.', { thickness });
    }
    if (thickness < MIN_WALL_THICKNESS || thickness > MAX_WALL_THICKNESS) {
      // Fuera de rango típico de construcción — warning, no bloqueo (matriz-reglas-de-negocio.md).
      return {
        valid: true,
        warnings: [
          {
            type: 'degenerate_triangle',
            message: `Espesor de muro inusual: ${thickness}m (rango típico ${MIN_WALL_THICKNESS}–${MAX_WALL_THICKNESS}m).`,
            details: { thickness },
          },
        ],
      };
    }
    const height = wall.height as number;
    if (!(height > 0)) {
      return invalid('La altura del muro debe ser mayor que cero.', { height });
    }
    return ok();
  }

  validateColumn(column: any): ValidationResult {
    const diameter = column?.diameter as number;
    if (!(diameter > 0)) {
      return invalid('El diámetro de la columna debe ser mayor que cero.', { diameter });
    }
    const height = column?.height as number;
    if (!(height > 0)) {
      return invalid('La altura de la columna debe ser mayor que cero.', { height });
    }
    return ok();
  }

  validateDoor(door: any, context?: { walls: any[] }): ValidationResult {
    return this.validateVano(door, 'La puerta', context);
  }

  validateWindow(window: any, context?: { walls: any[] }): ValidationResult {
    return this.validateVano(window, 'La ventana', context);
  }

  private validateVano(vano: any, label: string, context?: { walls: any[] }): ValidationResult {
    const width = vano?.width as number;
    const height = vano?.height as number;
    if (!(width > 0)) return invalid(`${label} debe tener un ancho mayor que cero.`, { width });
    if (!(height > 0)) return invalid(`${label} debe tener una altura mayor que cero.`, { height });

    const offsetAlongWall = vano?.offsetAlongWall as number;
    if (offsetAlongWall < 0) {
      return invalid(`${label} no puede tener un desplazamiento negativo a lo largo del muro.`, {
        offsetAlongWall,
      });
    }

    // offsetAlongWall + width <= wall.length es un WARNING (no bloqueo), tal
    // como especifica Door-especificacion.md — el vano puede sobresalir del
    // muro temporalmente mientras el operador sigue ajustando el trazo.
    if (context?.walls?.length) {
      const parentWall = context.walls.find((w) => w.id === vano.parentWallId);
      if (parentWall && typeof parentWall.length === 'number') {
        const endsAt = offsetAlongWall + width;
        if (endsAt > parentWall.length) {
          return {
            valid: true,
            warnings: [
              {
                type: 'degenerate_triangle',
                message: `${label} se extiende más allá del muro que la contiene (termina en ${endsAt.toFixed(2)}m, el muro mide ${Number(parentWall.length).toFixed(2)}m).`,
                details: { offsetAlongWall, width, wallLength: parentWall.length },
              },
            ],
          };
        }
      }
    }

    return ok();
  }

  validateRoom(room: any): ValidationResult {
    if (!room?.geometry || room.geometry.length < 3) {
      return invalid('El Recinto necesita al menos 3 vértices para cerrarse.');
    }
    return ok();
  }

  validateExport(room: any): ValidationResult {
    if (!room) return invalid('No hay Recinto para exportar.');
    if (room.isOpen !== false && room.isClosed !== true) {
      return invalid('El Recinto debe estar cerrado antes de exportar a IFC.');
    }
    if (room.area == null) {
      return invalid('El Recinto no tiene área calculada — ciérralo antes de exportar.');
    }
    return ok();
  }
}
