// =============================================================================
// georeference.ts — Amarre del proyecto a coordenadas reales
// =============================================================================
//
// El modelo SIEMPRE se guarda en coordenadas locales (desde 0,0,0). Las reales
// se CALCULAN con esta transformación, así que cambiar el amarre recalcula
// todos los espacios del proyecto sin tocar un solo muro.
//
// Dos capas:
//   espacio (modelo, Y abajo) ─ubicación del espacio→ proyecto (local, Y arriba)
//                              ─georreferencia→ plano del CRS (Este, Norte)
//
// Georreferencia (similaridad 2D, "Helmert de 4 parámetros"):
//   E = E0 + s·( x·cosθ + y·sinθ )
//   N = N0 + s·(−x·sinθ + y·cosθ )
// θ = azimut (horario desde el norte de cuadrícula) del eje +Y local. s = 1
// salvo que se ajuste por mojones con escala libre. Z real = Z local + z0.
// =============================================================================

import type { Point2D } from '../geometry/types';
import { toLocal } from '../geometry/handedness';
import { CrsId, GridPoint } from './crs';

export type AmarreMethod = 'origin' | 'gps' | 'control' | 'none';

export interface Georeference {
  readonly crs: CrsId;
  readonly method: AmarreMethod;
  /** Coordenadas planas del 0,0 local del proyecto. */
  readonly origin: GridPoint;
  /** Azimut del eje +Y local (rad, horario desde el norte de cuadrícula). */
  readonly rotation: number;
  readonly scale: number;
  /** Cota real (msnm) del Z = 0 local (cota 0 del Nivel 0). */
  readonly z0: number;
  /** Ajuste por mojones: diferencias por punto y error medio cuadrático (m). */
  readonly residuals?: readonly { readonly id: string; readonly de: number; readonly dn: number }[];
  readonly rmse?: number;
  /** Segundos que se promedia el GPS al tomar un punto. */
  readonly gpsSeconds: number;
  /** Ubicación de cada espacio dentro del proyecto (por id de espacio). */
  readonly placements: Readonly<Record<string, SpacePlacement>>;
  readonly definedAt: string;
  readonly definedBy?: string;
}

