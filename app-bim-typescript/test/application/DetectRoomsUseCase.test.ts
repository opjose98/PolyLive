// =============================================================================
// DetectRoomsUseCase.test.ts — Detección automática de recintos (sugerencias)
// Motor portado de LevON (detect_rooms_use_case.dart + room_generator.dart)
// =============================================================================

import { meters, Point2D } from '../../src/domain/geometry/types';
import { DetectRoomsUseCase } from '../../src/application/use-cases/DetectRoomsUseCase';
import { isPointInPolygon } from '../../src/domain/geometry/polygon-utils';
import { Wall, revitObjectId, roomId } from '../../src/domain/objects';

const ROOM = roomId('room-detect');
const useCase = new DetectRoomsUseCase();

let seq = 0;

function wall(
  start: Point2D,
  end: Point2D,
  options: { isStructural?: boolean; deleted?: boolean } = {},
): Wall {
  return new Wall({
    id: revitObjectId(`w${seq++}`),
    roomId: ROOM,
    startPoint: start,
    endPoint: end,
    thickness: meters(0.15),
    height: meters(2.8),
    isStructural: options.isStructural ?? true,
    is_deleted: options.deleted ?? false,
  });
}

function rectangle(): Wall[] {
  return [
    wall({ x: 0, y: 0 }, { x: 4, y: 0 }),
    wall({ x: 4, y: 0 }, { x: 4, y: 3 }),
    wall({ x: 4, y: 3 }, { x: 0, y: 3 }),
    wall({ x: 0, y: 3 }, { x: 0, y: 0 }),
  ];
}

beforeEach(() => {
  seq = 0;
});

describe('DetectRoomsUseCase', () => {
  it('sugiere un recinto con el área correcta', () => {
    const { suggestions } = useCase.execute({ walls: rectangle() });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].area).toBeCloseTo(12, 6);
  });

  it('sitúa el centroide dentro del propio polígono sugerido', () => {
    const [sugerencia] = useCase.execute({ walls: rectangle() }).suggestions;

    expect(sugerencia.centroid.x).toBeCloseTo(2, 6);
    expect(sugerencia.centroid.y).toBeCloseTo(1.5, 6);
    expect(isPointInPolygon(sugerencia.centroid, sugerencia.polygon)).toBe(true);
  });

  it('lista los muros del contorno sin repetirlos', () => {
    const muros = rectangle();
    const [sugerencia] = useCase.execute({ walls: muros }).suggestions;

    expect(sugerencia.boundaryWallIds).toHaveLength(4);
    expect(new Set(sugerencia.boundaryWallIds).size).toBe(4);
  });

  it('devuelve el polígono normalizado a 4 vértices', () => {
    const [sugerencia] = useCase.execute({ walls: rectangle() }).suggestions;
    expect(sugerencia.polygon).toHaveLength(4);
  });

  it('no sugiere nada con menos de 3 muros', () => {
    const { suggestions } = useCase.execute({
      walls: [wall({ x: 0, y: 0 }, { x: 4, y: 0 }), wall({ x: 4, y: 0 }, { x: 4, y: 3 })],
    });
    expect(suggestions).toHaveLength(0);
  });

  it('no sugiere nada si el contorno está abierto', () => {
    const abierto = rectangle().slice(0, 3);
    expect(useCase.execute({ walls: abierto }).suggestions).toHaveLength(0);
  });

  it('detecta dos estancias separadas por un tabique portante', () => {
    const muros = [
      wall({ x: 0, y: 0 }, { x: 2, y: 0 }),
      wall({ x: 2, y: 0 }, { x: 4, y: 0 }),
      wall({ x: 4, y: 0 }, { x: 4, y: 3 }),
      wall({ x: 4, y: 3 }, { x: 2, y: 3 }),
      wall({ x: 2, y: 3 }, { x: 0, y: 3 }),
      wall({ x: 0, y: 3 }, { x: 0, y: 0 }),
      wall({ x: 2, y: 0 }, { x: 2, y: 3 }),
    ];

    const { suggestions } = useCase.execute({ walls: muros });

    expect(suggestions).toHaveLength(2);
    // Las dos mitades de un 4×3 partido por la mitad: 6 m² cada una.
    for (const s of suggestions) expect(s.area).toBeCloseTo(6, 6);
  });

  it('cierra el recinto con una unión en T gracias al edge splitting', () => {
    // El último muro termina en mitad del inferior, no en un vértice.
    const muros = [
      wall({ x: 0, y: 0 }, { x: 4, y: 0 }),
      wall({ x: 4, y: 0 }, { x: 4, y: 3 }),
      wall({ x: 4, y: 3 }, { x: 0, y: 3 }),
      wall({ x: 0, y: 3 }, { x: 0, y: 0 }),
      wall({ x: 2, y: 0 }, { x: 2, y: 3 }),
    ];

    expect(useCase.execute({ walls: muros }).suggestions).toHaveLength(2);
  });

  it('ignora los muros marcados como borrados', () => {
    const muros = rectangle();
    muros[3] = wall({ x: 0, y: 3 }, { x: 0, y: 0 }, { deleted: true });

    expect(useCase.execute({ walls: muros }).suggestions).toHaveLength(0);
  });

  it('ignora las particiones no estructurales', () => {
    const muros = rectangle();
    muros[3] = wall({ x: 0, y: 3 }, { x: 0, y: 0 }, { isStructural: false });

    expect(useCase.execute({ walls: muros }).suggestions).toHaveLength(0);
  });

  it('tolera extremos que no coinciden exactamente (levantamiento real)', () => {
    const muros = [
      wall({ x: 0, y: 0 }, { x: 4.01, y: 0.005 }),
      wall({ x: 4, y: 0 }, { x: 3.995, y: 3.01 }),
      wall({ x: 4, y: 3 }, { x: 0.008, y: 2.99 }),
      wall({ x: 0, y: 3 }, { x: 0.002, y: 0.004 }),
    ];

    const { suggestions } = useCase.execute({ walls: muros, snapTolerance: 0.05 });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].area).toBeCloseTo(12, 1);
  });

  it('descarta micro-recintos y explica por qué', () => {
    const diminuto = [
      wall({ x: 0, y: 0 }, { x: 0.05, y: 0 }),
      wall({ x: 0.05, y: 0 }, { x: 0.05, y: 0.05 }),
      wall({ x: 0.05, y: 0.05 }, { x: 0, y: 0 }),
    ];

    const result = useCase.execute({ walls: diminuto, snapTolerance: 0.001, minArea: 1 });
    expect(result.suggestions).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0].reason).toContain('Área insuficiente');
  });

  it('NO persiste nada: es solo una sugerencia', () => {
    // El caso de uso no recibe store alguno; su firma sola lo garantiza.
    const muros = rectangle();
    useCase.execute({ walls: muros });
    for (const m of muros) expect(m.is_deleted).toBe(false);
  });
});
