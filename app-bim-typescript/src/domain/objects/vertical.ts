// =============================================================================
// vertical.ts — Restricciones verticales de los elementos con altura
// =============================================================================
//
// Un elemento con altura (muro, columna) no guarda cotas absolutas: guarda A QUÉ
// NIVEL se ata su base y su tope, como Revit (Restricción de base / Desfase de
// base / Restricción superior / Desfase superior / Altura desconectada). Así,
// cambiar la cota de un nivel mueve todo lo que está atado a él, y el IFC que
// se lleva a Revit puede reconstruir el muro nativo con sus mismas restricciones.
//
// Un muro tiene una restricción por EXTREMO. Si las dos son iguales es un muro
// rectangular normal de Revit; si difieren (una culata, una base escalonada) su
// alzado es un trapecio, que en Revit es un muro con perfil editado.
//
// Los ids de nivel son los de `project_markers`. Un id que ya no existe (nivel
// borrado) se lee como la base del proyecto, cota 0; un tope atado a un nivel
// borrado cae a la altura desconectada, para no invertir el elemento.
// =============================================================================

/** Restricción vertical de un elemento (o de un extremo de muro). */
export interface VerticalExtent {
  readonly baseLevelId: string;
  /** Metros sobre (o bajo) la cota del nivel de base. */
  readonly baseOffset: number;
  /** Nivel del tope; `null` = sin restricción superior ("Desconectada" en Revit). */
  readonly topLevelId: string | null;
  /** Metros sobre (o bajo) la cota del nivel de tope. Sin nivel de tope no se usa. */
  readonly topOffset: number;
  /** Altura sobre la base cuando no hay nivel de tope. */
  readonly unconnectedHeight: number;
}

/** Restricciones de los dos extremos de un muro (inicio y fin de su eje). */
export interface WallVertical {
  readonly start: VerticalExtent;
  readonly end: VerticalExtent;
}

/** Cota de cada nivel del proyecto, por id. */
export type LevelElevations = ReadonlyMap<string, number>;

/** Cotas absolutas de base y tope de un extremo. */
export interface ResolvedExtent {
  readonly base: number;
  readonly top: number;
}

/** Alzado de un muro en cotas absolutas: el trapecio que dibuja el alzado. */
export interface WallProfile {
  readonly start: ResolvedExtent;
  readonly end: ResolvedExtent;
}

/** Altura mínima de un elemento: por debajo, la restricción está mal puesta. */
const MIN_VERTICAL_HEIGHT = 0.1;

const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export function extent(params: {
  baseLevelId: string;
  topLevelId?: string | null;
  baseOffset?: number;
  topOffset?: number;
  unconnectedHeight: number;
}): VerticalExtent {
  return {
    baseLevelId: params.baseLevelId,
    baseOffset: params.baseOffset ?? 0,
    topLevelId: params.topLevelId ?? null,
    topOffset: params.topOffset ?? 0,
    unconnectedHeight: params.unconnectedHeight,
  };
}

/** Muro rectangular: los dos extremos con la misma restricción. */
export function uniformWall(e: VerticalExtent): WallVertical {
  return { start: e, end: e };
}

export function sameExtent(a: VerticalExtent, b: VerticalExtent): boolean {
  return (
    a.baseLevelId === b.baseLevelId &&
    a.topLevelId === b.topLevelId &&
    Math.abs(a.baseOffset - b.baseOffset) < EPS &&
    Math.abs(a.topOffset - b.topOffset) < EPS &&
    (a.topLevelId !== null || Math.abs(a.unconnectedHeight - b.unconnectedHeight) < EPS)
  );
}

export function isUniformWall(v: WallVertical): boolean {
  return sameExtent(v.start, v.end);
}

// ---------------------------------------------------------------------------
// Resolución a cotas
// ---------------------------------------------------------------------------

function levelElevation(levels: LevelElevations, id: string): number {
  return levels.get(id) ?? 0;
}

export function resolveExtent(e: VerticalExtent, levels: LevelElevations): ResolvedExtent {
  const base = levelElevation(levels, e.baseLevelId) + e.baseOffset;
  const topLevel = e.topLevelId !== null ? levels.get(e.topLevelId) : undefined;
  const top = topLevel !== undefined ? topLevel + e.topOffset : base + e.unconnectedHeight;
  return { base, top };
}

export function resolveWallProfile(v: WallVertical, levels: LevelElevations): WallProfile {
  return { start: resolveExtent(v.start, levels), end: resolveExtent(v.end, levels) };
}

/**
 * Restricción en un punto intermedio del eje (`t` = fracción desde el inicio):
 * la que deja el alzado igual al partir el muro ahí. Se ata a los niveles del
 * inicio (o del fin si el inicio no tiene tope) con el desfase que haga falta.
 */
export function extentAt(v: WallVertical, t: number, levels: LevelElevations): VerticalExtent {
  if (sameExtent(v.start, v.end)) return v.start;
  const p = resolveWallProfile(v, levels);
  const at = (a: number, b: number) => a + (b - a) * t;
  const mm = (x: number) => Math.round(x * 1000) / 1000;
  const base = at(p.start.base, p.end.base);
  const top = at(p.start.top, p.end.top);
  const topLevelId = v.start.topLevelId ?? v.end.topLevelId;
  const topLevel = topLevelId !== null ? levels.get(topLevelId) : undefined;
  return {
    baseLevelId: v.start.baseLevelId,
    baseOffset: mm(base - levelElevation(levels, v.start.baseLevelId)),
    topLevelId: topLevel !== undefined ? topLevelId : null,
    topOffset: topLevel !== undefined ? mm(top - topLevel) : 0,
    unconnectedHeight: mm(top - base),
  };
}