/** Espacio → proyecto: el 0,0 del espacio en el proyecto y su giro (rad, antihorario). */
export interface SpacePlacement {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export const IDENTITY_PLACEMENT: SpacePlacement = { x: 0, y: 0, rotation: 0 };
export const DEFAULT_GPS_SECONDS = 30;

export function placementOf(geo: Georeference | null, spaceId: string): SpacePlacement {
  return geo?.placements[spaceId] ?? IDENTITY_PLACEMENT;
}

// ---------------------------------------------------------------------------
// Transformaciones
// ---------------------------------------------------------------------------

/** Proyecto (local, Y arriba) → plano (E, N). */
export function localToGrid(geo: Georeference, p: Point2D): GridPoint {
  const c = Math.cos(geo.rotation) * geo.scale;
  const s = Math.sin(geo.rotation) * geo.scale;
  return { e: geo.origin.e + p.x * c + p.y * s, n: geo.origin.n - p.x * s + p.y * c };
}

/** Plano (E, N) → proyecto (local, Y arriba). */
export function gridToLocal(geo: Georeference, g: GridPoint): Point2D {
  const de = g.e - geo.origin.e;
  const dn = g.n - geo.origin.n;
  const c = Math.cos(geo.rotation);
  const s = Math.sin(geo.rotation);
  return { x: (de * c - dn * s) / geo.scale, y: (de * s + dn * c) / geo.scale };
}

/** Espacio (modelo, Y abajo) → proyecto (local, Y arriba). */
export function spaceToProject(pl: SpacePlacement, pModel: Point2D): Point2D {
  const l = toLocal(pModel);
  const c = Math.cos(pl.rotation);
  const s = Math.sin(pl.rotation);
  return { x: pl.x + l.x * c - l.y * s, y: pl.y + l.x * s + l.y * c };
}

export function projectToSpace(pl: SpacePlacement, pProject: Point2D): Point2D {
  const dx = pProject.x - pl.x;
  const dy = pProject.y - pl.y;
  const c = Math.cos(pl.rotation);
  const s = Math.sin(pl.rotation);
  return toLocal({ x: dx * c + dy * s, y: -dx * s + dy * c });
}

/** Punto del modelo de un espacio → coordenadas planas reales. */
export function modelToGrid(geo: Georeference, spaceId: string, pModel: Point2D): GridPoint {
  return localToGrid(geo, spaceToProject(placementOf(geo, spaceId), pModel));
}

export function gridToModel(geo: Georeference, spaceId: string, g: GridPoint): Point2D {
  return projectToSpace(placementOf(geo, spaceId), gridToLocal(geo, g));
}

/**
 * Hacia dónde queda el norte de cuadrícula en un espacio: ángulo (rad,
 * horario) desde su +Y local. Es lo que dibuja la aguja del gizmo.
 */
export function northFromLocalY(geo: Georeference, spaceId: string): number {
  return -(geo.rotation + placementOf(geo, spaceId).rotation);
}

/**
 * Giro de la VISTA que deja el norte arriba en pantalla. Con giro 0 la +Y
 * local apunta arriba; hay que girar la vista para que el norte (a
 * `northFromLocalY` en sentido horario) quede arriba.
 */
export function northUpViewRotation(geo: Georeference, spaceId: string): number {
  const a = -northFromLocalY(geo, spaceId);
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// ---------------------------------------------------------------------------
// Amarres
// ---------------------------------------------------------------------------

/** (a) Un punto local con coordenadas conocidas y el azimut del eje +Y local. */
export function amarreByPointAndAzimuth(localPoint: Point2D, grid: GridPoint, azimuth: number): Pick<Georeference, 'origin' | 'rotation' | 'scale'> {
  const c = Math.cos(azimuth);
  const s = Math.sin(azimuth);
  return {
    rotation: azimuth,
    scale: 1,
    origin: { e: grid.e - (localPoint.x * c + localPoint.y * s), n: grid.n - (-localPoint.x * s + localPoint.y * c) },
  };
}

export interface ControlPair {
  readonly id: string;
  /** Posición en el proyecto (local, Y arriba). */
  readonly local: Point2D;
  readonly grid: GridPoint;
}

export interface FitResult {
  readonly origin: GridPoint;
  readonly rotation: number;
  readonly scale: number;
  readonly residuals: readonly { readonly id: string; readonly de: number; readonly dn: number }[];
  readonly rmse: number;
}

/**
 * (c) Ajuste por mínimos cuadrados con ≥2 mojones (Helmert 2D). Con
 * `freeScale = false` (lo normal en un levantamiento con cinta/láser) la
 * escala se fija en 1 y solo se ajustan traslación y giro. Los residuales
 * dicen cuánto no cuadra cada mojón: es la medida de calidad del amarre.
 */
export function fitControlPoints(pairs: readonly ControlPair[], freeScale = false): FitResult {
  if (pairs.length < 2) throw new Error('Se necesitan al menos 2 mojones para ajustar.');
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p.local.x, 0) / n;
  const my = pairs.reduce((a, p) => a + p.local.y, 0) / n;
  const me = pairs.reduce((a, p) => a + p.grid.e, 0) / n;
  const mn = pairs.reduce((a, p) => a + p.grid.n, 0) / n;
  let sxx = 0;
  let num1 = 0;
  let num2 = 0;
  for (const p of pairs) {
    const dx = p.local.x - mx;
    const dy = p.local.y - my;
    const de = p.grid.e - me;
    const dn = p.grid.n - mn;
    sxx += dx * dx + dy * dy;
    num1 += dx * de + dy * dn;
    num2 += dy * de - dx * dn;
  }
  if (sxx < 1e-9) throw new Error('Los mojones coinciden en el dibujo: deben estar separados.');
  let a = num1 / sxx; // s·cosθ
  let b = num2 / sxx; // s·sinθ
  let scale = Math.hypot(a, b);
  if (!freeScale) {
    a /= scale;
    b /= scale;
    scale = 1;
  }
  const rotation = Math.atan2(b, a);
  const origin = { e: me - a * mx - b * my, n: mn + b * mx - a * my };
  const residuals = pairs.map((p) => {
    const e = origin.e + a * p.local.x + b * p.local.y;
    const nn = origin.n - b * p.local.x + a * p.local.y;
    return { id: p.id, de: p.grid.e - e, dn: p.grid.n - nn };
  });
  const rmse = Math.sqrt(residuals.reduce((acc, r) => acc + r.de * r.de + r.dn * r.dn, 0) / n);
  return { origin, rotation, scale, residuals, rmse };
}

/** Azimut en grados sexagesimales [0, 360). */
export function azimuthDegrees(rad: number): number {
  const d = (rad * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}
