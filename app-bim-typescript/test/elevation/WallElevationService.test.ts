// =============================================================================
// WallElevationService.test.ts — Motor de Elevación de Muros (MEM)
// =============================================================================
//
// Lo que más importa verificar aquí es la CUANTIFICACIÓN: el área neta de un
// muro acaba en un presupuesto, y un error de doble conteo por huecos solapados
// no lo detecta nadie mirando la pantalla. Y la sincronización elevación →
// planta, porque es la costura entre los dos modelos (WallOpening y Door/Window)
// que PolyLive mantiene a la vez.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import {
  WallElevationService,
  cslToScreen,
  screenToCsl,
  fitElevationViewport,
  snapXSmart,
  snapYSmart,
} from '../../src/application/elevation/WallElevationService';
import {
  WallElevation,
  computeQuantification,
  defaultElevation,
  heightAt,
  hasHeightProfile,
  umbral,
  dintel,
  wallOpeningId,
  WallOpening,
  deserializeOpenings,
  serializeOpenings,
} from '../../src/domain/objects/wall-elevation';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { Room } from '../../src/domain/objects/room';
import { roomId, revitObjectId, levelId, RoomId } from '../../src/domain/objects/base';
import { meters } from '../../src/domain/geometry/types';
import { AppErrorCode } from '../../src/shared/errors/AppError';

const ROOM_ID: RoomId = roomId('elev-room');

// ---------------------------------------------------------------------------
// Dominio puro: cuantificación y niveles
// ---------------------------------------------------------------------------

function opening(partial: Omit<Partial<WallOpening>, 'id'> & { id: string }): WallOpening {
  return {
    id: wallOpeningId(partial.id),
    type: partial.type ?? 'window',
    xOffset: partial.xOffset ?? 0,
    width: partial.width ?? 1,
    sillHeight: partial.sillHeight ?? 0.9,
    height: partial.height ?? 1.2,
    isFlipped: partial.isFlipped ?? false,
    vanoId: partial.vanoId,
    notes: partial.notes,
  };
}

function elevationWith(openings: WallOpening[], coronacion = 3, extra?: Partial<WallElevation>): WallElevation {
  return {
    wallId: 'w1',
    roomId: ROOM_ID as string,
    levels: { base: 0, coronacion },
    openings,
    chainModeEnabled: false,
    ...extra,
  };
}

describe('Niveles verticales', () => {
  it('un muro sin culata tiene la misma altura en todo su recorrido', () => {
    const levels = { base: 0, coronacion: 2.8 };
    expect(hasHeightProfile(levels)).toBe(false);
    expect(heightAt(levels, 0, 4)).toBeCloseTo(2.8);
    expect(heightAt(levels, 4, 4)).toBeCloseTo(2.8);
  });

  it('una culata interpola linealmente entre los dos extremos', () => {
    const levels = { base: 0, coronacion: 4, leftHeight: 2, rightHeight: 4 };
    expect(hasHeightProfile(levels)).toBe(true);
    expect(heightAt(levels, 0, 4)).toBeCloseTo(2);
    expect(heightAt(levels, 2, 4)).toBeCloseTo(3);
    expect(heightAt(levels, 4, 4)).toBeCloseTo(4);
  });

  it('la interpolación se acota a los extremos fuera del muro', () => {
    const levels = { base: 0, coronacion: 4, leftHeight: 2, rightHeight: 4 };
    expect(heightAt(levels, -5, 4)).toBeCloseTo(2);
    expect(heightAt(levels, 99, 4)).toBeCloseTo(4);
  });

  it('un muro de longitud cero no divide por cero', () => {
    const levels = { base: 0, coronacion: 4, leftHeight: 2 };
    expect(Number.isFinite(heightAt(levels, 1, 0))).toBe(true);
  });

  it('umbral y dintel son el mínimo antepecho y el máximo dintel', () => {
    const elevation = elevationWith([
      opening({ id: 'a', sillHeight: 0.9, height: 1.2 }),
      opening({ id: 'b', type: 'door', sillHeight: 0, height: 2.1 }),
    ]);
    expect(umbral(elevation)).toBeCloseTo(0);
    expect(dintel(elevation)).toBeCloseTo(2.1);
  });

  it('sin huecos, umbral y dintel son null en vez de 0', () => {
    // 0 significaría "hay un hueco a ras de suelo", que es una afirmación
    // distinta de "no hay huecos".
    const elevation = elevationWith([]);
    expect(umbral(elevation)).toBeNull();
    expect(dintel(elevation)).toBeNull();
  });
});

