// =============================================================================
// vertical.test.ts — Restricciones de base y tope (Revit) y su alzado
// =============================================================================

import {
  extent,
  extentAt,
  hostLevelOf,
  profileArea,
  profileAt,
  profileOutline,
  profileTop,
  isRectangularProfile,
  parseWallVertical,
  profileProblem,
  profileSpans,
  resolveExtent,
  resolveWallProfile,
  revitConstraints,
  uniformWall,
  wallVerticalOf,
} from '../../src/domain/objects/vertical';
import {
  computeQuantification,
  levelsFromProfile,
  WallElevation,
  wallOpeningId,
} from '../../src/domain/objects/wall-elevation';

const LV = new Map([
  ['n0', 0],
  ['n1', 3],
  ['n2', 6],
]);

describe('resolución de restricciones', () => {
  it('base y tope atados a niveles, con desfases', () => {
    expect(resolveExtent(extent({ baseLevelId: 'n1', baseOffset: 0.1, topLevelId: 'n2', topOffset: -0.2, unconnectedHeight: 9 }), LV)).toEqual({
      base: 3.1,
      top: 5.8,
    });
  });

  it('sin nivel de tope, la altura desconectada', () => {
    expect(resolveExtent(extent({ baseLevelId: 'n1', unconnectedHeight: 2.5 }), LV)).toEqual({ base: 3, top: 5.5 });
  });

  it('un nivel borrado: la base cae a cota 0 y el tope a la altura desconectada', () => {
    expect(resolveExtent(extent({ baseLevelId: 'gone', topLevelId: 'gone2', unconnectedHeight: 2.8 }), LV)).toEqual({
      base: 0,
      top: 2.8,
    });
  });

  it('detecta un tope por debajo de la base', () => {
    const p = resolveWallProfile(uniformWall(extent({ baseLevelId: 'n1', topLevelId: 'n0', unconnectedHeight: 3 })), LV);
    expect(profileProblem(p)).toMatch(/por debajo/);
  });
});

describe('equivalencia con Revit', () => {
  it('muro rectangular: restricciones directas', () => {
    const v = uniformWall(extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 3 }));
    expect(revitConstraints(v, LV)).toEqual({
      baseLevelId: 'n0',
      baseOffset: 0,
      topLevelId: 'n1',
      topOffset: 0,
      unconnectedHeight: 3,
      profileEdited: false,
    });
  });

  it('perfil editado: la caja envolvente (base más baja, tope más alto)', () => {
    const v = {
      start: extent({ baseLevelId: 'n1', topLevelId: 'n2', unconnectedHeight: 3 }),
      end: extent({ baseLevelId: 'n0', baseOffset: 0.5, topLevelId: 'n1', unconnectedHeight: 3 }),
    };
    const rc = revitConstraints(v, LV);
    expect(rc).toMatchObject({ baseLevelId: 'n0', baseOffset: 0.5, topLevelId: 'n2', profileEdited: true });
    expect(rc.unconnectedHeight).toBeCloseTo(5.5);
    expect(hostLevelOf(v, LV)).toBe('n0');
    expect(isRectangularProfile(resolveWallProfile(v, LV))).toBe(false);
  });

  it('atraviesa una cota si está entre su base más baja y su tope más alto', () => {
    const p = resolveWallProfile(uniformWall(extent({ baseLevelId: 'n0', topLevelId: 'n2', unconnectedHeight: 3 })), LV);
    expect(profileSpans(p, 4.2)).toBe(true);
    expect(profileSpans(p, 7.2)).toBe(false);
  });
});