/** Un alzado es rectangular si base y tope son iguales en los dos extremos. */
export function isRectangularProfile(p: WallProfile): boolean {
  return Math.abs(p.start.base - p.end.base) < EPS && Math.abs(p.start.top - p.end.top) < EPS;
}

export function profileBottom(p: WallProfile): number {
  return Math.min(p.start.base, p.end.base);
}

export function profileTop(p: WallProfile): number {
  return Math.max(p.start.top, p.end.top);
}

/** ¿El elemento atraviesa la cota `z`? (base ≤ z < tope en algún punto del eje) */
export function profileSpans(p: WallProfile, z: number): boolean {
  return profileBottom(p) - EPS <= z && z < profileTop(p) - EPS;
}

/** Motivo por el que el alzado no es construible, o `null` si lo es. */
export function profileProblem(p: WallProfile): string | null {
  for (const [label, e] of [['inicio', p.start], ['fin', p.end]] as const) {
    if (e.top - e.base < MIN_VERTICAL_HEIGHT - EPS) {
      return `El tope queda por debajo de la base en el ${label} del muro.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Equivalencia con Revit
// ---------------------------------------------------------------------------

/**
 * Parámetros de instancia de un muro de Revit. Para un muro con perfil editado
 * son la caja envolvente (base más baja, tope más alto): Revit guarda el muro
 * así y el perfil recorta dentro de ella.
 */
interface RevitWallConstraints {
  readonly baseLevelId: string;
  readonly baseOffset: number;
  readonly topLevelId: string | null;
  readonly topOffset: number;
  readonly unconnectedHeight: number;
  readonly profileEdited: boolean;
}

export function revitConstraints(v: WallVertical, levels: LevelElevations): RevitWallConstraints {
  const p = resolveWallProfile(v, levels);
  const low = p.start.base <= p.end.base + EPS ? v.start : v.end;
  const high = p.start.top >= p.end.top - EPS ? v.start : v.end;
  const bottom = profileBottom(p);
  const top = profileTop(p);
  const topLevelKnown = high.topLevelId !== null && levels.has(high.topLevelId);
  return {
    baseLevelId: low.baseLevelId,
    baseOffset: low.baseOffset,
    topLevelId: topLevelKnown ? high.topLevelId : null,
    topOffset: topLevelKnown ? high.topOffset : 0,
    unconnectedHeight: top - bottom,
    profileEdited: !isRectangularProfile(p),
  };
}

/**
 * Nivel al que pertenece el elemento en planta: el de su base más baja (la
 * "Restricción de base" de Revit). Es el piso donde se exporta a IFC.
 */
export function hostLevelOf(v: WallVertical, levels: LevelElevations): string {
  return revitConstraints(v, levels).baseLevelId;
}

/** Altura total del alzado (lo que `Wall.height` guarda como resumen). */
export function profileHeight(p: WallProfile): number {
  return profileTop(p) - profileBottom(p);
}

// ---------------------------------------------------------------------------
// Elementos sin restricción guardada
// ---------------------------------------------------------------------------

/**
 * Restricción de un muro. Los muros levantados antes de existir las
 * restricciones no la traen: se leen como atados a su nivel (`levelMarkerId`)
 * con altura desconectada `height`, que es exactamente lo que eran.
 */
export function wallVerticalOf(
  wall: { readonly vertical?: WallVertical; readonly height: number; readonly properties?: Record<string, unknown> },
  baseLevelId: string,
  levelProp: string,
): WallVertical {
  if (wall.vertical) return wall.vertical;
  const own = wall.properties?.[levelProp];
  return uniformWall(
    extent({ baseLevelId: typeof own === 'string' ? own : baseLevelId, unconnectedHeight: wall.height as number }),
  );
}

/** Ídem para una columna (una sola restricción). */
export function columnVerticalOf(
  column: { readonly vertical?: VerticalExtent; readonly height: number; readonly properties?: Record<string, unknown> },
  baseLevelId: string,
  levelProp: string,
): VerticalExtent {
  if (column.vertical) return column.vertical;
  const own = column.properties?.[levelProp];
  return extent({ baseLevelId: typeof own === 'string' ? own : baseLevelId, unconnectedHeight: column.height as number });
}

/** Lee una restricción persistida, descartando lo que no tenga la forma esperada. */
export function parseExtent(raw: unknown): VerticalExtent | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.baseLevelId !== 'string') return undefined;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const unconnectedHeight = num(o.unconnectedHeight, NaN);
  if (!Number.isFinite(unconnectedHeight)) return undefined;
  return {
    baseLevelId: o.baseLevelId,
    baseOffset: num(o.baseOffset, 0),
    topLevelId: typeof o.topLevelId === 'string' ? o.topLevelId : null,
    topOffset: num(o.topOffset, 0),
    unconnectedHeight,
  };
}

export function parseWallVertical(raw: unknown): WallVertical | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const start = parseExtent(o.start);
  const end = parseExtent(o.end);
  return start && end ? { start, end } : undefined;
}
