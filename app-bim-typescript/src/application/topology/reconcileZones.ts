// =============================================================================
// reconcileZones.ts — Asignar contornos detectados a recintos con identidad
// =============================================================================
//
// Cada recarga, la topología devuelve los contornos cerrados de un nivel. Esta
// función decide a qué recinto PERSISTIDO corresponde cada uno, para que el
// recinto conserve su id (y con él nombre, uso, suelo, avance) aunque los
// muros se muevan, se dividan o se unan:
//
//   1. Semilla dentro: el contorno que contiene la semilla de un recinto es
//      ese recinto. Si contiene varias (se borró el muro entre dos), gana el
//      más antiguo y los demás quedan desligados.
//   2. Sin semilla dentro (el recinto se achicó y la semilla quedó afuera):
//      el recinto desligado o sin asignar cuyo último contorno contiene un
//      punto interior del nuevo.
//   3. Contorno sin recinto: recinto NUEVO, con el siguiente número.
//   4. Recinto sin contorno: queda desligado (no se borra). Si el contorno
//      vuelve (deshacer), lo recupera por su semilla.
//
// Dividir un recinto con un muro: el lado con la semilla conserva la
// identidad y el otro nace nuevo, que es lo que espera el operador.
// Función pura: el llamador persiste `changed`.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { isPointInPolygon } from '../../domain/geometry/polygon-utils';
import { Zone, defaultZoneName, interiorPoint } from '../../domain/objects/zone';

export interface DetectedContour {
  readonly polygon: readonly Point2D[];
  readonly area: number;
  readonly netPolygon: readonly Point2D[];
  readonly netArea: number;
  readonly perimeter: number;
}

interface ReconcileInput {
  /** Recintos del espacio en ESTE nivel (ligados y desligados). */
  readonly zones: readonly Zone[];
  readonly detected: readonly DetectedContour[];
  readonly spaceId: string;
  readonly levelId: string;
  /** Siguiente número libre en el espacio (todos los niveles). */
  readonly nextNumber: number;
  readonly newId: () => string;
  readonly now: string;
}

interface ReconcileResult {
  /** Recinto asignado a cada contorno, en el orden de `detected`. */
  readonly assigned: readonly Zone[];
  /** Recintos nuevos o modificados: hay que persistirlos. */
  readonly changed: readonly Zone[];
}

const samePoints = (a: readonly Point2D[], b: readonly Point2D[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-9 && Math.abs(p.y - b[i].y) < 1e-9);

const older = (a: Zone, b: Zone) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.number - b.number);

export function reconcileZones(input: ReconcileInput): ReconcileResult {
  const zones = [...input.zones].sort(older);
  const used = new Set<string>();
  const match: (Zone | null)[] = input.detected.map(() => null);

  // 1. Semilla dentro.
  input.detected.forEach((d, i) => {
    const z = zones.find((x) => !used.has(x.id) && isPointInPolygon(x.seed, d.polygon));
    if (z) {
      match[i] = z;
      used.add(z.id);
    }
  });

  // 2. Último contorno conocido que contiene un punto interior del nuevo.
  input.detected.forEach((d, i) => {
    if (match[i]) return;
    const probe = interiorPoint(d.polygon);
    const z = zones.find((x) => !used.has(x.id) && x.polygon.length >= 3 && isPointInPolygon(probe, x.polygon));
    if (z) {
      match[i] = z;
      used.add(z.id);
    }
  });

  const changed: Zone[] = [];
  let next = input.nextNumber;
  const assigned = input.detected.map((d, i): Zone => {
    const prev = match[i];
    const geom = {
      polygon: [...d.polygon],
      netPolygon: [...d.netPolygon],
      area: d.area,
      netArea: d.netArea,
      perimeter: d.perimeter,
    };
    if (!prev) {
      const number = next++;
      const zone: Zone = {
        id: input.newId(),
        spaceId: input.spaceId,
        levelId: input.levelId,
        number,
        name: defaultZoneName(number),
        use: '',
        notes: '',
        seed: interiorPoint(d.polygon),
        bound: true,
        createdAt: input.now,
        ...geom,
      };
      changed.push(zone);
      return zone;
    }
    // La semilla se conserva mientras siga dentro: es lo que da estabilidad.
    const seed = isPointInPolygon(prev.seed, d.polygon) ? prev.seed : interiorPoint(d.polygon);
    // Un recinto creado antes de cargar los niveles (nivel '') pasa al nivel en que se ve.
    const zone: Zone = { ...prev, ...geom, seed, bound: true, levelId: input.levelId };
    const same =
      prev.bound &&
      prev.levelId === input.levelId &&
      samePoints(prev.polygon, zone.polygon) &&
      samePoints(prev.netPolygon, zone.netPolygon) &&
      prev.seed === seed;
    if (!same) changed.push(zone);
    return zone;
  });

  // 4. Los que se quedaron sin contorno, desligados.
  for (const z of zones) {
    if (used.has(z.id) || !z.bound) continue;
    changed.push({ ...z, bound: false });
  }

  return { assigned, changed };
}
