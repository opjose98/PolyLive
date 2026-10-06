// =============================================================================
// IFCRevitExport.test.ts — El IFC que se lleva a Revit
// =============================================================================
//
// Cubre lo que el exportador anterior no hacía: pisos por nivel, restricciones
// de base y tope, muros con perfil, vanos relativos al muro, GUIDs estables y
// un archivo que cumple el esquema IFC4 (stepLint).
// =============================================================================

import { IFCSerializer, REVIT_CONSTRAINTS_PSET } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { SerializeInput, IfcLevelInput } from '../../src/infrastructure/export/ifc/types';
import {
  compressGuidBytes,
  expandGuid,
  generateGuid,
  isValidIfcGuid,
  stableGuid,
} from '../../src/infrastructure/export/ifc/guid-generator';
import { stepReal, stepString } from '../../src/infrastructure/export/ifc/step-writer';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { Column } from '../../src/domain/objects/column';
import { Floor } from '../../src/domain/objects/floor';
import { revitObjectId, roomId, levelId, wallId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { WallVertical, extent, uniformWall } from '../../src/domain/objects/vertical';
import { PHASE_PROP } from '../../src/domain/objects/marker';
import { lintIfc, ofType, parseStep, refsIn, splitArgs } from './stepLint';

const LEVELS: IfcLevelInput[] = [
  { id: 'n0', name: 'Nivel 0', elevation: 0, isBase: true },
  { id: 'n1', name: 'Nivel 1', elevation: 3 },
  { id: 'n2', name: 'Nivel 2', elevation: 6 },
];

const room = () =>
  new Room({
    id: revitObjectId('room-1'),
    roomId: roomId('room-1'),
    levelId: levelId('level-1'),
    geometry: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ],
    isOpen: false,
    isClosed: true,
    area: squareMeters(20),
    properties: { name: 'Sala de máquinas' },
  });

const wall = (id: string, s: [number, number], e: [number, number], vertical?: WallVertical, props?: Record<string, unknown>) =>
  new Wall({
    id: revitObjectId(id),
    roomId: roomId('room-1'),
    startPoint: { x: s[0], y: s[1] },
    endPoint: { x: e[0], y: e[1] },
    thickness: meters(0.2),
    height: meters(3),
    vertical,
    properties: props,
  });

const box = (vertical?: WallVertical): Wall[] => [
  wall('w1', [0, 0], [5, 0], vertical),
  wall('w2', [5, 0], [5, 4], vertical),
  wall('w3', [5, 4], [0, 4], vertical),
  wall('w4', [0, 4], [0, 0], vertical),
];

const input = (over: Partial<SerializeInput> = {}): SerializeInput => ({
  room: room(),
  walls: box(),
  doors: [],
  windows: [],
  columns: [],
  floor: null,
  levels: LEVELS,
  projectName: 'Edificio Ñuñoa',
  projectKey: 'proj-1',
  ...over,
});

const serialize = (over: Partial<SerializeInput> = {}) => new IFCSerializer().serialize(input(over));

