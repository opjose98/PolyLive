// =============================================================================
// samples.test.ts — IFC y DXF de muestra para validarlos con herramientas externas
// =============================================================================
//
// Con EXPORT_SAMPLES=<carpeta> escribe un IFC y un DXF de un recinto completo
// (muros, puerta, ventana, columna, recinto, dibujo técnico, vigas, cerchas y
// correas). La CI los valida con ifcopenshell y ezdxf
// (scripts/validate_exports.py). Sin la variable, solo comprueba que se generan.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { IFCSerializer } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { DXFSerializer } from '../../src/infrastructure/export/dxf/DXFSerializer';
import { draftDxfEntities, draftIfcMembers } from '../../src/application/drafting/draftExport';
import type { DraftItem } from '../../src/domain/drafting/drafting';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { Column } from '../../src/domain/objects/column';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { revitObjectId, roomId, levelId, wallId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';

const R = roomId('sample');
const wall = (id: string, s: [number, number], e: [number, number]) =>
  new Wall({ id: revitObjectId(id), roomId: R, startPoint: { x: s[0], y: s[1] }, endPoint: { x: e[0], y: e[1] }, thickness: meters(0.2), height: meters(2.6) });
const walls = [wall('w1', [0, 0], [6, 0]), wall('w2', [6, 0], [6, 4]), wall('w3', [6, 4], [0, 4]), wall('w4', [0, 4], [0, 0])];
const room = new Room({
  id: revitObjectId('sample'),
  roomId: R,
  levelId: levelId('n0'),
  geometry: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ],
  isOpen: false,
  isClosed: true,
  area: squareMeters(24),
  properties: { name: 'Sala de muestra' },
});
const door = new Door({ id: revitObjectId('d1'), roomId: R, parentWallId: wallId('w1'), offsetAlongWall: meters(1), width: meters(0.9), height: meters(2.1) });
const win = new Window({ id: revitObjectId('v1'), roomId: R, parentWallId: wallId('w2'), offsetAlongWall: meters(1.5), width: meters(1.2), height: meters(1.2) });
const col = new Column({ id: revitObjectId('c1'), roomId: R, position: { x: 3, y: 2 }, dimensionX: meters(0.3), dimensionY: meters(0.3), height: meters(2.6) });

let n = 0;
const item = (o: Partial<DraftItem> & Pick<DraftItem, 'kind' | 'points'>): DraftItem => ({
  id: `s${++n}`,
  spaceId: 'sample',
  view: { kind: 'plan' },
  levelId: 'n0',
  text: '',
  props: {},
  createdAt: '2026-10-06',
  ...o,
});
const drafts: DraftItem[] = [
  item({ kind: 'dimension', points: [{ x: 0.1, y: 0.1 }, { x: 5.9, y: 0.1 }], props: { offset: 0.5 } }),
  item({ kind: 'text', points: [{ x: 2, y: 2 }], text: 'Sala · muestra (ñ, ó, m²)' }),
  item({ kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }),
  item({ kind: 'beam', points: [{ x: 0, y: 2 }, { x: 6, y: 2 }], props: { width: 0.3, depth: 0.4 } }),
  item({ kind: 'truss', view: { kind: 'wallFace', wallId: 'w1', side: 'A' }, levelId: '', points: [{ x: 0.5, y: 2.6 }, { x: 5.5, y: 2.6 }] }),
  item({ kind: 'purlin', view: { kind: 'wallFace', wallId: 'w3', side: 'A' }, levelId: '', points: [{ x: 3, y: 2.4 }] }),
];

describe('Muestras de exportación (validación externa en CI)', () => {
  it('genera un IFC y un DXF completos', async () => {
    const ifc = await new IFCSerializer().serialize({
      room,
      walls,
      doors: [door],
      windows: [win],
      columns: [col],
      floor: null,
      levels: [{ id: 'n0', name: 'Nivel 0', elevation: 0, isBase: true }],
      projectName: 'Muestra CI',
      projectKey: 'ci-sample',
      members: draftIfcMembers(drafts),
    });
    expect(ifc.validation.valid).toBe(true);
    const dxf = new DXFSerializer().serialize({
      title: 'Muestra CI',
      room,
      walls,
      columns: [col],
      drafting: draftDxfEntities(drafts, { denominator: 50, coordText: () => ['X 1,00', 'Y 2,00'] }),
    });
    expect(dxf).toContain('EOF');
    const out = process.env.EXPORT_SAMPLES;
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'sample.ifc'), ifc.content);
      fs.writeFileSync(path.join(out, 'sample.dxf'), dxf);
    }
  });
});
