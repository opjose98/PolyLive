// =============================================================================
// IFCProjectExport.test.ts — El proyecto completo en un solo IFC
// =============================================================================
//
// Dos espacios en un archivo: un solo IfcProject/IfcSite/IfcBuilding, los
// elementos de ambos, el segundo desplazado según su ubicación (amarre), y el
// espacio que no pasa la validación se omite e informa.
// =============================================================================

import { IFCSerializer, type SpaceContent } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { levelId, revitObjectId, roomId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { lintIfc, ofType } from './stepLint';

const RECT = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 4 },
  { x: 0, y: 4 },
];

function space(id: string, opts: { thickness?: number; placement?: SpaceContent['placement'] } = {}): SpaceContent {
  const room = new Room({
    id: revitObjectId(id),
    roomId: roomId(id),
    levelId: levelId('level-1'),
    geometry: RECT,
    isOpen: false,
    isClosed: true,
    area: squareMeters(20),
    properties: { name: `Espacio ${id}` },
  });
  const walls = RECT.map(
    (p, i) =>
      new Wall({
        id: revitObjectId(`${id}-w${i}`),
        roomId: roomId(id),
        startPoint: p,
        endPoint: RECT[(i + 1) % RECT.length],
        thickness: meters(opts.thickness ?? 0.15),
        height: meters(3),
      }),
  );
  return { room, walls, doors: [], windows: [], columns: [], floor: null, placement: opts.placement };
}

describe('IFCSerializer.serializeProject', () => {
  test('dos espacios: un proyecto, los muros de ambos, archivo IFC4 válido', async () => {
    const r = await new IFCSerializer().serializeProject({
      projectName: 'Casa',
      spaces: [space('a'), space('b', { placement: { x: 10, y: 0, rotation: 0 } })],
    });
    expect(r.spaces).toBe(2);
    expect(r.skipped).toEqual([]);
    expect(ofType(r.content, 'IFCPROJECT')).toHaveLength(1);
    expect(ofType(r.content, 'IFCSITE')).toHaveLength(1);
    expect(ofType(r.content, 'IFCBUILDING')).toHaveLength(1);
    expect(ofType(r.content, 'IFCWALL')).toHaveLength(8);
    expect(lintIfc(r.content)).toEqual([]);
  });

  test('el espacio con ubicación queda desplazado en el proyecto', async () => {
    const r = await new IFCSerializer().serializeProject({
      spaces: [space('a'), space('b', { placement: { x: 10, y: 0, rotation: 0 } })],
    });
    expect(r.content).toMatch(/IFCCARTESIANPOINT\(\(10\.0*,0\.0*,0\.0*\)\)/);
  });

  test('un espacio inválido se omite y se informa; el resto sale', async () => {
    const r = await new IFCSerializer().serializeProject({ spaces: [space('a'), space('b', { thickness: 0 })] });
    expect(r.spaces).toBe(1);
    expect(r.skipped.map((s) => s.name)).toEqual(['Espacio b']);
    expect(ofType(r.content, 'IFCWALL')).toHaveLength(4);
  });

  test('si ninguno es válido no hay archivo', async () => {
    const r = await new IFCSerializer().serializeProject({ spaces: [space('b', { thickness: 0 })] });
    expect(r.content).toBe('');
    expect(r.spaces).toBe(0);
  });
});