/** Propiedades del Pset de restricciones de un elemento, por nombre. */
function constraintsOf(content: string, elementId: number): Record<string, string> {
  const ents = parseStep(content);
  const out: Record<string, string> = {};
  for (const e of ents.values()) {
    if (e.type !== 'IFCRELDEFINESBYPROPERTIES' || !refsIn(e.args[4]).includes(elementId)) continue;
    const pset = ents.get(refsIn(e.args[5])[0])!;
    if (pset.type !== 'IFCPROPERTYSET' || !pset.args[2].includes(REVIT_CONSTRAINTS_PSET)) continue;
    for (const r of refsIn(pset.args[4])) {
      const p = ents.get(r)!;
      out[p.args[0].replace(/'/g, '')] = p.args[2];
    }
  }
  return out;
}

describe('GUIDs IFC', () => {
  it('comprime con el formato estándar (primer carácter 0–3) y es reversible', () => {
    const bytes = Array.from({ length: 16 }, (_, i) => (i * 37 + 250) % 256);
    const g = compressGuidBytes(bytes);
    expect(g).toHaveLength(22);
    expect('0123').toContain(g[0]);
    expect(expandGuid(g)).toEqual(bytes);
    // Vector conocido: el GUID nulo y el máximo.
    expect(compressGuidBytes(new Array(16).fill(0))).toBe('0000000000000000000000');
    expect(compressGuidBytes(new Array(16).fill(255))).toBe('3$$$$$$$$$$$$$$$$$$$$$');
  });

  it('los aleatorios son válidos y los estables se repiten por clave', () => {
    for (let i = 0; i < 200; i++) expect(isValidIfcGuid(generateGuid())).toBe(true);
    expect(stableGuid('muro-1')).toBe(stableGuid('muro-1'));
    expect(stableGuid('muro-1')).not.toBe(stableGuid('muro-2'));
    expect(isValidIfcGuid(stableGuid('x'))).toBe(true);
  });

  it('rechaza un GUID cuyo primer carácter no es 0–3', () => {
    expect(isValidIfcGuid('A000000000000000000000')).toBe(false);
  });
});

describe('Formato STEP', () => {
  it('los REAL llevan punto y el texto no ASCII se codifica', () => {
    expect(stepReal(3)).toBe('3.');
    expect(stepReal(-0)).toBe('0.');
    expect(stepReal(2.8)).toBe('2.8');
    expect(stepString("Muro d'Ñandú")).toBe("'Muro d''\\X2\\00D1\\X0\\and\\X2\\00FA\\X0\\'");
  });

  it('splitArgs respeta cadenas con comas y paréntesis', () => {
    expect(splitArgs("'a,b',(#1,#2),$")).toEqual(["'a,b'", '(#1,#2)', '$']);
  });
});

describe('IFCSerializer — Revit', () => {
  it('el archivo cumple el esquema IFC4 (atributos, referencias, GUIDs, contención)', async () => {
    const vertical = uniformWall(extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 2.8 }));
    const walls = box(vertical);
    const sloped = wall('w5', [0, 0], [5, 4], {
      start: extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 3 }),
      end: extent({ baseLevelId: 'n1', topLevelId: 'n2', unconnectedHeight: 3 }),
    });
    const door = new Door({
      id: revitObjectId('d1'),
      roomId: roomId('room-1'),
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1),
      offsetPerpendicular: meters(0),
      width: meters(0.9),
      height: meters(2.1),
    });
    const win = new Window({
      id: revitObjectId('v1'),
      roomId: roomId('room-1'),
      parentWallId: wallId('w5'),
      offsetAlongWall: meters(2),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1),
    });
    const col = new Column({
      id: revitObjectId('c1'),
      roomId: roomId('room-1'),
      position: { x: 2, y: 2 },
      diameter: meters(0.3),
      sectionShape: 'rectangular',
      height: meters(3),
      vertical: extent({ baseLevelId: 'n1', topLevelId: 'n2', unconnectedHeight: 3 }),
    });
    const circ = new Column({ id: revitObjectId('c2'), roomId: roomId('room-1'), position: { x: 1, y: 1 }, diameter: meters(0.3), height: meters(3) });
    const r = await serialize({ walls: [...walls, sloped], doors: [door], windows: [win], columns: [col, circ], openingSills: new Map([['v1', 1]]) });
    expect(r.validation.valid).toBe(true);
    expect(lintIfc(r.content)).toEqual([]);
  });

  it('crea un IfcBuildingStorey por nivel, con su cota', async () => {
    const r = await serialize();
    const storeys = ofType(r.content, 'IFCBUILDINGSTOREY');
    expect(storeys.map((s) => [s.args[2], s.args[9]])).toEqual([
      ["'Nivel 0'", '0.'],
      ["'Nivel 1'", '3.'],
      ["'Nivel 2'", '6.'],
    ]);
  });

  it('sin niveles, exporta un piso base con todo dentro', async () => {
    const r = await serialize({ levels: undefined });
    expect(ofType(r.content, 'IFCBUILDINGSTOREY')).toHaveLength(1);
    expect(lintIfc(r.content)).toEqual([]);
  });

  it('cada muro cuelga del piso de su base, con la altura entre sus niveles', async () => {
    const onN1 = uniformWall(extent({ baseLevelId: 'n1', topLevelId: 'n2', unconnectedHeight: 2.8 }));
    const r = await serialize({ walls: [wall('w1', [0, 0], [5, 0], onN1)] });
    const ents = parseStep(r.content);
    const w = ofType(r.content, 'IFCWALLSTANDARDCASE')[0];
    const contain = ofType(r.content, 'IFCRELCONTAINEDINSPATIALSTRUCTURE').find((c) => refsIn(c.args[4]).includes(w.id))!;
    expect(ents.get(refsIn(contain.args[5])[0])!.args[2]).toBe("'Nivel 1'");
    // La extrusión es de 3 m (Nivel 1 → Nivel 2).
    const solids = ofType(r.content, 'IFCEXTRUDEDAREASOLID').map((s) => s.args[3]);
    expect(solids).toContain('3.');

    const c = constraintsOf(r.content, w.id);
    expect(c.BaseConstraint).toBe("IFCLABEL('Nivel 1')");
    expect(c.TopConstraint).toBe("IFCLABEL('Nivel 2')");
    expect(c.ProfileEdited).toBe('IFCBOOLEAN(.F.)');
  });

  it('un muro con tope desconectado exporta su altura desconectada', async () => {
    const free = uniformWall(extent({ baseLevelId: 'n0', unconnectedHeight: 2.45 }));
    const r = await serialize({ walls: [wall('w1', [0, 0], [5, 0], free)] });
    const w = ofType(r.content, 'IFCWALLSTANDARDCASE')[0];
    const c = constraintsOf(r.content, w.id);
    expect(c.TopConstraint).toBe("IFCLABEL('Unconnected')");
    expect(c.UnconnectedHeight).toBe('IFCLENGTHMEASURE(2.45)');
  });

  it('un muro con perfil (extremos a niveles distintos) es IfcWall con su alzado extruido', async () => {
    const v: WallVertical = {
      start: extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 3 }),
      end: extent({ baseLevelId: 'n0', topLevelId: 'n2', unconnectedHeight: 3 }),
    };
    const r = await serialize({ walls: [wall('w1', [0, 0], [5, 0], v)] });
    expect(ofType(r.content, 'IFCWALLSTANDARDCASE')).toHaveLength(0);
    const w = ofType(r.content, 'IFCWALL')[0];
    expect(w).toBeDefined();

    const ents = parseStep(r.content);
    const profiles = ofType(r.content, 'IFCARBITRARYCLOSEDPROFILEDEF');
    // Trapecio: 0,0 → 5,0 → 5,6 → 0,3 (cerrado).
    const trapezoid = profiles.find((p) => {
      const poly = ents.get(refsIn(p.args[2])[0])!;
      const pts = refsIn(poly.args[0]).map((id) => ents.get(id)!.args[0]);
      return pts.join(' ') === '(0.,0.) (5.,0.) (5.,6.) (0.,3.) (0.,0.)';
    });
    expect(trapezoid).toBeDefined();

    const c = constraintsOf(r.content, w.id);
    expect(c.ProfileEdited).toBe('IFCBOOLEAN(.T.)');
    expect(c.TopConstraint).toBe("IFCLABEL('Nivel 2')");
    expect(c.StartTopElevation).toBe('IFCLENGTHMEASURE(3.)');
    expect(c.EndTopElevation).toBe('IFCLENGTHMEASURE(6.)');
    expect(lintIfc(r.content)).toEqual([]);
  });

  it('el vano se coloca relativo a su muro, al antepecho indicado', async () => {
    const win = new Window({
      id: revitObjectId('v1'),
      roomId: roomId('room-1'),
      parentWallId: wallId('w1'),
      offsetAlongWall: meters(1.5),
      offsetPerpendicular: meters(0),
      width: meters(1.2),
      height: meters(1),
    });
    const r = await serialize({ windows: [win], openingSills: new Map([['v1', 0.95]]) });
    const ents = parseStep(r.content);
    const opening = ofType(r.content, 'IFCOPENINGELEMENT')[0];
    const placement = ents.get(refsIn(opening.args[5])[0])!;
    const relTo = ents.get(refsIn(placement.args[0])[0])!;
    const wallEnt = ofType(r.content, 'IFCWALLSTANDARDCASE').find((w) => refsIn(w.args[5])[0] === relTo.id);
    expect(wallEnt).toBeDefined();
    const axis = ents.get(refsIn(placement.args[1])[0])!;
    expect(ents.get(refsIn(axis.args[0])[0])!.args[0]).toBe('(1.5,0.,0.95)');
  });

  it('los GUIDs de los elementos son estables entre exportaciones', async () => {
    const a = await serialize();
    const b = await serialize();
    const guids = (c: string) => ofType(c, 'IFCWALLSTANDARDCASE').map((w) => w.args[0]);
    expect(guids(a.content)).toEqual(guids(b.content));
    expect(ofType(a.content, 'IFCPROJECT')[0].args[0]).toBe(ofType(b.content, 'IFCPROJECT')[0].args[0]);
  });

  it('rotula la fase de cada elemento', async () => {
    const r = await serialize({
      walls: [wall('w1', [0, 0], [5, 0], undefined, { [PHASE_PROP]: 'f1' })],
      phaseNames: new Map([['f1', 'Demolición']]),
    });
    const w = ofType(r.content, 'IFCWALLSTANDARDCASE')[0];
    expect(constraintsOf(r.content, w.id).Phase).toBe("IFCLABEL('Demolici\\X2\\00F3\\X0\\n')");
  });

  it('un muro rectangular lleva uso de capas de material (standard case válido)', async () => {
    const r = await serialize();
    const usages = ofType(r.content, 'IFCMATERIALLAYERSETUSAGE');
    expect(usages.length).toBe(4);
    expect(usages[0].args.slice(1, 4)).toEqual(['.AXIS2.', '.POSITIVE.', '-0.1']);
    // Un solo conjunto de capas compartido: mismo material y espesor.
    expect(ofType(r.content, 'IFCMATERIALLAYERSET')).toHaveLength(1);
  });
});

