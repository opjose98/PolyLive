// =============================================================================
// survey.ts — SurveyControlPoint y SiteCoordinateSystem (Spike #7: Topografía)
// Basado en: SurveyControlPoint.md, SiteCoordinateSystem.md (Obsidian
//            01-Dominio/survey), arquitectura-aplicacion-v1.md §3
//
// Ninguna de las dos entidades hereda de RevitObjectBase: ambas pertenecen a
// una Sede (Site) completa, no a un Recinto (Room) — igual que AuditPhoto y
// Measurement (ver audit-photo.ts, measurement.ts), que tampoco extienden
// RevitObjectBase por la misma razón estructural.
// =============================================================================

import { Meters, Degrees, Point3D } from '../geometry/types';

// ---------------------------------------------------------------------------
// Branded IDs — para seguridad de tipos (mismo patrón que base.ts)
// ---------------------------------------------------------------------------

export type SiteId = string & { readonly __brand: 'SiteId' };
export type SurveyControlPointId = string & { readonly __brand: 'SurveyControlPointId' };
export type OperatorId = string & { readonly __brand: 'OperatorId' };

export function siteId(value: string): SiteId {
  return value as SiteId;
}

export function surveyControlPointId(value: string): SurveyControlPointId {
  return value as SurveyControlPointId;
}

export function operatorId(value: string): OperatorId {
  return value as OperatorId;
}

// ---------------------------------------------------------------------------
// GpsCoordinates — coordenadas GPS de un mojón (SurveyControlPoint.md)
// ---------------------------------------------------------------------------

export interface GpsCoordinates {
  readonly latitude: number; // grados decimales
  readonly longitude: number; // grados decimales
  readonly altitude: Meters;
  readonly accuracy: Meters; // SIEMPRE > 0 — nunca asumir precisión perfecta
}

// ---------------------------------------------------------------------------
// SurveyControlPoint — mojón/benchmark topográfico (Maestro §4.3.2)
// ---------------------------------------------------------------------------

/**
 * Punto de control topográfico. Pertenece a una Sede completa (siteId),
 * nunca a un Recinto individual — a diferencia de todos los objetos que
 * extienden RevitObjectBase.
 *
 * INVARIANTES (SurveyControlPoint.md):
 * - `siteId` es REQUERIDO (pertenece a Sede, no a Room)
 * - `gpsCoordinates.accuracy` SIEMPRE > 0 (nunca asumir precisión perfecta)
 * - En MVP v0.1 es referencia documental — NO participa en cálculos internos
 *   de geometría BIM (riesgo aceptado explícito, ver SurveyControlPoint.md)
 */
export class SurveyControlPoint {
  readonly id: SurveyControlPointId;
  readonly siteId: SiteId;

  localCoordinates: Point3D;
  gpsCoordinates: GpsCoordinates;
  name?: string;
  notes?: string;

  readonly capturedAt: Date;
  is_deleted: boolean;

  constructor(params: {
    id: SurveyControlPointId;
    siteId: SiteId;
    localCoordinates: Point3D;
    gpsCoordinates: GpsCoordinates;
    name?: string;
    notes?: string;
    capturedAt?: Date;
    is_deleted?: boolean;
  }) {
    if (!(params.gpsCoordinates.accuracy > 0)) {
      throw new Error(
        'SurveyControlPoint.gpsCoordinates.accuracy debe ser mayor que 0 (nunca asumir precisión perfecta)',
      );
    }
    this.id = params.id;
    this.siteId = params.siteId;
    this.localCoordinates = params.localCoordinates;
    this.gpsCoordinates = params.gpsCoordinates;
    this.name = params.name;
    this.notes = params.notes;
    this.capturedAt = params.capturedAt ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }
}

// ---------------------------------------------------------------------------
// SiteCoordinateSystem — sistema de coordenadas de Sede (Maestro §4.3.1)
// ---------------------------------------------------------------------------

/**
 * Sistema de coordenadas que posiciona todos los Recintos de una Sede
 * (origen + rotación hacia el norte). Es un value object, no una entidad con
 * ciclo de vida propio: existe como mucho un `SiteCoordinateSystem` por Sede.
 *
 * INVARIANTES (SiteCoordinateSystem.md):
 * - Único por Sede (1:1 con `siteId`)
 * - `northRotation` normalizado a [0°, 360()) — ver `degrees()` en geometry/types.ts
 * - INMUTABLE una vez definido: "cambiar el sistema invalidaría todas las
 *   coordenadas de Recintos ya trazados". No existe un
 *   `UpdateSiteCoordinateSystem*` — la única forma de "cambiarlo" sería
 *   borrar la Sede completa, fuera de alcance de este UseCase.
 */
export interface SiteCoordinateSystem {
  readonly siteId: SiteId;
  readonly origin: Point3D;
  readonly northRotation: Degrees;
  readonly definedAt: Date;
  readonly definedBy: OperatorId;
}
