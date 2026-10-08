// =============================================================================
// wall-elevation.ts — Motor de Elevación de Muros (MEM)
// Portado de LevON: features/walls/domain/wall_elevation.dart
// =============================================================================
//
// QUÉ RESUELVE: hasta ahora un muro de PolyLive solo tenía `height`. Eso no
// basta para levantar un edificio real: un muro tiene vanos a alturas
// concretas, puede tener una culata (altura variable de un extremo a otro), y
// lo que se factura y se presupuesta es su superficie NETA — la bruta menos los
// huecos. Sin elevación, la app solo produce una planta.
//
// SISTEMA DE COORDENADAS LOCAL DEL MURO (CSL):
//   X = distancia desde el inicio del muro, en metros
//   Y = altura desde el suelo, en metros
//
// Los vanos se guardan SIEMPRE en CSL, nunca en coordenadas mundo. Es lo que
// permite mover o girar un muro sin recalcular nada de su elevación: una puerta
// a 1,2 m del arranque sigue a 1,2 m del arranque.
//
// RELACIÓN CON Door/Window: LevON consolidó `Door` y `Window` dentro de
// `WallOpening` y eliminó las entidades paralelas. PolyLive NO hace esa
// eliminación: `Door` y `Window` son objetos BIM persistidos, exportados a IFC
// y referenciados por el CommandStack y por los tests. Aquí se mantienen los
// dos modelos con una correspondencia explícita (ver `openingFromVano` y
// `syncVanosFromElevation` en WallElevationService), que es el precio de no
// romper la mitad del sistema en una migración de datos.
// =============================================================================

import { SquareMeters, squareMeters } from '../geometry/types';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Tipo semántico del hueco. Mapea directo a IFC:
 *   door    → IfcDoor   + IfcOpeningElement
 *   window  → IfcWindow + IfcOpeningElement
 *   opening → IfcOpeningElement solo (hueco genérico: pasos, nichos, roturas)
 */
export type OpeningType = 'door' | 'window' | 'opening';

export type WallOpeningId = string & { readonly __brand: 'WallOpeningId' };

export function wallOpeningId(value: string): WallOpeningId {
  return value as WallOpeningId;
}

// ---------------------------------------------------------------------------
// WallOpening
// ---------------------------------------------------------------------------

/**
 * Hueco posicionado en coordenadas CSL del muro.
 *
 * INVARIANTES (las valida WallElevationService, no el constructor: un hueco
 * que se está arrastrando pasa por estados inválidos de forma transitoria y
 * lanzar en el constructor impediría representarlos):
 * - width > 0, height > 0
 * - xOffset >= 0, sillHeight >= 0
 */
export interface WallOpening {
  readonly id: WallOpeningId;
  readonly type: OpeningType;
  /** Distancia desde el inicio del muro (eje X del CSL). */
  readonly xOffset: number;
  /** Ancho del hueco (eje X del CSL). */
  readonly width: number;
  /** Altura del antepecho sobre el suelo. 0 en puertas; ~0,90 en ventanas. */
  readonly sillHeight: number;
  /** Altura del hueco. El dintel queda en `sillHeight + height`. */
  readonly height: number;
  /** Solo puertas: invierte el sentido de apertura de la hoja. */
  readonly isFlipped: boolean;
  /**
   * Vano BIM (Door/Window) que representa este hueco en planta, si lo hay.
   *
   * Es el puente entre los dos modelos — ver la nota de cabecera. Un hueco
   * genérico (`opening`) no tiene vano: no se dibuja como puerta ni ventana.
   */
  readonly vanoId?: string;
  readonly notes?: string;
}

export function openingEnd(opening: WallOpening): number {
  return opening.xOffset + opening.width;
}

export function openingTop(opening: WallOpening): number {
  return opening.sillHeight + opening.height;
}

export function openingCenterX(opening: WallOpening): number {
  return opening.xOffset + opening.width / 2;
}

export function openingCenterY(opening: WallOpening): number {
  return opening.sillHeight + opening.height / 2;
}

// ---------------------------------------------------------------------------
// VerticalLevels
// ---------------------------------------------------------------------------

/**
 * Niveles verticales del muro, con soporte de CULATA (altura variable).
 *
 * `leftHeight` / `rightHeight` son las alturas en los extremos. Cuando ambas
 * son `undefined`, el muro es rectangular de altura `coronacion`. `coronacion`
 * conserva siempre la altura MÁXIMA, porque es lo que se sincroniza con
 * `Wall.height` y lo que espera IFC.
 */
