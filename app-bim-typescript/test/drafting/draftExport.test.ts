// =============================================================================
// draftExport.test.ts — Dibujo técnico (F6b) hacia DXF e IFC
// =============================================================================

import { draftDxfEntities, draftIfcMembers, paperHeight } from '../../src/application/drafting/draftExport';
import { DRAFT_DXF_LAYERS, DXFSerializer } from '../../src/infrastructure/export/dxf/DXFSerializer';
import { IFCSerializer } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { IfcLevelInput } from '../../src/infrastructure/export/ifc/types';
import type { DraftItem } from '../../src/domain/drafting/drafting';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { revitObjectId, roomId, levelId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { lintIfc, ofType, parseStep, refsIn, splitArgs } from '../ifc/stepLint';

const plan = { kind: 'plan' } as const;
const face = (wallId: string, side: 'A' | 'B' = 'A') => ({ kind: 'wallFace', wallId, side }) as const;
let n = 0;
const item = (over: Partial<DraftItem> & Pick<DraftItem, 'kind' | 'points'>): DraftItem => ({
  id: `d${++n}`,
  spaceId: 's',
  view: plan,
  levelId: 'n0',
  text: '',
  props: {},
  createdAt: '2026-10-06T00:00:00Z',
  ...over,
});
const coordText = () => ['N 1.000,00', 'E 2.000,00'];

describe('Dibujo técnico → entidades DXF', () => {
  it('los textos miden en el papel: 2,5 mm a 1:50 son 0,125 m', () => {
    expect(paperHeight(2.5, 50)).toBeCloseTo(0.125);
    expect(paperHeight(2.5, 100)).toBeCloseTo(0.25);
  });

  it('una cota sale explotada: 2 líneas de referencia, la de cota, 2 trazos y el valor', () => {
    const e = draftDxfEntities([item({ kind: 'dimension', points: [{ x: 0, y: 0 }, { x: 3.25, y: 0 }], props: { offset: 0.5 } })], {
      denominator: 50,
      coordText,
    });
    expect(e.filter((x) => x.kind === 'line')).toHaveLength(5);
    const txt = e.find((x) => x.kind === 'text')!;
    expect(txt).toMatchObject({ layer: DRAFT_DXF_LAYERS.dims, text: '3.25', center: true });
    expect(txt.kind === 'text' && txt.height).toBeCloseTo(0.125);
    // La línea de cota está desplazada 0,5 m del segmento medido.
    const dimLine = e.filter((x) => x.kind === 'line')[2];
    expect(dimLine.kind === 'line' && Math.abs(dimLine.a.y)).toBeCloseTo(0.5);
  });

  it('viga en planta: dos líneas de trazos a ±base/2 y su sección; lo de alzado no va al plano', () => {
    const e = draftDxfEntities(
      [
        item({ kind: 'beam', points: [{ x: 0, y: 1 }, { x: 4, y: 1 }], props: { width: 0.3, depth: 0.4 } }),
        item({ kind: 'line', view: face('w1'), points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
      ],
      { denominator: 50, coordText },
    );
    const lines = e.filter((x) => x.kind === 'line');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.kind === 'line' && l.dashed && l.layer === DRAFT_DXF_LAYERS.beams)).toBe(true);
    expect(lines.map((l) => (l.kind === 'line' ? l.a.y : 0)).sort()).toEqual([0.85, 1.15].map((v) => expect.closeTo(v)));
    expect(e.find((x) => x.kind === 'text')).toMatchObject({ text: 'V 30x40' });
  });

  it('polígono con su área, coordenada con su rótulo y etiqueta con línea al objeto', () => {
    const e = draftDxfEntities(
      [
        item({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] }),
        item({ kind: 'coordinate', points: [{ x: 5, y: 5 }] }),
        item({ kind: 'tag', points: [{ x: 3, y: 3 }], text: 'Muro · 15 cm', targetId: 'w9' }),
      ],
      { denominator: 50, coordText, targetCenter: (id) => (id === 'w9' ? { x: 1, y: 1 } : null) },
    );
    expect(e.find((x) => x.kind === 'polyline')).toMatchObject({ layer: DRAFT_DXF_LAYERS.areas, closed: true });
    expect(e.some((x) => x.kind === 'text' && x.text === '1.00 m2')).toBe(true);
    expect(e.filter((x) => x.kind === 'text' && x.layer === DRAFT_DXF_LAYERS.coords).map((x) => x.kind === 'text' && x.text)).toEqual(coordText());
    expect(e.some((x) => x.kind === 'line' && x.layer === DRAFT_DXF_LAYERS.tags && x.a.x === 1 && x.b.x === 3)).toBe(true);
  });
});

