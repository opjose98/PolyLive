// =============================================================================
// marker.ts — Niveles y fases de un proyecto
// =============================================================================
//
// Son de cada ESPACIO (docs/23 § 7): dos espacios del mismo proyecto pueden tener
// cotas distintas. Un id solo es único dentro de su espacio.
//
// Un NIVEL es espacial (cota en metros); una FASE es temporal (orden). Los dos
// se comportan igual en la app: una lista ordenada por valor, con una base
// (valor 0) que siempre existe y no se puede borrar.
//
// Un objeto BIM guarda su nivel y su fase en `properties.levelId` /
// `properties.phaseId`. Un objeto sin ellos —todo lo levantado antes de que
// existieran— pertenece a la base: así no hay que migrar ni una fila.
// =============================================================================

export type MarkerKind = 'level' | 'phase';

/** Dónde viven unos niveles o fases: el espacio (su id de recinto) de un proyecto. */
export interface MarkerScope {
  readonly projectId: string;
  readonly spaceId: string;
}

export interface ProjectMarker {
  readonly id: string;
  readonly projectId: string;
  readonly spaceId: string;
  readonly kind: MarkerKind;
  readonly name: string;
  /** Nivel: cota en metros. Fase: orden. */
  readonly value: number;
  readonly isBase: boolean;
}

/** Id determinista de la base de un proyecto: existe siempre, sin consultar. */
export function baseMarkerId(projectId: string, kind: MarkerKind): string {
  return `${projectId}:${kind}:base`;
}

export const BASE_MARKER_NAME: Readonly<Record<MarkerKind, string>> = {
  level: 'Nivel 0',
  phase: 'Fase 0',
};

/** Claves en `RevitObjectBase.properties`. */
export const LEVEL_PROP = 'levelMarkerId';
export const PHASE_PROP = 'phaseId';

/**
 * Niveles que se proponen al crear un espacio (cotas de los planos NARG29, editables).
 * El primero renombra la base (cota 0).
 */
export const LEVEL_TEMPLATE: readonly { readonly name: string; readonly value: number }[] = [
  { name: 'Piso', value: 0 },
  { name: 'Muro', value: 2.4 },
  { name: 'Viga', value: 2.6 },
  { name: 'Cubierta', value: 3.5 },
];
