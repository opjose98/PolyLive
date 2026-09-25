// =============================================================================
// WallElevationService.ts — Edición de la elevación de un muro (MEM)
// Portado de LevON: features/walls/application/wall_csl_service.dart,
//                   application/elevation/edit_wall_elevation_use_case.dart
// =============================================================================
//
// RESPONSABILIDADES:
//   1. Transformar entre el sistema local del muro (CSL) y la pantalla
//   2. Validar los huecos contra el muro y entre sí
//   3. CRUD de huecos y niveles, persistiendo en `wall_elevations`
//   4. Mantener sincronizados los huecos con los vanos BIM (Door/Window) que
//      la planta y el exportador IFC ya usan
//
// SOBRE EL PUNTO 4: LevON resolvió la duplicidad eliminando `Door` y `Window`
// del modelo. PolyLive no puede hacer eso sin romper el exportador IFC, el
// CommandStack, la validación y sus tests. La decisión aquí es la contraria y
// está asumida: `WallOpening` es la fuente de verdad de la ELEVACIÓN, y cada
// hueco de tipo puerta o ventana proyecta un `Door`/`Window` en la PLANTA. Un
// hueco genérico no proyecta nada, porque en planta no se dibuja como vano.
//
// La sincronización es unidireccional (elevación → planta) a propósito: dos
// direcciones exigirían resolver conflictos, y no hay ninguna regla que diga
// quién gana si el mismo hueco se mueve a la vez en las dos vistas.
// =============================================================================

import { IDatabase } from '../../infrastructure/sqlite/database';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { CommandStack } from '../state/CommandStack';
import { DeleteObjectCommand } from '../commands/DeleteObjectCommand';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import {
  RevitObjectId,
  RoomId,
  revitObjectId,
  wallId as toWallId,
  generateId,
} from '../../domain/objects/base';
import { meters, squareMeters } from '../../domain/geometry/types';
import {
  WallElevation,
  WallOpening,
  WallOpeningId,
  OpeningType,
  VerticalLevels,
  wallOpeningId,
  defaultElevation,
  openingEnd,
  openingTop,
  openingCenterX,
  heightAt,
  hasHeightProfile,
  effectiveLeftHeight,
  effectiveRightHeight,
  computeQuantification,
  WallQuantification,
  OPENING_DEFAULTS,
  openingTypeLabel,
  serializeLevels,
  serializeOpenings,
  deserializeLevels,
  deserializeOpenings,
} from '../../domain/objects/wall-elevation';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

const EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export type ElevationSeverity = 'ok' | 'warning' | 'error';

export interface ElevationValidation {
  readonly severity: ElevationSeverity;
  readonly message?: string;
  /** Hueco al que apunta el problema, si es de uno concreto. */
  readonly openingId?: WallOpeningId;
}

const OK: ElevationValidation = { severity: 'ok' };

// ---------------------------------------------------------------------------
// Viewport de elevación
// ---------------------------------------------------------------------------

/**
 * Transformación entre el CSL del muro y la pantalla de la vista de elevación.
 *
 * El eje Y SE INVIERTE: en CSL la altura crece hacia arriba y en pantalla los
 * píxeles crecen hacia abajo. Sin esta inversión la elevación saldría del
 * revés, con el suelo arriba — que es exactamente lo que pasa hoy en la vista
 * de planta y que allí no se nota porque el usuario dibuja sobre la pantalla.
 * Aquí sí se notaría: un muro tiene un arriba y un abajo que no son opinables.
 */
export interface ElevationViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function cslToScreen(
  point: { x: number; y: number },
  viewport: ElevationViewport,
): { x: number; y: number } {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: viewport.offsetY - point.y * viewport.scale,
  };
}

export function screenToCsl(
  point: { x: number; y: number },
  viewport: ElevationViewport,
): { x: number; y: number } {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (viewport.offsetY - point.y) / viewport.scale,
  };
}

/** Viewport que encaja el muro entero en el lienzo, con margen. */
export function fitElevationViewport(
  wallLength: number,
  maxHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 24,
): ElevationViewport {
  const usableW = Math.max(canvasWidth - padding * 2, 1);
  const usableH = Math.max(canvasHeight - padding * 2, 1);
  const scale = Math.min(usableW / Math.max(wallLength, 0.1), usableH / Math.max(maxHeight, 0.1));

  return {
    scale,
    offsetX: (canvasWidth - wallLength * scale) / 2,
    // El suelo (CSL y=0) queda en la base del área útil.
    offsetY: canvasHeight - padding,
  };
}