describe('DXFSerializer con dibujo técnico', () => {
  const pairs = (dxf: string) => {
    const l = dxf.split('\n');
    const out: [string, string][] = [];
    for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i], l[i + 1]]);
    return out;
  };

  it('declara las capas y el tipo de línea DASHED, y la viga lo usa', () => {
    const drafting = draftDxfEntities([item({ kind: 'beam', points: [{ x: 0, y: 1 }, { x: 4, y: 1 }] })], { denominator: 50, coordText });
    const dxf = new DXFSerializer().serialize({ title: 'T', room: null, walls: [], columns: [], drafting });
    const p = pairs(dxf);
    // Cada capa del dibujo está declarada en la tabla LAYER (par 2 = nombre).
    const names = new Set(p.filter(([c]) => c === '2').map(([, v]) => v));
    for (const name of Object.values(DRAFT_DXF_LAYERS)) expect(names.has(name)).toBe(true);
    expect(p.some(([c, v]) => c === '2' && v === 'DASHED')).toBe(true);
    expect(p.filter(([c, v]) => c === '6' && v === 'DASHED')).toHaveLength(2);
    // Y arriba: la viga dibujada en y = 1 (modelo) sale en y ≈ −1.
    const ys = p.filter(([c]) => c === '20').map(([, v]) => Number(v));
    expect(ys.some((y) => Math.abs(y + 0.85) < 1e-6)).toBe(true);
  });

  it('los recintos salen con Y arriba como los muros (antes, espejados norte-sur)', () => {
    const dxf = new DXFSerializer().serialize({
      title: 'T',
      room: null,
      walls: [],
      columns: [],
      zones: [{ code: 'R-01', name: 'Sala', polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], netArea: 12, label: { x: 2, y: 1.5 } }],
    });
    const ys = pairs(dxf)
      .filter(([c]) => c === '20')
      .map(([, v]) => Number(v));
    expect(ys).toContain(-3);
    expect(ys).not.toContain(3);
  });
});