export interface VerticalLevels {
  /** Suelo de referencia. Siempre 0 en esta versión. */
  readonly base: number;
  /** Altura máxima del muro. Sincronizada con `Wall.height`. */
  readonly coronacion: number;
  /** Altura en el arranque del muro (CSL X=0). `undefined` = coronación. */
  readonly leftHeight?: number;
  /** Altura en el final del muro (CSL X=longitud). `undefined` = coronación. */
  readonly rightHeight?: number;
  /**
   * Arranque de la base sobre el CSL 0 en cada extremo (base escalonada o
   * inclinada, cuando los extremos se atan a niveles distintos). `undefined` = 0.
   */
  readonly leftBase?: number;
  readonly rightBase?: number;
}

export function effectiveLeftHeight(levels: VerticalLevels): number {
  return levels.leftHeight ?? levels.coronacion;
}

export function effectiveRightHeight(levels: VerticalLevels): number {
  return levels.rightHeight ?? levels.coronacion;
}

export function hasHeightProfile(levels: VerticalLevels): boolean {
  return (
    levels.leftHeight !== undefined ||
    levels.rightHeight !== undefined ||
    (levels.leftBase ?? 0) !== 0 ||
    (levels.rightBase ?? 0) !== 0
  );
}

/** Cota de la base del muro en `localX` (0 salvo base inclinada). */
export function baseAt(levels: VerticalLevels, localX: number, wallLength: number): number {
  const l = levels.leftBase ?? 0;
  const r = levels.rightBase ?? 0;
  if (wallLength <= 0) return l;
  const t = Math.max(0, Math.min(1, localX / wallLength));
  return l + (r - l) * t;
}

/**
 * Niveles del alzado a partir del perfil del muro en cotas absolutas (ver
 * vertical.ts): el CSL 0 es la base más baja, y cada extremo lleva su base y
 * su tope. Así el alzado dibuja y mide el muro real, no una altura suelta.
 */
export function levelsFromProfile(p: {
  start: { base: number; top: number };
  end: { base: number; top: number };
}): VerticalLevels {
  const y0 = Math.min(p.start.base, p.end.base);
  const lt = p.start.top - y0;
  const rt = p.end.top - y0;
  const lb = p.start.base - y0;
  const rb = p.end.base - y0;
  const rect = Math.abs(lt - rt) < 1e-6 && Math.abs(lb) < 1e-6 && Math.abs(rb) < 1e-6;
  return rect
    ? { base: 0, coronacion: lt }
    : { base: 0, coronacion: Math.max(lt, rt), leftHeight: lt, rightHeight: rt, leftBase: lb, rightBase: rb };
}

/** Altura del muro en la coordenada CSL `localX`, interpolada si hay culata. */
export function heightAt(levels: VerticalLevels, localX: number, wallLength: number): number {
  if (!hasHeightProfile(levels)) return levels.coronacion;
  if (wallLength <= 0) return effectiveLeftHeight(levels);

  const t = Math.max(0, Math.min(1, localX / wallLength));
  return effectiveLeftHeight(levels) + (effectiveRightHeight(levels) - effectiveLeftHeight(levels)) * t;
}

// ---------------------------------------------------------------------------
// WallElevation
// ---------------------------------------------------------------------------

/** Elevación completa de un muro. Inmutable: cada edición produce una nueva. */
export interface WallElevation {
  readonly wallId: string;
  readonly roomId: string;
  readonly levels: VerticalLevels;
  readonly openings: readonly WallOpening[];
  /**
   * Cuando está activo, cambiar la coronación se propaga a los muros que
   * comparten nodo en el TopologyGraph — que es cómo se corona una planta
   * entera de una vez en lugar de muro a muro.
   */
  readonly chainModeEnabled: boolean;
}

export function defaultElevation(wallId: string, roomId: string, wallHeight: number): WallElevation {
  return {
    wallId,
    roomId,
    levels: { base: 0, coronacion: wallHeight },
    openings: [],
    chainModeEnabled: false,
  };
}

/** Altura mínima de antepecho entre los huecos. `null` si no hay ninguno. */
export function umbral(elevation: WallElevation): number | null {
  if (elevation.openings.length === 0) return null;
  return Math.min(...elevation.openings.map((o) => o.sillHeight));
}

/** Altura máxima de dintel entre los huecos. `null` si no hay ninguno. */
export function dintel(elevation: WallElevation): number | null {
  if (elevation.openings.length === 0) return null;
  return Math.max(...elevation.openings.map(openingTop));
}

// ---------------------------------------------------------------------------
// Cuantificación
// ---------------------------------------------------------------------------

/** Superficies del muro. NO se persiste: se recalcula siempre. */
export interface WallQuantification {
  readonly grossArea: SquareMeters;
  readonly openingArea: SquareMeters;
  readonly netArea: SquareMeters;
}

/**
 * Calcula bruto, huecos y neto.
 *
 * - Con culata, el bruto es el área del trapecio: longitud × (hIzq + hDer) / 2.
 * - Cada hueco se recorta contra el techo interpolado en su centro: un hueco
 *   que asome por encima de la coronación no puede descontar superficie que el
 *   muro no tiene.
 * - Los huecos se miden como UNIÓN de rectángulos, no como suma. Dos huecos
 *   solapados (una puerta y un hueco genérico que la engloba, por ejemplo)
 *   descontarían dos veces la zona común y el neto saldría más bajo de lo real.
 */