// ---------------------------------------------------------------------------
// Snaps de elevación
// ---------------------------------------------------------------------------

/**
 * Ajusta una X del CSL a las referencias del muro: sus extremos, el centro, y
 * los bordes de los huecos ya colocados. Alinear una ventana con otra a ojo,
 * con el dedo, sobre una pantalla de 6 pulgadas, no es viable.
 */
export function snapXSmart(
  rawX: number,
  elevation: WallElevation,
  wallLength: number,
  toleranceMeters: number,
  excludeOpeningId?: WallOpeningId,
): number {
  const candidates = [0, wallLength, wallLength / 2];
  for (const opening of elevation.openings) {
    if (opening.id === excludeOpeningId) continue;
    candidates.push(opening.xOffset, openingEnd(opening), openingCenterX(opening));
  }
  return snapToNearest(rawX, candidates, toleranceMeters);
}

/** Ídem para la altura: suelo, coronación, umbrales y dinteles existentes. */
export function snapYSmart(
  rawY: number,
  elevation: WallElevation,
  toleranceMeters: number,
  excludeOpeningId?: WallOpeningId,
): number {
  const candidates = [0, elevation.levels.coronacion];
  for (const opening of elevation.openings) {
    if (opening.id === excludeOpeningId) continue;
    candidates.push(opening.sillHeight, openingTop(opening));
  }
  return snapToNearest(rawY, candidates, toleranceMeters);
}