describe('Dibujo técnico → IFC (vigas, cerchas, correas)', () => {
  const LEVELS: IfcLevelInput[] = [
    { id: 'n0', name: 'Nivel 0', elevation: 0, isBase: true },
    { id: 'n1', name: 'Nivel 1', elevation: 3 },
  ];
  const wall = (id: string, s: [number, number], e: [number, number]) =>
    new Wall({
      id: revitObjectId(id),
      roomId: roomId('r'),
      startPoint: { x: s[0], y: s[1] },
      endPoint: { x: e[0], y: e[1] },
      thickness: meters(0.2),
      height: meters(3),
    });
  const room = new Room({
    id: revitObjectId('r'),
    roomId: roomId('r'),
    levelId: levelId('l'),
    geometry: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ],
    isOpen: false,
    isClosed: true,
    area: squareMeters(20),
  });
  const walls = [wall('w1', [0, 0], [5, 0]), wall('w2', [5, 0], [5, 4]), wall('w3', [5, 4], [0, 4]), wall('w4', [0, 4], [0, 0])];
  const serialize = (items: DraftItem[]) =>
    new IFCSerializer().serialize({ room, walls, doors: [], windows: [], columns: [], floor: null, levels: LEVELS, members: draftIfcMembers(items) });

  /** Origen (x, y, z) y eje Z de la colocación de un producto. */
  function placementOf(content: string, entityId: number) {
    const ents = parseStep(content);
    const lp = ents.get(refsIn(ents.get(entityId)!.args[5])[0])!;
    const ax = ents.get(refsIn(lp.args[1])[0])!;
    const nums = (id: number) => splitArgs(ents.get(id)!.args[0].replace(/^\(|\)$/g, '')).map(Number);
    return { origin: nums(refsIn(ax.args[0])[0]), axis: nums(refsIn(ax.args[1])[0]) };
  }

  it('cuenta barras: viga 1, cercha de 4 paños = 5 cordones + 7 de alma, correa 1', () => {
    const m = draftIfcMembers([
      item({ kind: 'beam', points: [{ x: 0, y: 1 }, { x: 4, y: 1 }] }),
      item({ kind: 'truss', view: face('w1'), points: [{ x: 0.5, y: 2 }, { x: 4.5, y: 2 }] }),
      item({ kind: 'purlin', view: face('w1'), points: [{ x: 2, y: 2.5 }] }),
    ]);
    expect(m.filter((x) => x.role === 'beam')).toHaveLength(1);
    expect(m.filter((x) => x.role === 'chord')).toHaveLength(5);
    expect(m.filter((x) => x.role === 'web')).toHaveLength(7);
    expect(m.filter((x) => x.role === 'purlin')).toHaveLength(1);
  });

  it('viga de planta: IfcBeam con su cara superior en el nivel de encima; el archivo pasa el lint', async () => {
    const r = await serialize([item({ kind: 'beam', points: [{ x: 0, y: 1 }, { x: 4, y: 1 }], props: { width: 0.3, depth: 0.4 } })]);
    expect(lintIfc(r.content)).toEqual([]);
    const beams = ofType(r.content, 'IFCBEAM');
    expect(beams).toHaveLength(1);
    const { origin, axis } = placementOf(r.content, beams[0].id);
    expect(origin[2]).toBeCloseTo(3); // nivel 1 (relativo al piso 0, cota 0)
    expect(origin[1]).toBeCloseTo(-1); // Y arriba
    expect(axis).toEqual([1, 0, 0].map((v) => expect.closeTo(v)));
  });

  it('viga de alzado: a lo largo del muro y a la altura dibujada sobre su base', async () => {
    const r = await serialize([item({ kind: 'beam', view: face('w1'), levelId: '', points: [{ x: 1, y: 2.5 }, { x: 3, y: 2.5 }] })]);
    const { origin } = placementOf(r.content, ofType(r.content, 'IFCBEAM')[0].id);
    expect(origin).toEqual([1, 0, 2.5].map((v) => expect.closeTo(v)));
  });

  it('cercha y correa: IfcMember CHORD/STRUT/PURLIN; la correa sale perpendicular por su lado', async () => {
    const r = await serialize([
      item({ kind: 'truss', view: face('w1'), levelId: '', points: [{ x: 0.5, y: 2 }, { x: 4.5, y: 2 }] }),
      item({ kind: 'purlin', view: face('w1', 'A'), levelId: '', points: [{ x: 2, y: 2.5 }] }),
    ]);
    expect(lintIfc(r.content)).toEqual([]);
    const members = ofType(r.content, 'IFCMEMBER');
    const types = members.map((m) => m.args[8]);
    expect(types.filter((t) => t === '.CHORD.')).toHaveLength(5);
    expect(types.filter((t) => t === '.STRUT.')).toHaveLength(7);
    const purlin = members.find((m) => m.args[8] === '.PURLIN.')!;
    const { origin, axis } = placementOf(r.content, purlin.id);
    // Lado A del muro (0,0)→(5,0): normal (0, 1) del modelo (Y abajo) = (0, −1) con Y arriba.
    expect(origin).toEqual([2, -0.1, 2.5].map((v) => expect.closeTo(v)));
    expect(axis).toEqual([0, -1, 0].map((v) => expect.closeTo(v)));
  });

  it('una barra de un muro que ya no existe se omite sin romper el archivo', async () => {
    const r = await serialize([item({ kind: 'beam', view: face('borrado'), points: [{ x: 0, y: 1 }, { x: 2, y: 1 }] })]);
    expect(ofType(r.content, 'IFCBEAM')).toHaveLength(0);
    expect(lintIfc(r.content)).toEqual([]);
  });
});
