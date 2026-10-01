// =============================================================================
// benchmark.ts — Mojones (puntos de control topográfico)
// =============================================================================
//
// Un mojón es un punto con coordenadas REALES (lat/long, cota) y, dentro de
// un proyecto, una posición en el DIBUJO de un espacio. Con las dos cosas es
// un punto de amarre (ajuste por mojones). Los mojones viven en una
// BIBLIOTECA común: el mismo mojón de la obra se enlaza a varios proyectos.
//
// Formas de crearlo (acordadas con el usuario):
//   - tocando la planta: posición en el dibujo; sus coordenadas reales salen
//     de la georreferencia (si existe);
//   - digitando coordenadas (E/N en el sistema del proyecto, o lat/long);
//   - con el GPS del celular, quieto N segundos y promediado.
// Las coordenadas reales se guardan en lat/long MAGNA-SIRGAS: son
// independientes del sistema plano elegido, así el mojón sirve en cualquier
// proyecto aunque use otro origen.
// =============================================================================

import type { Point2D } from '../geometry/types';
import type { LatLon } from './crs';

export type BenchmarkSource = 'tap' | 'typed' | 'gps' | 'import';

export interface Benchmark {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Coordenadas reales; `null` en un mojón solo local (tocado sin georreferencia). */
  readonly latLon: LatLon | null;
  /** Cota real (msnm) si se conoce. */
  readonly h: number | null;
  readonly source: BenchmarkSource;
  /** Precisión horizontal (m) cuando viene de GPS. */
  readonly accuracy: number | null;
  readonly createdBy?: string;
  readonly createdAt: string;
}

/** Mojón enlazado a un proyecto, con su posición en el dibujo (si la tiene). */
export interface ProjectBenchmark extends Benchmark {
  readonly projectId: string;
  /** Espacio en cuyo dibujo está colocado; `null` si solo tiene coordenadas reales. */
  readonly spaceId: string | null;
  /** Posición en el modelo de ese espacio (Y abajo, como los muros). */
  readonly local: Point2D | null;
  readonly localZ: number | null;
}

/** ¿Sirve para amarrar? Necesita coordenadas reales Y posición en el dibujo. */
export function isControlPoint(b: ProjectBenchmark): boolean {
  return b.latLon !== null && b.local !== null && b.spaceId !== null;
}