describe('IFCSerializer — recintos con identidad (T0)', () => {
  const zone = (id: string, code: string, name: string, levelId: string, x0: number, x1: number) => ({
    id,
    code,
    name,
    levelId,
    netPolygon: [
      { x: x0 + 0.1, y: 0.1 },
      { x: x1 - 0.1, y: 0.1 },
      { x: x1 - 0.1, y: 3.9 },
      { x: x0 + 0.1, y: 3.9 },
    ],
    netArea: (x1 - x0 - 0.2) * 3.8,
    grossArea: (x1 - x0) * 4,
    perimeter: 2 * (x1 - x0 - 0.2 + 3.8),
  });

  it('un IfcSpace por recinto, en el piso de su nivel, con número, nombre y cantidades', async () => {
    const r = await serialize({
      zones: [zone('za', 'R-01', 'Cocina', 'n0', 0, 2.5), zone('zb', 'R-02', 'Baño', 'n0', 2.5, 5), zone('zc', 'R-03', 'Estudio', 'n1', 0, 5)],
    });
    expect(lintIfc(r.content)).toEqual([]);
    const spaces = ofType(r.content, 'IFCSPACE');
    expect(spaces).toHaveLength(3);
    expect(spaces.map((s) => [s.args[2], s.args[7]])).toEqual([
      ["'R-01'", "'Cocina'"],
      ["'R-02'", stepString('Baño')],
      ["'R-03'", "'Estudio'"],
    ]);
    // GUID estable por recinto.
    expect(spaces[0].args[0]).toBe(`'${stableGuid('zone:za')}'`);

    // Agregados a su piso: los dos primeros al Nivel 0, el tercero al Nivel 1.
    const ents = parseStep(r.content);
    const storeyName = (spaceId: number) => {
      const rel = [...ents.values()].find((e) => e.type === 'IFCRELAGGREGATES' && refsIn(e.args[5]).includes(spaceId))!;
      return ents.get(refsIn(rel.args[4])[0])!.args[2];
    };
    expect(storeyName(spaces[0].id)).toBe("'Nivel 0'");
    expect(storeyName(spaces[2].id)).toBe("'Nivel 1'");

    const qto = ofType(r.content, 'IFCQUANTITYAREA').map((q) => q.args[0]);
    expect(qto).toContain("'NetFloorArea'");
    expect(qto).toContain("'GrossFloorArea'");
  });

  it('sin recintos se conserva el IfcSpace único del espacio', async () => {
    const r = await serialize();
    expect(ofType(r.content, 'IFCSPACE')).toHaveLength(1);
  });
});