function snapToNearest(value: number, candidates: readonly number[], tolerance: number): number {
  let best = value;
  let bestDistance = tolerance;
  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export class WallElevationService {
  constructor(
    private readonly db: IDatabase,
    private readonly store: ObjectStore,
    private readonly commandStack: CommandStack,
  ) {}

  // -------------------------------------------------------------------------
  // Lectura / escritura
  // -------------------------------------------------------------------------

  /**
   * Elevación del muro. Si no existe todavía, devuelve la de por defecto
   * derivada de `Wall.height` — SIN persistirla: abrir la vista de elevación
   * para mirar no debe escribir nada en la base.
   */
  async getElevation(wall: Wall): Promise<WallElevation> {
    const row = await this.db.get<{
      wall_id: string;
      room_id: string;
      levels_json: string;
      openings_json: string;
    }>(`SELECT * FROM wall_elevations WHERE wall_id = ? AND is_deleted = 0`, [wall.id as string]);

    if (!row) {
      return defaultElevation(wall.id as string, wall.roomId as string, wall.height as number);
    }

    const { levels, chainModeEnabled } = deserializeLevels(row.levels_json);
    return {
      wallId: row.wall_id,
      roomId: row.room_id,
      levels,
      openings: deserializeOpenings(row.openings_json),
      chainModeEnabled,
    };
  }

  async saveElevation(elevation: WallElevation): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT OR REPLACE INTO wall_elevations
         (wall_id, room_id, levels_json, openings_json, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0,
         COALESCE((SELECT created_at FROM wall_elevations WHERE wall_id = ?), ?),
         ?)`,
      [
        elevation.wallId,
        elevation.roomId,
        serializeLevels(elevation),
        serializeOpenings(elevation.openings),
        elevation.wallId,
        now,
        now,
      ],
    );
  }

  /** Elevaciones de todos los muros de un Recinto (para el exportador). */
  async listElevations(room: RoomId): Promise<WallElevation[]> {
    const rows = await this.db.all<{
      wall_id: string;
      room_id: string;
      levels_json: string;
      openings_json: string;
    }>(`SELECT * FROM wall_elevations WHERE room_id = ? AND is_deleted = 0`, [room as string]);

    return rows.map((row) => {
      const { levels, chainModeEnabled } = deserializeLevels(row.levels_json);
      return {
        wallId: row.wall_id,
        roomId: row.room_id,
        levels,
        openings: deserializeOpenings(row.openings_json),
        chainModeEnabled,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Validación
  // -------------------------------------------------------------------------

  /**
   * Valida un hueco contra el muro y contra los demás.
   *
   * SEVERIDADES, con su razón:
   * - error: dimensiones imposibles, o dos vanos (puerta/ventana) solapados —
   *   eso no se puede construir y no se puede exportar a IFC.
   * - warning: el hueco se sale del muro, o un hueco GENÉRICO solapa con algo.
   *   Un hueco genérico solapando es un caso real (un nicho dentro de un paño
   *   mayor), así que se avisa y se deja pasar.
   */
  validateOpening(
    opening: WallOpening,
    elevation: WallElevation,
    wallLength: number,
  ): ElevationValidation {
    if (opening.width <= 0 || opening.height <= 0) {
      return { severity: 'error', message: 'El ancho y la altura deben ser mayores que cero.', openingId: opening.id };
    }
    if (opening.xOffset < 0) {
      return { severity: 'error', message: 'La posición no puede ser negativa.', openingId: opening.id };
    }
    if (opening.sillHeight < 0) {
      return { severity: 'error', message: 'El antepecho no puede ser negativo.', openingId: opening.id };
    }
    if (openingEnd(opening) > wallLength + EPSILON) {
      return {
        severity: 'warning',
        message: `El hueco sobresale del muro (${wallLength.toFixed(3)} m).`,
        openingId: opening.id,
      };
    }

    // Se compara contra el techo INTERPOLADO en el centro del hueco, no contra
    // la coronación: en un muro con culata la coronación es la altura máxima y
    // un hueco junto al extremo bajo podría sobresalir sin que se detectara.
    const ceiling = heightAt(elevation.levels, openingCenterX(opening), wallLength);
    if (openingTop(opening) > ceiling + EPSILON) {
      return {
        severity: 'warning',
        message: `El hueco sobrepasa la altura del muro en ese punto (${ceiling.toFixed(3)} m).`,
        openingId: opening.id,
      };
    }

    for (const other of elevation.openings) {
      if (other.id === opening.id) continue;

      const overlapX =
        opening.xOffset < openingEnd(other) - EPSILON && openingEnd(opening) > other.xOffset + EPSILON;
      const overlapY =
        opening.sillHeight < openingTop(other) - EPSILON &&
        openingTop(opening) > other.sillHeight + EPSILON;
      if (!overlapX || !overlapY) continue;

      if (opening.type === 'opening' || other.type === 'opening') {
        return {
          severity: 'warning',
          message: `Hueco genérico solapado con ${openingTypeLabel(other.type).toLowerCase()}.`,
          openingId: opening.id,
        };
      }
      return {
        severity: 'error',
        message: `${openingTypeLabel(opening.type)} se solapa con ${openingTypeLabel(other.type).toLowerCase()}.`,
        openingId: opening.id,
      };
    }

    return OK;
  }

  /** Peor severidad encontrada en toda la elevación. */
  validateElevation(elevation: WallElevation, wallLength: number): ElevationValidation {
    let worst: ElevationValidation = OK;
    for (const opening of elevation.openings) {
      const result = this.validateOpening(opening, elevation, wallLength);
      if (result.severity === 'error') return result;
      if (result.severity === 'warning') worst = result;
    }
    return worst;
  }

  // -------------------------------------------------------------------------
  // Edición
  // -------------------------------------------------------------------------

  /**
   * Añade un hueco. Devuelve la elevación nueva y la validación resultante.
   *
   * NO rechaza los huecos con warning: el operador está levantando lo que hay,
   * y a veces lo que hay es una ventana que llega al forjado. Solo los errores
   * (dimensiones imposibles, vanos solapados) se rechazan.
   */
  async addOpening(
    elevation: WallElevation,
    wall: Wall,
    params: {
      type: OpeningType;
      xOffset: number;
      width?: number;
      height?: number;
      sillHeight?: number;
      notes?: string;
    },
  ): Promise<{ elevation: WallElevation; opening: WallOpening; validation: ElevationValidation }> {
    const defaults = OPENING_DEFAULTS[params.type];
    const opening: WallOpening = {
      id: wallOpeningId(generateId() as unknown as string),
      type: params.type,
      xOffset: params.xOffset,
      width: params.width ?? defaults.width,
      height: params.height ?? defaults.height,
      sillHeight: params.sillHeight ?? defaults.sillHeight,
      isFlipped: false,
      notes: params.notes,
    };

    const candidate: WallElevation = { ...elevation, openings: [...elevation.openings, opening] };
    const validation = this.validateOpening(opening, candidate, wall.length as number);

    if (validation.severity === 'error') {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        userMessage: validation.message ?? 'El hueco no es válido.',
        technicalDetail: `addOpening rejected: ${validation.message}`,
      });
    }

    const synced = await this.syncVano(candidate, opening, wall);
    await this.saveElevation(synced);
    return { elevation: synced, opening, validation };
  }

  /** Modifica un hueco existente. Misma política de severidad que `addOpening`. */
  async updateOpening(
    elevation: WallElevation,
    wall: Wall,
    openingId: WallOpeningId,
    updates: Partial<Omit<WallOpening, 'id'>>,
  ): Promise<{ elevation: WallElevation; validation: ElevationValidation }> {
    const current = elevation.openings.find((o) => o.id === openingId);
    if (!current) {
      throw new AppError({
        code: AppErrorCode.NOT_FOUND,
        userMessage: 'El hueco ya no existe.',
        technicalDetail: `Opening ${openingId} not found in wall ${elevation.wallId}`,
      });
    }

    const updated: WallOpening = { ...current, ...updates, id: current.id };
    const candidate: WallElevation = {
      ...elevation,
      openings: elevation.openings.map((o) => (o.id === openingId ? updated : o)),
    };

    const validation = this.validateOpening(updated, candidate, wall.length as number);
    if (validation.severity === 'error') {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        userMessage: validation.message ?? 'El cambio deja el hueco en un estado inválido.',
        technicalDetail: `updateOpening rejected: ${validation.message}`,
      });
    }

    const synced = await this.syncVano(candidate, updated, wall);
    await this.saveElevation(synced);
    return { elevation: synced, validation };
  }

  /** Elimina un hueco y, con él, el vano BIM que proyectaba en planta. */
  async removeOpening(elevation: WallElevation, openingId: WallOpeningId): Promise<WallElevation> {
    const opening = elevation.openings.find((o) => o.id === openingId);
    if (!opening) return elevation;

    if (opening.vanoId) {
      // Pasa por el CommandStack para que el borrado sea deshacible junto con
      // el resto de la sesión, en vez de un borrado suelto fuera del historial.
      const vanoId = revitObjectId(opening.vanoId);
      await this.store.deleteObject(vanoId);
      await this.commandStack.execute(new DeleteObjectCommand(vanoId, [vanoId]));
    }

    const next: WallElevation = {
      ...elevation,
      openings: elevation.openings.filter((o) => o.id !== openingId),
    };
    await this.saveElevation(next);
    return next;
  }

  /** Cambia los niveles verticales (coronación y culata). */
  async updateLevels(
    elevation: WallElevation,
    wall: Wall,
    updates: Partial<VerticalLevels>,
  ): Promise<WallElevation> {
    const levels: VerticalLevels = { ...elevation.levels, ...updates };

    if (levels.coronacion <= 0) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        userMessage: 'La coronación debe ser mayor que cero.',
        technicalDetail: `coronacion = ${levels.coronacion}`,
      });
    }

    // `coronacion` es, por contrato, la altura MÁXIMA (es lo que se sincroniza
    // con Wall.height y lo que espera IFC). Si una culata la supera, se sube:
    // dejarla por debajo produciría un muro cuya altura declarada es menor que
    // su punto más alto.
    const maxHeight = Math.max(
      levels.coronacion,
      effectiveLeftHeight(levels),
      effectiveRightHeight(levels),
    );
    const normalized: VerticalLevels = { ...levels, coronacion: maxHeight };

    const next: WallElevation = { ...elevation, levels: normalized };
    await this.saveElevation(next);

    // El muro en planta lleva la altura máxima: las dos vistas tienen que
    // contar lo mismo.
    if (Math.abs((wall.height as number) - maxHeight) > EPSILON) {
      await this.store.updateObject(wall.id, { height: meters(maxHeight) } as Partial<Wall>);
    }

    return next;
  }

  async setChainMode(elevation: WallElevation, enabled: boolean): Promise<WallElevation> {
    const next = { ...elevation, chainModeEnabled: enabled };
    await this.saveElevation(next);
    return next;
  }

  /**
   * Propaga la coronación a los muros que comparten un extremo con este.
   *
   * Es lo que permite coronar una planta entera de una vez. La adyacencia se
   * calcula por coincidencia de extremos con tolerancia, no por el
   * TopologyGraph, porque aquí basta con "se tocan" y construir el grafo
   * entero para responder a eso sería desproporcionado.
   */
  async propagateCoronacion(
    elevation: WallElevation,
    wall: Wall,
    allWalls: readonly Wall[],
    toleranceMeters = 0.05,
  ): Promise<{ updatedWallIds: string[] }> {
    const touches = (a: Wall, b: Wall): boolean => {
      const pts = [a.startPoint, a.endPoint];
      const others = [b.startPoint, b.endPoint];
      return pts.some((p) => others.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= toleranceMeters));
    };

    const updated: string[] = [];
    for (const other of allWalls) {
      if ((other.id as string) === (wall.id as string)) continue;
      if (!touches(wall, other)) continue;

      const otherElevation = await this.getElevation(other);
      const next = await this.updateLevels(otherElevation, other, {
        coronacion: elevation.levels.coronacion,
      });
      updated.push(next.wallId);
    }

    return { updatedWallIds: updated };
  }

  // -------------------------------------------------------------------------
  // Cuantificación
  // -------------------------------------------------------------------------

  quantify(elevation: WallElevation, wall: Wall): WallQuantification {
    return computeQuantification(elevation, wall.length as number);
  }

  /** Cuantificación sumada de todos los muros de un Recinto. */
  async quantifyRoom(room: RoomId): Promise<WallQuantification> {
    const objects = await this.store.listObjects(room);
    const walls = objects.filter((o): o is Wall => o instanceof Wall);
    const elevations = await this.listElevations(room);
    const byWall = new Map(elevations.map((e) => [e.wallId, e]));

    let gross = 0;
    let openings = 0;
    for (const wall of walls) {
      const elevation =
        byWall.get(wall.id as string) ??
        defaultElevation(wall.id as string, room as string, wall.height as number);
      const q = computeQuantification(elevation, wall.length as number);
      gross += Number(q.grossArea);
      openings += Number(q.openingArea);
    }

    return {
      grossArea: squareMeters(gross),
      openingArea: squareMeters(openings),
      netArea: squareMeters(Math.max(0, gross - openings)),
    };
  }

  // -------------------------------------------------------------------------
  // Sincronización elevación → planta
  // -------------------------------------------------------------------------

  /**
   * Crea o actualiza el `Door`/`Window` que representa este hueco en planta.
   *
   * Un hueco genérico (`opening`) NO proyecta vano: en planta no se dibuja como
   * puerta ni ventana, y fabricar uno solo para que exista produciría símbolos
   * que no corresponden a nada. Si un hueco cambia de puerta a genérico, su
   * vano anterior se borra.
   */
  private async syncVano(
    elevation: WallElevation,
    opening: WallOpening,
    wall: Wall,
  ): Promise<WallElevation> {
    const shouldHaveVano = opening.type === 'door' || opening.type === 'window';

    if (!shouldHaveVano) {
      if (opening.vanoId) {
        await this.store.deleteObject(revitObjectId(opening.vanoId));
        return this.replaceOpening(elevation, { ...opening, vanoId: undefined });
      }
      return elevation;
    }

    const common = {
      roomId: wall.roomId,
      parentWallId: toWallId(wall.id as string),
      offsetAlongWall: meters(opening.xOffset),
      offsetPerpendicular: meters(0),
      width: meters(opening.width),
      height: meters(opening.height),
      notes: opening.notes,
    };

    // ¿Ya existe un vano y sigue siendo del tipo correcto?
    if (opening.vanoId) {
      const existing = await this.store.readObject(revitObjectId(opening.vanoId));
      const typeMatches =
        (opening.type === 'door' && existing instanceof Door) ||
        (opening.type === 'window' && existing instanceof Window);

      if (existing && typeMatches) {
        await this.store.updateObject(existing.id, {
          offsetAlongWall: common.offsetAlongWall,
          width: common.width,
          height: common.height,
        } as Partial<Door>);
        return elevation;
      }

      // Cambió de tipo (o el vano desapareció): se borra el viejo y se crea el
      // nuevo. Mutar el `object_type` de una fila sería reescribir su identidad.
      if (existing) await this.store.deleteObject(existing.id);
    }

    const id: RevitObjectId = generateId();
    const vano =
      opening.type === 'door'
        ? new Door({ id, ...common })
        : new Window({ id, ...common });

    await this.store.createObject(vano);
    return this.replaceOpening(elevation, { ...opening, vanoId: id as string });
  }

  private replaceOpening(elevation: WallElevation, opening: WallOpening): WallElevation {
    return {
      ...elevation,
      openings: elevation.openings.map((o) => (o.id === opening.id ? opening : o)),
    };
  }
}

// Reexports para que la UI no tenga que importar del dominio y del servicio.
export {
  hasHeightProfile,
  effectiveLeftHeight,
  effectiveRightHeight,
  heightAt,
  openingEnd,
  openingTop,
  openingCenterX,
  openingTypeLabel,
  computeQuantification,
  OPENING_DEFAULTS,
};
export type { WallElevation, WallOpening, WallOpeningId, OpeningType, VerticalLevels, WallQuantification };
