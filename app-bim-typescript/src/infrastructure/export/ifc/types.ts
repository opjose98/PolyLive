// =============================================================================
// types.ts — Tipos IFC para exportación STEP (ISO 10303-21)
// Basado en: serializador-IFC-general.md, escritura-objetos-IFC.md
// =============================================================================

import { Room } from '../../../domain/objects/room';
import { Wall } from '../../../domain/objects/wall';
import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { Column } from '../../../domain/objects/column';
import { Floor } from '../../../domain/objects/floor';

// ---------------------------------------------------------------------------
// Entidades IFC mapeadas desde objetos BIM
// ---------------------------------------------------------------------------

/**
 * IfcProject — raíz del árbol IFC.
 * Contiene un IfcSite, que contiene un IfcBuilding, etc.
 */
export interface IfcProject {
  readonly globalId: string;   // GUID comprimido 22 chars
  readonly name: string;
  readonly description: string;
}

/**
 * IfcSite — ubicación geográfica del levantamiento.
 */
export interface IfcSite {
  readonly globalId: string;
  readonly name: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/**
 * IfcBuilding — edificio que contiene los espacios.
 */
export interface IfcBuilding {
  readonly globalId: string;
  readonly name: string;
}

/**
 * IfcSpace — recinto/espacio medido (mapeado desde Room).
 */
export interface IfcSpace {
  readonly globalId: string;
  readonly name: string;
  readonly area: number | null;
}

/**
 * IfcWall / IfcWallStandardCase — muro recto.
 * Geometría como extrusión de sección rectangular.
 */
export interface IfcWall {
  readonly globalId: string;
  readonly name: string;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly thickness: number;
  readonly height: number;
  readonly material?: string;
}

/**
 * IfcOpeningElement — abertura en un muro (puerta o ventana).
 * Genera un vano en la geometría del muro padre.
 */
export interface IfcOpeningElement {
  readonly globalId: string;
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
}

/**
 * IfcDoor — puerta vinculada a un IfcOpeningElement.
 */
export interface IfcDoor {
  readonly globalId: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly doorType?: string;
  readonly material?: string;
}

/**
 * IfcWindow — ventana vinculada a un IfcOpeningElement.
 */
export interface IfcWindow {
  readonly globalId: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly windowType?: string;
  readonly glazing?: string;
}

/**
 * IfcColumn — columna estructural.
 */
export interface IfcColumn {
  readonly globalId: string;
  readonly name: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly diameter: number;
  readonly height: number;
  readonly material?: string;
}

/**
 * IfcSlab — losa/piso del recinto (tipo FLOOR).
 */
export interface IfcSlab {
  readonly globalId: string;
  readonly name: string;
  readonly thickness: number;
  readonly material?: string;
}

// ---------------------------------------------------------------------------
// Input/Output del serializador
// ---------------------------------------------------------------------------

/**
 * Entrada para IFCSerializer.serialize().
 * Recolecta todos los objetos BIM de un Room para generar STEP.
 */
export interface SerializeInput {
  readonly room: Room;
  readonly walls: Wall[];
  readonly doors: Door[];
  readonly windows: Window[];
  readonly columns: Column[];
  readonly floor: Floor | null;
  readonly projectName?: string;
  readonly siteName?: string;
  readonly buildingName?: string;
  /**
   * Niveles del proyecto (cada uno será un IfcBuildingStorey). Sin ellos, un
   * único piso "Nivel 0" a cota 0 con todo dentro.
   */
  readonly levels?: readonly IfcLevelInput[];
  /** Nombre de cada fase por id, para rotular la fase de cada elemento. */
  readonly phaseNames?: ReadonlyMap<string, string>;
  /** Antepecho (m sobre la base del muro) de cada vano, por id de Door/Window. */
  readonly openingSills?: ReadonlyMap<string, number>;
  /** Autor del archivo (operador). */
  readonly author?: string;
  /** Clave estable del proyecto: fija el GUID de IfcProject entre exportaciones. */
  readonly projectKey?: string;
  /**
   * Recintos del espacio. Con recintos, cada uno es un IfcSpace; sin ellos se
   * exporta el contorno del espacio como un único IfcSpace (comportamiento anterior).
   */
  readonly zones?: readonly IfcZoneInput[];
  /**
   * Suelos ligados a recintos (F6a): un IfcSlab por suelo, con el contorno
   * neto de su recinto, bajo la cota de su piso.
   */
  readonly zoneFloors?: readonly Floor[];
}

/** Nivel del proyecto tal como llega al exportador. */
/**
 * Recinto con identidad (T0) → un IfcSpace en el piso de su nivel, con su
 * contorno a cara interior (la habitación de Revit).
 */
export interface IfcZoneInput {
  readonly id: string;
  /** Código corto (R-01): el `Name` del IfcSpace, el número de habitación en Revit. */
  readonly code: string;
  /** Nombre (Cocina, Baño…): el `LongName`. */
  readonly name: string;
  readonly levelId: string;
  readonly netPolygon: readonly { x: number; y: number }[];
  readonly netArea: number;
  readonly grossArea: number;
  readonly perimeter: number;
}

export interface IfcLevelInput {
  readonly id: string;
  readonly name: string;
  /** Cota, m. */
  readonly elevation: number;
  readonly isBase?: boolean;
}

// ---------------------------------------------------------------------------
// Resultado de validación (Compatibility Gate)
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning';

export interface GateValidationEntry {
  readonly criterion: number;    // 1-8
  readonly severity: ValidationSeverity;
  readonly message: string;
}

export interface GateValidationResult {
  readonly valid: boolean;       // true si no hay errors (warnings permitidos)
  readonly entries: GateValidationEntry[];
}