describe('IFCSerializer — suelos de recinto (F6a)', () => {
  it('un IfcSlab por suelo ligado, con el contorno neto de su recinto', async () => {
    const z = {
      id: 'za',
      code: 'R-01',
      name: 'Cocina',
      levelId: 'n1',
      netPolygon: [{ x: 0.1, y: 0.1 }, { x: 4.9, y: 0.1 }, { x: 4.9, y: 3.9 }, { x: 0.1, y: 3.9 }],
      netArea: 18.24,
      grossArea: 20,
      perimeter: 17.2,
    };
    const f = new Floor({ id: revitObjectId('f1'), roomId: roomId('room-1'), isImplicit: false, thickness: meters(0.12), properties: { zoneId: 'za' } });
    const r = await serialize({ zones: [z], zoneFloors: [f] });
    expect(lintIfc(r.content)).toEqual([]);
    const slabs = ofType(r.content, 'IFCSLAB');
    expect(slabs).toHaveLength(1);
    expect(slabs[0].args[0]).toBe(`'${stableGuid('f1')}'`);
    expect(slabs[0].args[2]).toBe("'Suelo R-01'");
  });
});

describe('IFCSerializer — georreferencia (M2b)', () => {
  it('escribe IfcProjectedCRS e IfcMapConversion contra el contexto del modelo', async () => {
    const r = await serialize({
      mapConversion: {
        crsName: 'EPSG:9377',
        crsDescription: 'MAGNA-SIRGAS 2018 / Origen-Nacional',
        eastings: 4880000.5,
        northings: 2070000.25,
        orthogonalHeight: 2600,
        xAxisAbscissa: Math.cos(0.4),
        xAxisOrdinate: Math.sin(0.4),
        scale: 1,
      },
    });
    expect(lintIfc(r.content)).toEqual([]);
    const [mc] = ofType(r.content, 'IFCMAPCONVERSION');
    expect(mc.args[2]).toBe('4880000.5');
    expect(mc.args[4]).toBe('2600.');
    expect(ofType(r.content, 'IFCPROJECTEDCRS')[0].args[0]).toBe("'EPSG:9377'");
  });

  it('sin amarre no hay georreferencia', async () => {
    const r = await serialize();
    expect(ofType(r.content, 'IFCMAPCONVERSION')).toHaveLength(0);
  });
});