describe('muros anteriores y persistencia', () => {
  it('un muro sin restricción guardada va de su nivel a su altura', () => {
    const v = wallVerticalOf({ height: 2.6, properties: { levelMarkerId: 'n1' } }, 'n0', 'levelMarkerId');
    expect(resolveWallProfile(v, LV).start).toEqual({ base: 3, top: 5.6 });
  });

  it('parseWallVertical descarta datos mal formados', () => {
    expect(parseWallVertical({ start: { baseLevelId: 'n0' } })).toBeUndefined();
    const ok = uniformWall(extent({ baseLevelId: 'n0', unconnectedHeight: 3 }));
    expect(parseWallVertical(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });
});

describe('alzado desde el perfil', () => {
  const profile = { start: { base: 0, top: 3 }, end: { base: 1, top: 6 } };

  it('lleva base y tope de cada extremo al CSL (0 = base más baja)', () => {
    expect(levelsFromProfile(profile)).toEqual({ base: 0, coronacion: 6, leftHeight: 3, rightHeight: 6, leftBase: 0, rightBase: 1 });
    expect(levelsFromProfile({ start: { base: 3, top: 6 }, end: { base: 3, top: 6 } })).toEqual({ base: 0, coronacion: 3 });
  });

  it('la superficie bruta es el trapecio real y los huecos se recortan contra la base', () => {
    const elevation: WallElevation = {
      wallId: 'w',
      roomId: 'r',
      levels: levelsFromProfile(profile),
      chainModeEnabled: false,
      openings: [
        // Hueco que empieza bajo la base inclinada: solo cuenta lo que queda dentro.
        { id: wallOpeningId('o'), type: 'opening', xOffset: 3.5, width: 1, sillHeight: 0, height: 2, isFlipped: false },
      ],
    };
    const q = computeQuantification(elevation, 4);
    // Alturas netas 3 y 5 → bruto 4 × 4 = 16.
    expect(Number(q.grossArea)).toBeCloseTo(16);
    // Centro del hueco en x=4 → base 1: el hueco útil va de 1 a 2 (1 m²).
    expect(Number(q.openingArea)).toBeCloseTo(1);
  });
});

describe('estaciones (culatas sin partir el muro)', () => {
  const muro = extent({ baseLevelId: 'n0', topLevelId: 'n1', unconnectedHeight: 3 });
  const cumbrera = extent({ baseLevelId: 'n0', topLevelId: 'n2', topOffset: -1, unconnectedHeight: 5 });
  const v = { start: muro, end: muro, stations: [{ at: 3, ext: cumbrera }] };
  const p = resolveWallProfile(v, LV);

  it('el perfil pasa por la estación: culata triangular', () => {
    expect(profileTop(p)).toBe(5);
    expect(profileAt(p, 6, 1.5)).toEqual({ base: 0, top: 4 });
    expect(profileArea(p, 6)).toBeCloseTo(6 * 3 + (6 * 2) / 2);
    expect(profileOutline(p, 6).map((q) => [q.x, q.z])).toEqual([
      [0, 0], [3, 0], [6, 0], [6, 3], [3, 5], [0, 3],
    ]);
    expect(isRectangularProfile(p)).toBe(false);
  });

  it('Revit: perfil editado con el tope más alto en la estación', () => {
    expect(revitConstraints(v, LV)).toMatchObject({ baseLevelId: 'n0', topLevelId: 'n2', topOffset: -1, profileEdited: true });
  });

  it('extentAt en una estación devuelve la suya; entre puntos, interpola', () => {
    expect(extentAt(v, 3, 6, LV)).toBe(cumbrera);
    expect(extentAt(v, 1.5, 6, LV)).toMatchObject({ topLevelId: 'n1', topOffset: 1 });
  });

  it('se guarda y se relee', () => {
    expect(parseWallVertical(JSON.parse(JSON.stringify(v)))).toEqual(v);
  });

  it('una estación fuera del muro (se acortó) no cuenta', () => {
    expect(profileArea(p, 2.5)).toBeCloseTo(2.5 * 3);
    // Con el largo, tampoco sube la altura ni la restricción de Revit.
    expect(profileTop(resolveWallProfile(v, LV, 2.5))).toBe(3);
    expect(revitConstraints(v, LV, 2.5)).toMatchObject({ topLevelId: 'n1', profileEdited: false });
  });
});
