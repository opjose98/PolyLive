// =============================================================================
// marker.ts — Niveles y fases de un proyecto
// =============================================================================
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

export interface ProjectMarker {
  readonly id: string;
  readonly projectId: string;
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