describe('Cuantificación', () => {
  it('un muro rectangular sin huecos tiene neto igual a bruto', () => {
    const q = computeQuantification(elevationWith([], 2.8), 4);
    expect(Number(q.grossArea)).toBeCloseTo(11.2);
    expect(Number(q.openingArea)).toBeCloseTo(0);
    expect(Number(q.netArea)).toBeCloseTo(11.2);
  });

  it('descuenta la superficie de un hueco', () => {
    const q = computeQuantification(
      elevationWith([opening({ id: 'a', xOffset: 1, width: 1.2, sillHeight: 0.9, height: 1.2 })], 2.8),
      4,
    );
    expect(Number(q.openingArea)).toBeCloseTo(1.44);
    expect(Number(q.netArea)).toBeCloseTo(11.2 - 1.44);
  });

  it('NO cuenta dos veces la zona común de dos huecos solapados', () => {
    // Esto es lo que haría una simple suma de áreas, y el neto saldría más bajo
    // que el real — un error que acaba en un presupuesto.
    const a = opening({ id: 'a', type: 'opening', xOffset: 1, width: 2, sillHeight: 0, height: 2 });
    const b = opening({ id: 'b', type: 'opening', xOffset: 2, width: 2, sillHeight: 0, height: 2 });

    const q = computeQuantification(elevationWith([a, b], 3), 6);

    // Unión: de x=1 a x=4, altura 2 → 6 m². La suma daría 4 + 4 = 8 m².
    expect(Number(q.openingArea)).toBeCloseTo(6);
  });

  it('un hueco contenido dentro de otro no descuenta nada extra', () => {
    const big = opening({ id: 'big', type: 'opening', xOffset: 0, width: 3, sillHeight: 0, height: 2 });
    const small = opening({ id: 'small', type: 'opening', xOffset: 1, width: 1, sillHeight: 0.5, height: 1 });

    const q = computeQuantification(elevationWith([big, small], 3), 6);
    expect(Number(q.openingArea)).toBeCloseTo(6); // solo el grande
  });

  it('el bruto de un muro con culata es el área del trapecio', () => {
    const elevation = elevationWith([], 4, {
      levels: { base: 0, coronacion: 4, leftHeight: 2, rightHeight: 4 },
    });
    // 4 m de largo × (2 + 4) / 2 = 12 m²
    expect(Number(computeQuantification(elevation, 4).grossArea)).toBeCloseTo(12);
  });

  it('recorta el hueco contra el techo interpolado, no contra la coronación', () => {
    // Un hueco de 3 m de alto junto al extremo BAJO de una culata de 2 m no
    // puede descontar 3 m de muro: ahí el muro solo mide 2 m.
    const elevation = elevationWith(
      [opening({ id: 'a', type: 'opening', xOffset: 0, width: 1, sillHeight: 0, height: 3 })],
      4,
      { levels: { base: 0, coronacion: 4, leftHeight: 2, rightHeight: 4 } },
    );

    const q = computeQuantification(elevation, 4);
    // El techo en el centro del hueco (x=0.5 de 4) es 2 + (4-2)*0.125 = 2.25.
    expect(Number(q.openingArea)).toBeCloseTo(2.25);
  });

  it('el neto nunca es negativo, aunque los huecos superen el bruto', () => {
    const elevation = elevationWith(
      [opening({ id: 'a', type: 'opening', xOffset: 0, width: 10, sillHeight: 0, height: 10 })],
      2,
    );
    expect(Number(computeQuantification(elevation, 1).netArea)).toBeGreaterThanOrEqual(0);
  });

  it('ignora huecos de ancho o alto cero en vez de contarlos como área nula ruidosa', () => {
    const elevation = elevationWith([opening({ id: 'a', width: 0, height: 0 })], 3);
    expect(Number(computeQuantification(elevation, 4).openingArea)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Viewport y snaps
// ---------------------------------------------------------------------------

describe('Viewport de elevación', () => {
  const viewport = { scale: 50, offsetX: 20, offsetY: 200 };

  it('INVIERTE el eje Y: la altura crece hacia arriba en pantalla', () => {
    // Sin esta inversión la elevación saldría del revés, con el suelo arriba.
    const ground = cslToScreen({ x: 0, y: 0 }, viewport);
    const top = cslToScreen({ x: 0, y: 2.8 }, viewport);
    expect(top.y).toBeLessThan(ground.y);
  });

  it('screenToCsl es la inversa exacta de cslToScreen', () => {
    for (const point of [{ x: 0, y: 0 }, { x: 3.7, y: 2.1 }, { x: -1, y: 0.5 }]) {
      const roundTrip = screenToCsl(cslToScreen(point, viewport), viewport);
      expect(roundTrip.x).toBeCloseTo(point.x, 9);
      expect(roundTrip.y).toBeCloseTo(point.y, 9);
    }
  });

  it('fitElevationViewport encaja el muro completo en el lienzo', () => {
    const fitted = fitElevationViewport(6, 3, 360, 240, 24);

    const left = cslToScreen({ x: 0, y: 0 }, fitted);
    const right = cslToScreen({ x: 6, y: 0 }, fitted);
    const top = cslToScreen({ x: 0, y: 3 }, fitted);

    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(right.x).toBeLessThanOrEqual(360);
    expect(top.y).toBeGreaterThanOrEqual(0);
    expect(left.y).toBeLessThanOrEqual(240);
  });

  it('un muro degenerado no produce una escala infinita', () => {
    const fitted = fitElevationViewport(0, 0, 360, 240);
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(fitted.scale).toBeGreaterThan(0);
  });
});

describe('Snaps de elevación', () => {
  const elevation = elevationWith([
    opening({ id: 'a', xOffset: 1, width: 1.2, sillHeight: 0.9, height: 1.2 }),
  ]);

  it('ajusta la X al borde de un hueco existente', () => {
    // Alinear dos ventanas a ojo con el dedo no es viable: el snap es lo que
    // hace usable la colocación.
    expect(snapXSmart(2.18, elevation, 4, 0.05)).toBeCloseTo(2.2); // borde derecho de 'a'
  });

  it('ajusta la X a los extremos y al centro del muro', () => {
    expect(snapXSmart(0.02, elevation, 4, 0.05)).toBeCloseTo(0);
    expect(snapXSmart(3.98, elevation, 4, 0.05)).toBeCloseTo(4);
    expect(snapXSmart(2.02, elevation, 4, 0.05)).toBeCloseTo(2);
  });

  it('deja el valor intacto si no hay ninguna referencia cerca', () => {
    expect(snapXSmart(3.4, elevation, 4, 0.05)).toBeCloseTo(3.4);
  });

  it('excluye el propio hueco al ajustarlo, para que no se pegue a sí mismo', () => {
    const openingId = elevation.openings[0].id;
    // 1.02 está a 2 cm de su propio borde: sin exclusión se quedaría clavado.
    expect(snapXSmart(1.02, elevation, 4, 0.05, openingId)).toBeCloseTo(1.02);
  });

  it('ajusta la altura al antepecho y al dintel de otros huecos', () => {
    expect(snapYSmart(0.92, elevation, 0.05)).toBeCloseTo(0.9);
    expect(snapYSmart(2.08, elevation, 0.05)).toBeCloseTo(2.1);
  });

  it('ajusta la altura al suelo y a la coronación', () => {
    expect(snapYSmart(0.01, elevation, 0.05)).toBeCloseTo(0);
    expect(snapYSmart(2.98, elevation, 0.05)).toBeCloseTo(3);
  });
});

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

describe('Serialización de huecos', () => {
  it('sobrevive el ciclo completo', () => {
    const openings = [opening({ id: 'a', type: 'door', isFlipped: true, notes: 'a sustituir' })];
    expect(deserializeOpenings(serializeOpenings(openings))).toEqual(openings);
  });

  it('normaliza los campos ausentes en filas de versiones anteriores', () => {
    // Un `isFlipped: undefined` que llegara a la UI y al cálculo se comportaría
    // como un valor distinto de `false` en algunos sitios.
    const [parsed] = deserializeOpenings('[{"id":"x","type":"window","xOffset":1,"width":1,"height":1}]');
    expect(parsed.isFlipped).toBe(false);
    expect(parsed.sillHeight).toBe(0);
  });

  it('un JSON que no es un array devuelve lista vacía en vez de romper', () => {
    expect(deserializeOpenings('{}')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Servicio, contra base real
// ---------------------------------------------------------------------------

describe('WallElevationService', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;
  let service: WallElevationService;
  let wall: Wall;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `elev-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
    service = new WallElevationService(db, services.store);

    await services.store.createObject(
      new Room({
        id: revitObjectId(ROOM_ID as string),
        roomId: ROOM_ID,
        levelId: levelId('level-1'),
      }),
    );

    const created = await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 4, y: 0 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    wall = created.wall;
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  it('un muro sin elevación devuelve la de por defecto derivada de su altura', async () => {
    const elevation = await service.getElevation(wall);
    expect(elevation.levels.coronacion).toBeCloseTo(2.8);
    expect(elevation.openings).toEqual([]);
  });

  it('abrir la elevación para mirar NO escribe nada en la base', async () => {
    await service.getElevation(wall);

    const row = await db.get('SELECT * FROM wall_elevations WHERE wall_id = ?', [wall.id as string]);
    expect(row).toBeUndefined();
  });

  it('guarda y relee la elevación completa', async () => {
    const elevation = defaultElevation(wall.id as string, ROOM_ID as string, 2.8);
    await service.saveElevation({
      ...elevation,
      levels: { base: 0, coronacion: 4, leftHeight: 2, rightHeight: 4 },
      chainModeEnabled: true,
    });

    const reread = await service.getElevation(wall);
    expect(reread.levels.leftHeight).toBeCloseTo(2);
    expect(reread.levels.rightHeight).toBeCloseTo(4);
    expect(reread.chainModeEnabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Huecos
  // -------------------------------------------------------------------------

  it('añade un hueco con las dimensiones por defecto de su tipo', async () => {
    const elevation = await service.getElevation(wall);
    const { opening: created } = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });

    expect(created.width).toBeCloseTo(0.9);
    expect(created.height).toBeCloseTo(2.1);
    expect(created.sillHeight).toBeCloseTo(0);
  });

  it('una puerta por defecto (2,10 m) en un muro de 2,00 m nace ajustada a 2,00 m', async () => {
    const base = await service.getElevation(wall);
    await service.saveElevation({ ...base, levels: { ...base.levels, coronacion: 2, leftHeight: 2, rightHeight: 2 } });
    const elevation = await service.getElevation(wall);
    const { opening, validation } = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });
    expect(opening.height).toBeCloseTo(2, 3);
    expect(validation.severity).not.toBe('warning');
  });

  it('una altura dada por el operador no se ajusta (se avisa si sobresale)', async () => {
    const base = await service.getElevation(wall);
    await service.saveElevation({ ...base, levels: { ...base.levels, coronacion: 2, leftHeight: 2, rightHeight: 2 } });
    const elevation = await service.getElevation(wall);
    const { opening, validation } = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1, height: 2.4 });
    expect(opening.height).toBeCloseTo(2.4, 3);
    expect(validation.severity).toBe('warning');
  });

  it('una puerta crea su Door en planta, con el mismo offset y dimensiones', async () => {
    // Es la costura entre los dos modelos: sin esto, un hueco colocado en
    // elevación no aparecería en la planta ni se exportaría a IFC.
    const elevation = await service.getElevation(wall);
    const result = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });

    const created = result.elevation.openings[0];
    expect(created.vanoId).toBeDefined();

    const vano = await services.store.readObject(revitObjectId(created.vanoId!));
    expect(vano).toBeInstanceOf(Door);
    expect((vano as Door).offsetAlongWall).toBeCloseTo(1);
    expect((vano as Door).width).toBeCloseTo(0.9);
  });

  it('una ventana crea un Window, no un Door', async () => {
    const elevation = await service.getElevation(wall);
    const result = await service.addOpening(elevation, wall, { type: 'window', xOffset: 1 });

    const vano = await services.store.readObject(revitObjectId(result.elevation.openings[0].vanoId!));
    expect(vano).toBeInstanceOf(Window);
  });

  it('un hueco GENÉRICO no crea ningún vano en planta', async () => {
    // En planta no se dibuja como puerta ni ventana; fabricar un vano solo
    // para que exista produciría un símbolo que no corresponde a nada.
    const elevation = await service.getElevation(wall);
    const result = await service.addOpening(elevation, wall, { type: 'opening', xOffset: 1 });

    expect(result.elevation.openings[0].vanoId).toBeUndefined();
    const objects = await services.store.listObjects(ROOM_ID);
    expect(objects.filter((o) => o instanceof Door || o instanceof Window)).toHaveLength(0);
  });

  it('mover un hueco actualiza el offset de su vano en planta', async () => {
    const elevation = await service.getElevation(wall);
    const added = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });
    const openingId = added.elevation.openings[0].id;

    const moved = await service.updateOpening(added.elevation, wall, openingId, { xOffset: 2.5 });

    const vanoId = moved.elevation.openings[0].vanoId!;
    const vano = (await services.store.readObject(revitObjectId(vanoId))) as Door;
    expect(vano.offsetAlongWall).toBeCloseTo(2.5);
  });

  it('cambiar el tipo de puerta a ventana reemplaza el vano en planta', async () => {
    // El `object_type` de una fila es su identidad: mutarlo sería reescribirla.
    const elevation = await service.getElevation(wall);
    const added = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });
    const oldVanoId = added.elevation.openings[0].vanoId!;

    const changed = await service.updateOpening(added.elevation, wall, added.elevation.openings[0].id, {
      type: 'window',
    });

    expect(await services.store.readObject(revitObjectId(oldVanoId))).toBeNull();
    const newVano = await services.store.readObject(
      revitObjectId(changed.elevation.openings[0].vanoId!),
    );
    expect(newVano).toBeInstanceOf(Window);
  });

  it('cambiar de puerta a hueco genérico borra el vano sin crear otro', async () => {
    const elevation = await service.getElevation(wall);
    const added = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });
    const oldVanoId = added.elevation.openings[0].vanoId!;

    const changed = await service.updateOpening(added.elevation, wall, added.elevation.openings[0].id, {
      type: 'opening',
    });

    expect(await services.store.readObject(revitObjectId(oldVanoId))).toBeNull();
    expect(changed.elevation.openings[0].vanoId).toBeUndefined();
  });

  it('eliminar un hueco elimina también su vano en planta', async () => {
    const elevation = await service.getElevation(wall);
    const added = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });
    const vanoId = added.elevation.openings[0].vanoId!;

    const after = await service.removeOpening(added.elevation, added.elevation.openings[0].id);

    expect(after.openings).toHaveLength(0);
    expect(await services.store.readObject(revitObjectId(vanoId))).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Validación
  // -------------------------------------------------------------------------

  it('rechaza un hueco de dimensiones imposibles', async () => {
    const elevation = await service.getElevation(wall);
    await expect(
      service.addOpening(elevation, wall, { type: 'opening', xOffset: 1, width: 0 }),
    ).rejects.toMatchObject({ code: AppErrorCode.VALIDATION_FAILED });
  });

  it('rechaza dos VANOS solapados: no se puede construir ni exportar', async () => {
    const elevation = await service.getElevation(wall);
    const first = await service.addOpening(elevation, wall, { type: 'door', xOffset: 1, width: 1 });

    await expect(
      service.addOpening(first.elevation, wall, { type: 'window', xOffset: 1.5, width: 1, sillHeight: 0.5 }),
    ).rejects.toMatchObject({ code: AppErrorCode.VALIDATION_FAILED });
  });

  it('ACEPTA con aviso un hueco genérico solapado: es un caso real', async () => {
    // Un nicho dentro de un paño mayor existe en obra; bloquearlo obligaría a
    // no dibujarlo.
    const elevation = await service.getElevation(wall);
    const first = await service.addOpening(elevation, wall, {
      type: 'opening',
      xOffset: 1,
      width: 2,
      height: 2,
    });

    const second = await service.addOpening(first.elevation, wall, {
      type: 'opening',
      xOffset: 1.5,
      width: 0.5,
      height: 0.5,
      sillHeight: 0.5,
    });

    expect(second.validation.severity).toBe('warning');
    expect(second.elevation.openings).toHaveLength(2);
  });

  it('acepta con aviso un hueco que sobresale del muro', async () => {
    const elevation = await service.getElevation(wall);
    const result = await service.addOpening(elevation, wall, {
      type: 'opening',
      xOffset: 3.8,
      width: 1,
    });

    expect(result.validation.severity).toBe('warning');
    expect(result.validation.message).toContain('sobresale');
  });

  it('avisa si el hueco sobrepasa la altura del muro EN SU PUNTO, no la coronación', async () => {
    // En un muro con culata, comparar solo contra la coronación dejaría pasar
    // un hueco que sobresale por el extremo bajo.
    const base = await service.getElevation(wall);
    const withProfile = await service.updateLevels(base, wall, { leftHeight: 1.5, rightHeight: 3 });

    const result = await service.addOpening(withProfile, wall, {
      type: 'opening',
      xOffset: 0,
      width: 0.5,
      height: 2.5,
    });

    expect(result.validation.severity).toBe('warning');
    expect(result.validation.message).toContain('altura');
  });

  it('validateElevation devuelve la peor severidad encontrada', async () => {
    const elevation = await service.getElevation(wall);
    const withWarning = await service.addOpening(elevation, wall, {
      type: 'opening',
      xOffset: 3.8,
      width: 1,
    });

    expect(service.validateElevation(withWarning.elevation, wall.length as number).severity).toBe('warning');
  });

  // -------------------------------------------------------------------------
  // Niveles
  // -------------------------------------------------------------------------

  it('cambiar la coronación sincroniza la altura del muro en planta', async () => {
    // Las dos vistas tienen que contar lo mismo.
    const elevation = await service.getElevation(wall);
    await service.updateLevels(elevation, wall, { coronacion: 3.5 });

    const reread = (await services.store.readObject(wall.id)) as Wall;
    expect(reread.height).toBeCloseTo(3.5);
  });

  it('una culata más alta que la coronación sube la coronación', async () => {
    // Por contrato, `coronacion` es la altura MÁXIMA: dejarla por debajo daría
    // un muro cuya altura declarada es menor que su punto más alto.
    const elevation = await service.getElevation(wall);
    const updated = await service.updateLevels(elevation, wall, { rightHeight: 4.2 });

    expect(updated.levels.coronacion).toBeCloseTo(4.2);
  });

  it('rechaza una coronación no positiva', async () => {
    const elevation = await service.getElevation(wall);
    await expect(service.updateLevels(elevation, wall, { coronacion: 0 })).rejects.toMatchObject({
      code: AppErrorCode.VALIDATION_FAILED,
    });
  });

  // -------------------------------------------------------------------------
  // Chain mode
  // -------------------------------------------------------------------------

  it('propaga la coronación a los muros que comparten un extremo', async () => {
    const connected = await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 4, y: 0 },
      endPoint: { x: 4, y: 3 },
      thickness: meters(0.15),
      height: meters(2.8),
    });
    const isolated = await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 20, y: 20 },
      endPoint: { x: 24, y: 20 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    const elevation = await service.updateLevels(await service.getElevation(wall), wall, {
      coronacion: 3.6,
    });

    const objects = await services.store.listObjects(ROOM_ID);
    const walls = objects.filter((o): o is Wall => o instanceof Wall);
    const { updatedWallIds } = await service.propagateCoronacion(elevation, wall, walls);

    expect(updatedWallIds).toContain(connected.wall.id as string);
    expect(updatedWallIds).not.toContain(isolated.wall.id as string);

    const reread = await service.getElevation(
      (await services.store.readObject(connected.wall.id)) as Wall,
    );
    expect(reread.levels.coronacion).toBeCloseTo(3.6);
  });

  // -------------------------------------------------------------------------
  // Cuantificación de un Recinto
  // -------------------------------------------------------------------------

  it('quantifyRoom suma todos los muros, con y sin elevación propia', async () => {
    await services.useCases.createWall.execute({
      roomId: ROOM_ID,
      startPoint: { x: 4, y: 0 },
      endPoint: { x: 4, y: 3 },
      thickness: meters(0.15),
      height: meters(2.8),
    });

    const elevation = await service.getElevation(wall);
    await service.addOpening(elevation, wall, { type: 'door', xOffset: 1 });

    const total = await service.quantifyRoom(ROOM_ID);

    // Muro de 4 m + muro de 3 m, ambos a 2.8 m → 11.2 + 8.4 = 19.6 m² brutos.
    expect(Number(total.grossArea)).toBeCloseTo(19.6, 1);
    // Una puerta de 0.9 × 2.1 = 1.89 m².
    expect(Number(total.openingArea)).toBeCloseTo(1.89, 2);
    expect(Number(total.netArea)).toBeCloseTo(19.6 - 1.89, 1);
  });

});