export function computeQuantification(
  elevation: WallElevation,
  wallLength: number,
): WallQuantification {
  const { levels } = elevation;

  // Trapecio: la media de las alturas netas (tope − base) de los extremos.
  const gross = hasHeightProfile(levels)
    ? wallLength *
      ((effectiveLeftHeight(levels) - (levels.leftBase ?? 0) + (effectiveRightHeight(levels) - (levels.rightBase ?? 0))) / 2)
    : wallLength * levels.coronacion;

  const rects: Rect[] = [];
  for (const opening of elevation.openings) {
    const ceiling = heightAt(levels, openingCenterX(opening), wallLength);
    const floor = baseAt(levels, openingCenterX(opening), wallLength);
    const effectiveTop = Math.max(0, Math.min(openingTop(opening), ceiling));
    const effectiveBottom = Math.max(opening.sillHeight, floor);
    const effectiveHeight = Math.max(0, effectiveTop - effectiveBottom);
    if (effectiveHeight > 0 && opening.width > 0) {
      rects.push({
        x0: opening.xOffset,
        y0: effectiveBottom,
        x1: openingEnd(opening),
        y1: effectiveBottom + effectiveHeight,
      });
    }
  }

  const openingArea = rectUnionArea(rects);

  return {
    grossArea: squareMeters(gross),
    openingArea: squareMeters(openingArea),
    netArea: squareMeters(Math.max(0, gross - openingArea)),
  };
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Área de la unión de rectángulos alineados a los ejes, por compresión de
 * coordenadas. O(n²) en el número de huecos — de sobra para los menos de
 * veinte que tiene un muro real, y exacto, que es lo que importa en una
 * medición que acaba en un presupuesto.
 */
function rectUnionArea(rects: readonly Rect[]): number {
  if (rects.length === 0) return 0;

  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);

  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const covered = rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
      if (covered) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  }
  return area;
}

// ---------------------------------------------------------------------------
// Valores por defecto de los huecos
// ---------------------------------------------------------------------------

/** Dimensiones típicas por tipo, para que colocar un hueco sea un solo toque. */
export const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sillHeight: number }> = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
  opening: { width: 1.0, height: 2.1, sillHeight: 0 },
};

export function openingTypeLabel(type: OpeningType): string {
  return type === 'door' ? 'Puerta' : type === 'window' ? 'Ventana' : 'Hueco';
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

/**
 * Formas serializadas. Se declaran aparte del tipo de dominio porque lo que se
 * guarda en SQLite es un contrato con las filas ya escritas: si el dominio
 * cambia un nombre de campo, esta capa es la que tiene que absorberlo.
 */
interface SerializedLevels {
  base?: number;
  coronacion: number;
  leftHeight?: number | null;
  rightHeight?: number | null;
  chainModeEnabled?: boolean;
}

export function serializeLevels(elevation: WallElevation): string {
  return JSON.stringify({
    base: elevation.levels.base,
    coronacion: elevation.levels.coronacion,
    leftHeight: elevation.levels.leftHeight ?? null,
    rightHeight: elevation.levels.rightHeight ?? null,
    chainModeEnabled: elevation.chainModeEnabled,
  });
}

export function deserializeLevels(json: string): { levels: VerticalLevels; chainModeEnabled: boolean } {
  const raw = JSON.parse(json) as SerializedLevels;
  return {
    levels: {
      base: raw.base ?? 0,
      coronacion: raw.coronacion,
      leftHeight: raw.leftHeight ?? undefined,
      rightHeight: raw.rightHeight ?? undefined,
    },
    chainModeEnabled: raw.chainModeEnabled ?? false,
  };
}

export function serializeOpenings(openings: readonly WallOpening[]): string {
  return JSON.stringify(openings);
}

export function deserializeOpenings(json: string): WallOpening[] {
  const raw = JSON.parse(json) as unknown;
  if (!Array.isArray(raw)) return [];

  // Se normaliza en vez de confiar en el JSON: una fila escrita por una versión
  // anterior puede no traer `isFlipped`, y un `undefined` ahí se propagaría a
  // la UI y al cálculo de superficies como un valor silenciosamente distinto
  // de `false`.
  return raw.map((o: Partial<WallOpening>) => ({
    id: wallOpeningId(String(o.id ?? '')),
    type: (o.type ?? 'opening') as OpeningType,
    xOffset: Number(o.xOffset ?? 0),
    width: Number(o.width ?? 0),
    sillHeight: Number(o.sillHeight ?? 0),
    height: Number(o.height ?? 0),
    isFlipped: Boolean(o.isFlipped),
    vanoId: o.vanoId,
    notes: o.notes,
  }));
}

export type { SquareMeters };
