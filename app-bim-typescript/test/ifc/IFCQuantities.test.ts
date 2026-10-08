// =============================================================================
// IFCQuantities.test.ts — Cantidades BIM del IFC (Qto) y Psets comunes
// =============================================================================
//
// El área lateral NETA del muro descuenta sus puertas y ventanas; la columna
// lleva sección, largo y volumen; todos los elementos llevan su Reference.
// =============================================================================

import { IFCSerializer } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { Column } from '../../src/domain/objects/column';
import { levelId, revitObjectId, roomId, wallId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { lintIfc, ofType, parseStep } from './stepLint';

const R = roomId('q');
const RECT = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 5, y: 4 },
  { x: 0, y: 4 },
];
const walls = RECT.map(
  (p, i) =>
    new Wall({ id: revitObjectId(`w${i}`), roomId: R, startPoint: p, endPoint: RECT[(i + 1) % 4], thickness: meters(0.2), height: meters(3) }),
);
const room = new Room({ id: revitObjectId('q'), roomId: R, levelId: levelId('n0'), geometry: RECT, isOpen: false, isClosed: true, area: squareMeters(20) });
const door = new Door({ id: revitObjectId('d'), roomId: R, parentWallId: wallId('w0'), offsetAlongWall: meters(1), offsetPerpendicular: meters(0), width: meters(1), height: meters(2) });
const column = new Column({
  id: revitObjectId('c'),
  roomId: R,
  position: { x: 2, y: 2 },
  dimensionX: meters(0.4),
  dimensionY: meters(0.3),
  sectionShape: 'rectangular',
  height: meters(3),
  material: 'Concreto 21 MPa',
});

/** Valor de una cantidad por nombre, dentro del IfcElementQuantity del elemento con ese nombre. */
function quantity(content: string, elementName: string, qtoName: string, q: string): number {
  const ents = parseStep(content);
  const el = [...ents.values()].find((e) => e.args[2] === `'${elementName}'`);
  if (!el) throw new Error(`sin elemento ${elementName}`);
  for (const rel of ents.values()) {
    if (rel.type !== 'IFCRELDEFINESBYPROPERTIES' || !rel.args[4].includes(`#${el.id}`)) continue;
    const qto = ents.get(Number(rel.args[5].slice(1)))!;
    if (qto.type !== 'IFCELEMENTQUANTITY' || qto.args[2] !== `'${qtoName}'`) continue;
    for (const id of qto.args[5].replace(/[()#]/g, '').split(',').map(Number)) {
      const v = ents.get(id)!;
      if (v.args[0] === `'${q}'`) return Number(v.args[3]);
    }
  }
  throw new Error(`sin ${qtoName}.${q} en ${elementName}`);
}

describe('IFC — cantidades BIM', () => {
  test('área lateral neta del muro = bruta − puerta; volúmenes; columna con sección y material', async () => {
    const r = await new IFCSerializer().serialize({ room, walls, doors: [door], windows: [], columns: [column], floor: null });
    expect(r.validation.valid).toBe(true);
    expect(lintIfc(r.content)).toEqual([]);

    expect(quantity(r.content, 'Muro 1', 'Qto_WallBaseQuantities', 'GrossSideArea')).toBeCloseTo(15, 3);
    expect(quantity(r.content, 'Muro 1', 'Qto_WallBaseQuantities', 'NetSideArea')).toBeCloseTo(13, 3);
    expect(quantity(r.content, 'Muro 1', 'Qto_WallBaseQuantities', 'NetVolume')).toBeCloseTo(2.6, 3);
    expect(quantity(r.content, 'Muro 2', 'Qto_WallBaseQuantities', 'NetSideArea')).toBeCloseTo(12, 3); // sin huecos

    expect(quantity(r.content, 'Columna 1', 'Qto_ColumnBaseQuantities', 'CrossSectionArea')).toBeCloseTo(0.12, 4);
    expect(quantity(r.content, 'Columna 1', 'Qto_ColumnBaseQuantities', 'GrossVolume')).toBeCloseTo(0.36, 4);
    expect(ofType(r.content, 'IFCMATERIAL').some((m) => m.args[0] === "'Concreto 21 MPa'")).toBe(true);
    expect(r.content).toContain("IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('Columna 1'),$)");
  });
});
