// =============================================================================
// zoneExport.ts — Recintos con identidad hacia IFC y DXF
// =============================================================================
//
// Solo los recintos LIGADOS (hoy cerrados) salen del dispositivo: uno
// desligado es memoria para deshacer, no un espacio que exista.
// =============================================================================

import { Zone, interiorPoint, zoneCode } from '../../domain/objects/zone';
import type { IfcZoneInput } from '../../infrastructure/export/ifc/types';
import type { DXFZone } from '../../infrastructure/export/dxf/DXFSerializer';

const live = (zones: readonly Zone[]) => zones.filter((z) => z.bound && z.netPolygon.length >= 3);

export function ifcZones(zones: readonly Zone[]): IfcZoneInput[] {
  return live(zones).map((z) => ({
    id: z.id,
    code: zoneCode(z),
    name: z.name,
    levelId: z.levelId,
    netPolygon: z.netPolygon,
    netArea: z.netArea,
    grossArea: z.area,
    perimeter: z.perimeter,
  }));
}

/** Para el DXF de la planta de UN nivel (`levelId`, o todos si se omite). */
export function dxfZones(zones: readonly Zone[], levelId?: string): DXFZone[] {
  return live(zones)
    .filter((z) => levelId === undefined || z.levelId === levelId || z.levelId === '')
    .map((z) => ({
      code: zoneCode(z),
      name: z.name,
      polygon: z.netPolygon,
      netArea: z.netArea,
      label: interiorPoint(z.netPolygon),
    }));
}
