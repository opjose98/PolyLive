// =============================================================================
// step-writer.ts — Generador de líneas STEP (ISO 10303-21 / IFC4)
// Basado en: serializador-IFC-general.md, escritura-objetos-IFC.md
//
// Estructura STEP:
//   ISO-10303-21;
//   HEADER; ... ENDSEC;
//   DATA;
//     #1=IfcProject(...)
//     #2=IfcSite(...)
//     ...
//   ENDSEC;
//   END-ISO-10303-21;
//
// Cada entidad recibe un ID secuencial (#N) dentro del bloque DATA.
// Los GUIDs se escriben entre comillas simples en formato IFC comprimido.
// =============================================================================

import { Room } from '../../../domain/objects/room';
import { Wall } from '../../../domain/objects/wall';
import { Door } from '../../../domain/objects/door';
import { Window } from '../../../domain/objects/window';
import { Column } from '../../../domain/objects/column';
import { Floor } from '../../../domain/objects/floor';
import { generateGuid } from './guid-generator';

/**
 * StepWriter — genera un archivo STEP/IFC completo como string.
 *
 * Uso:
 *   const writer = new StepWriter();
 *   const header = writer.writeHeader();
 *   const project = writer.writeProject();
 *   // ... etc
 *   const footer = writer.writeFooter();
 *   const fullFile = header + project + ... + footer;
 *
 * El writer mantiene un contador de IDs (#N) para asignar IDs secuenciales
 * a cada entidad. Los IDs retornados permiten crear relaciones padre-hijo.
 */
export class StepWriter {
  private _nextId = 1;

  /** Obtiene el próximo ID secuencial (#N) sin consumirlo. */
  get currentId(): number {
    return this._nextId;
  }

  /** Reserva y retorna el próximo ID secuencial. */
  private nextId(): number {
    return this._nextId++;
  }

  /** Escapa un string para STEP (comillas simples, caracteres especiales). */
  private escapeStep(value: string): string {
    return value.replace(/'/g, "''").replace(/\\/g, '\\\\');
  }

  /** Timestamp ISO 8601 para el header STEP. */
  private timestamp(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '');
  }

  // -------------------------------------------------------------------------
  // HEADER — ISO 10303-21 preámbulo
  // -------------------------------------------------------------------------

  /**
   * Genera el bloque HEADER del archivo STEP.
   * Incluye FILE_DESCRIPTION, FILE_NAME, FILE_SCHEMA('IFC4').
   */
  writeHeader(description?: string): string {
    const desc = description ?? 'BIM Survey Export';
    const ts = this.timestamp();
    return [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_DESCRIPTION(('${this.escapeStep(desc)}'),'2;1');`,
      `FILE_NAME('export.ifc','${ts}',('PolyLive App'),(''),` +
        `'PolyLive IFC Serializer','PolyLive v0.1','');`,
      "FILE_SCHEMA(('IFC4'));",
      'ENDSEC;',
      'DATA;',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // FOOTER
  // -------------------------------------------------------------------------

  /** Cierra el bloque DATA y el archivo STEP. */
  writeFooter(): string {
    return ['ENDSEC;', 'END-ISO-10303-21;'].join('\n');
  }

  // -------------------------------------------------------------------------
  // IfcProject — raíz del modelo IFC
  // -------------------------------------------------------------------------

  /**
   * Genera IfcProject con unidades SI (metros, radianes).
   * Retorna { lines, projectId, guid }.
   */
  writeProject(name?: string): { lines: string; projectId: number; guid: string } {
    const guid = generateGuid();
    const projectName = name ?? 'PolyLive Project';

    // Unidades: longitud en metros, ángulos en radianes
    const dimExpId = this.nextId();
    const siUnitMeterId = this.nextId();
    const siUnitRadianId = this.nextId();
    const unitAssignId = this.nextId();
    const contextId = this.nextId();
    const projectId = this.nextId();

    const lines = [
      `#${dimExpId}=IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0);`,
      `#${siUnitMeterId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`,
      `#${siUnitRadianId}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`,
      `#${unitAssignId}=IFCUNITASSIGNMENT((#${siUnitMeterId},#${siUnitRadianId}));`,
      `#${contextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${this._nextId},$);`,
      `#${this.nextId()}=IFCAXIS2PLACEMENT3D(#${this._nextId},$,$);`,
      `#${this.nextId()}=IFCCARTESIANPOINT((0.0,0.0,0.0));`,
      `#${projectId}=IFCPROJECT('${guid}',#${this._nextId},'${this.escapeStep(projectName)}',$,$,$,$,(#${contextId}),#${unitAssignId});`,
      `#${this.nextId()}=IFCOWNERHISTORY(#${this._nextId + 1},#${this._nextId + 2},$,.ADDED.,$,$,$,0);`,
      `#${this.nextId()}=IFCPERSONANDORGANIZATION(#${this._nextId + 1},#${this._nextId + 2},$);`,
      `#${this.nextId()}=IFCPERSON($,'PolyLive','Operator',$,$,$,$,$);`,
      `#${this.nextId()}=IFCORGANIZATION($,'PolyLive App',$,$,$);`,
      `#${this.nextId()}=IFCAPPLICATION(#${this._nextId - 1},'0.1','PolyLive','PolyLive');`,
    ];

    return { lines: lines.join('\n'), projectId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcSite
  // -------------------------------------------------------------------------

  /**
   * Genera IfcSite vinculado al IfcProject.
   */
  writeSite(
    projectId: number,
    name?: string
  ): { lines: string; siteId: number; guid: string } {
    const guid = generateGuid();
    const siteName = name ?? 'Survey Site';

    const placementId = this.nextId();
    const axisId = this.nextId();
    const pointId = this.nextId();
    const siteId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const lines = [
      `#${pointId}=IFCCARTESIANPOINT((0.0,0.0,0.0));`,
      `#${axisId}=IFCAXIS2PLACEMENT3D(#${pointId},$,$);`,
      `#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`,
      `#${siteId}=IFCSITE('${guid}',$,'${this.escapeStep(siteName)}',$,$,#${placementId},$,$,.ELEMENT.,$,$,$,$,$);`,
      `#${relId}=IFCRELAGGREGATES('${relGuid}',$,$,$,#${projectId},(#${siteId}));`,
    ];

    return { lines: lines.join('\n'), siteId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcBuilding
  // -------------------------------------------------------------------------

  /**
   * Genera IfcBuilding vinculado al IfcSite.
   */
  writeBuilding(
    siteId: number,
    name?: string
  ): { lines: string; buildingId: number; guid: string } {
    const guid = generateGuid();
    const buildingName = name ?? 'Building';

    const placementId = this.nextId();
    const axisId = this.nextId();
    const pointId = this.nextId();
    const buildingId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const lines = [
      `#${pointId}=IFCCARTESIANPOINT((0.0,0.0,0.0));`,
      `#${axisId}=IFCAXIS2PLACEMENT3D(#${pointId},$,$);`,
      `#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`,
      `#${buildingId}=IFCBUILDING('${guid}',$,'${this.escapeStep(buildingName)}',$,$,#${placementId},$,$,.ELEMENT.,$,$,$);`,
      `#${relId}=IFCRELAGGREGATES('${relGuid}',$,$,$,#${siteId},(#${buildingId}));`,
    ];

    return { lines: lines.join('\n'), buildingId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcSpace — Room/Recinto
  // -------------------------------------------------------------------------

  /**
   * Genera IfcSpace con geometría como IfcPolyline del contorno.
   */
  writeSpace(
    room: Room,
    buildingId: number
  ): { lines: string; spaceId: number; guid: string } {
    const guid = generateGuid();
    const name = room.properties.name ?? `Room_${room.id}`;

    const placementId = this.nextId();
    const axisId = this.nextId();
    const pointId = this.nextId();

    // Generar puntos del contorno
    const contourPointIds: number[] = [];
    for (const vertex of room.geometry) {
      const pid = this.nextId();
      contourPointIds.push(pid);
    }
    // Cerrar el polígono: repetir primer punto
    if (room.geometry.length > 0) {
      const pid = this.nextId();
      contourPointIds.push(pid);
    }

    const polylineId = this.nextId();
    const profileId = this.nextId();
    const directionId = this.nextId();
    const extrusionId = this.nextId();
    const shapeRepId = this.nextId();
    const productShapeId = this.nextId();
    const spaceId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const linesParts: string[] = [];

    // Placement
    linesParts.push(`#${pointId}=IFCCARTESIANPOINT((0.0,0.0,0.0));`);
    linesParts.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${pointId},$,$);`);
    linesParts.push(`#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`);

    // Contour points
    for (let i = 0; i < room.geometry.length; i++) {
      const v = room.geometry[i];
      linesParts.push(
        `#${contourPointIds[i]}=IFCCARTESIANPOINT((${v.x.toFixed(4)},${v.y.toFixed(4)}));`
      );
    }
    // Closing point = first point
    if (room.geometry.length > 0) {
      const first = room.geometry[0];
      linesParts.push(
        `#${contourPointIds[contourPointIds.length - 1]}=IFCCARTESIANPOINT((${first.x.toFixed(4)},${first.y.toFixed(4)}));`
      );
    }

    // Polyline & profile
    const pointRefs = contourPointIds.map((id) => `#${id}`).join(',');
    linesParts.push(`#${polylineId}=IFCPOLYLINE((${pointRefs}));`);
    linesParts.push(
      `#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${polylineId});`
    );

    // Extrusion direction (Z up) & solid
    linesParts.push(`#${directionId}=IFCDIRECTION((0.0,0.0,1.0));`);

    // Default height 3.0m for IfcSpace
    const spaceHeight = 3.0;
    const axis2dId = this.nextId();
    const originId = this.nextId();
    linesParts.push(`#${originId}=IFCCARTESIANPOINT((0.0,0.0));`);
    linesParts.push(`#${axis2dId}=IFCAXIS2PLACEMENT2D(#${originId},$);`);

    linesParts.push(
      `#${extrusionId}=IFCEXTRUDEDAREASOLID(#${profileId},#${axisId},#${directionId},${spaceHeight.toFixed(1)});`
    );

    // Shape representation
    linesParts.push(
      `#${shapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${extrusionId}));`
    );
    linesParts.push(
      `#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`
    );

    // IfcSpace entity
    linesParts.push(
      `#${spaceId}=IFCSPACE('${guid}',$,'${this.escapeStep(name)}',$,$,#${placementId},#${productShapeId},$,.ELEMENT.,.INTERNAL.);`
    );

    // Aggregate to building
    linesParts.push(
      `#${relId}=IFCRELAGGREGATES('${relGuid}',$,$,$,#${buildingId},(#${spaceId}));`
    );

    return { lines: linesParts.join('\n'), spaceId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcWallStandardCase — muro recto
  // -------------------------------------------------------------------------

  /**
   * Genera IfcWallStandardCase con geometría extruida.
   * Retorna { lines, wallStepId, guid }.
   */
  writeWall(
    wall: Wall,
    spaceId: number
  ): { lines: string; wallStepId: number; guid: string } {
    const guid = generateGuid();
    const name = wall.properties.name ?? wall.material ?? `Wall_${wall.id}`;

    // Dirección del muro
    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dirX = len > 0 ? dx / len : 1.0;
    const dirY = len > 0 ? dy / len : 0.0;

    // Puntos del perfil rectangular (espesor × longitud)
    const halfThick = (wall.thickness as number) / 2;
    const perpX = -dirY;
    const perpY = dirX;

    const p1Id = this.nextId();
    const p2Id = this.nextId();
    const p3Id = this.nextId();
    const p4Id = this.nextId();
    const p5Id = this.nextId(); // closing = p1

    // Rectangle corners relative to startPoint
    const sx = wall.startPoint.x;
    const sy = wall.startPoint.y;

    const corners = [
      { x: sx + perpX * halfThick, y: sy + perpY * halfThick },
      { x: sx + perpX * halfThick + dx, y: sy + perpY * halfThick + dy },
      { x: sx - perpX * halfThick + dx, y: sy - perpY * halfThick + dy },
      { x: sx - perpX * halfThick, y: sy - perpY * halfThick },
    ];

    const polylineId = this.nextId();
    const profileId = this.nextId();
    const originId = this.nextId();
    const axisId = this.nextId();
    const placementId = this.nextId();
    const directionId = this.nextId();
    const extrusionId = this.nextId();
    const shapeRepId = this.nextId();
    const productShapeId = this.nextId();
    const wallStepId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const linesParts: string[] = [];

    // Profile points
    linesParts.push(`#${p1Id}=IFCCARTESIANPOINT((${corners[0].x.toFixed(4)},${corners[0].y.toFixed(4)}));`);
    linesParts.push(`#${p2Id}=IFCCARTESIANPOINT((${corners[1].x.toFixed(4)},${corners[1].y.toFixed(4)}));`);
    linesParts.push(`#${p3Id}=IFCCARTESIANPOINT((${corners[2].x.toFixed(4)},${corners[2].y.toFixed(4)}));`);
    linesParts.push(`#${p4Id}=IFCCARTESIANPOINT((${corners[3].x.toFixed(4)},${corners[3].y.toFixed(4)}));`);
    linesParts.push(`#${p5Id}=IFCCARTESIANPOINT((${corners[0].x.toFixed(4)},${corners[0].y.toFixed(4)}));`);

    linesParts.push(`#${polylineId}=IFCPOLYLINE((#${p1Id},#${p2Id},#${p3Id},#${p4Id},#${p5Id}));`);
    linesParts.push(`#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${polylineId});`);

    // Placement at origin
    linesParts.push(`#${originId}=IFCCARTESIANPOINT((0.0,0.0,0.0));`);
    linesParts.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${originId},$,$);`);
    linesParts.push(`#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`);

    // Extrude along Z
    linesParts.push(`#${directionId}=IFCDIRECTION((0.0,0.0,1.0));`);
    linesParts.push(
      `#${extrusionId}=IFCEXTRUDEDAREASOLID(#${profileId},#${axisId},#${directionId},${(wall.height as number).toFixed(4)});`
    );

    // Shape
    linesParts.push(`#${shapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${extrusionId}));`);
    linesParts.push(`#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);

    // IfcWallStandardCase
    linesParts.push(
      `#${wallStepId}=IFCWALLSTANDARDCASE('${guid}',$,'${this.escapeStep(name)}',$,$,#${placementId},#${productShapeId},$);`
    );

    // Contain in space
    linesParts.push(
      `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${relGuid}',$,$,$,(#${wallStepId}),#${spaceId});`
    );

    return { lines: linesParts.join('\n'), wallStepId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcDoor con IfcOpeningElement
  // -------------------------------------------------------------------------

  /**
   * Genera IfcOpeningElement + IfcDoor vinculados al muro padre.
   */
  writeDoor(
    door: Door,
    wallStepId: number
  ): { lines: string; doorStepId: number; openingStepId: number; guid: string } {
    const guid = generateGuid();
    const openingGuid = generateGuid();
    const name = door.properties.name ?? door.doorType ?? `Door_${door.id}`;

    // Opening placement (relative to wall)
    const originId = this.nextId();
    const axisId = this.nextId();
    const placementId = this.nextId();
    const openingOriginId = this.nextId();
    const openingAxisId = this.nextId();
    const openingPlacementId = this.nextId();

    // Opening geometry (bounding box)
    const oProfilePointIds: number[] = [];
    for (let i = 0; i < 5; i++) oProfilePointIds.push(this.nextId());
    const oPolylineId = this.nextId();
    const oProfileId = this.nextId();
    const oDirId = this.nextId();
    const oExtrusionId = this.nextId();
    const oShapeRepId = this.nextId();
    const oProductShapeId = this.nextId();
    const openingStepId = this.nextId();
    const relVoidId = this.nextId();
    const relVoidGuid = generateGuid();

    // Door entity
    const doorOriginId = this.nextId();
    const doorAxisId = this.nextId();
    const doorPlacementId = this.nextId();
    const doorStepId = this.nextId();
    const relFillId = this.nextId();
    const relFillGuid = generateGuid();

    const w = door.width as number;
    const h = door.height as number;
    const offset = door.offsetAlongWall as number;

    const linesParts: string[] = [];

    // Opening placement
    linesParts.push(`#${openingOriginId}=IFCCARTESIANPOINT((${offset.toFixed(4)},0.0,0.0));`);
    linesParts.push(`#${openingAxisId}=IFCAXIS2PLACEMENT3D(#${openingOriginId},$,$);`);
    linesParts.push(`#${openingPlacementId}=IFCLOCALPLACEMENT($,#${openingAxisId});`);

    // Opening profile (rectangle: width × height in XZ plane)
    const oCorners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: 0 }, // close
    ];
    for (let i = 0; i < 5; i++) {
      linesParts.push(
        `#${oProfilePointIds[i]}=IFCCARTESIANPOINT((${oCorners[i].x.toFixed(4)},${oCorners[i].y.toFixed(4)}));`
      );
    }
    linesParts.push(
      `#${oPolylineId}=IFCPOLYLINE((${oProfilePointIds.map((id) => `#${id}`).join(',')}));`
    );
    linesParts.push(`#${oProfileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${oPolylineId});`);

    // Extrude opening through wall thickness
    linesParts.push(`#${oDirId}=IFCDIRECTION((0.0,1.0,0.0));`);
    linesParts.push(
      `#${oExtrusionId}=IFCEXTRUDEDAREASOLID(#${oProfileId},#${openingAxisId},#${oDirId},1.0);`
    );

    linesParts.push(`#${oShapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${oExtrusionId}));`);
    linesParts.push(`#${oProductShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${oShapeRepId}));`);

    // IfcOpeningElement
    linesParts.push(
      `#${openingStepId}=IFCOPENINGELEMENT('${openingGuid}',$,'Opening_${this.escapeStep(name)}',$,$,#${openingPlacementId},#${oProductShapeId},$);`
    );

    // Void the wall
    linesParts.push(
      `#${relVoidId}=IFCRELVOIDSELEMENT('${relVoidGuid}',$,$,$,#${wallStepId},#${openingStepId});`
    );

    // Door entity (simplified — no geometry, just semantic)
    linesParts.push(`#${doorOriginId}=IFCCARTESIANPOINT((${offset.toFixed(4)},0.0,0.0));`);
    linesParts.push(`#${doorAxisId}=IFCAXIS2PLACEMENT3D(#${doorOriginId},$,$);`);
    linesParts.push(`#${doorPlacementId}=IFCLOCALPLACEMENT($,#${doorAxisId});`);
    linesParts.push(
      `#${doorStepId}=IFCDOOR('${guid}',$,'${this.escapeStep(name)}',$,$,#${doorPlacementId},$,$,${h.toFixed(4)},${w.toFixed(4)});`
    );

    // Fill the opening with the door
    linesParts.push(
      `#${relFillId}=IFCRELFILLSELEMENT('${relFillGuid}',$,$,$,#${openingStepId},#${doorStepId});`
    );

    return { lines: linesParts.join('\n'), doorStepId, openingStepId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcWindow con IfcOpeningElement
  // -------------------------------------------------------------------------

  /**
   * Genera IfcOpeningElement + IfcWindow vinculados al muro padre.
   */
  writeWindow(
    window: Window,
    wallStepId: number
  ): { lines: string; windowStepId: number; openingStepId: number; guid: string } {
    const guid = generateGuid();
    const openingGuid = generateGuid();
    const name = window.properties.name ?? window.windowType ?? `Window_${window.id}`;

    const w = window.width as number;
    const h = window.height as number;
    const offset = window.offsetAlongWall as number;

    // Opening
    const openingOriginId = this.nextId();
    const openingAxisId = this.nextId();
    const openingPlacementId = this.nextId();

    const oProfilePointIds: number[] = [];
    for (let i = 0; i < 5; i++) oProfilePointIds.push(this.nextId());
    const oPolylineId = this.nextId();
    const oProfileId = this.nextId();
    const oDirId = this.nextId();
    const oExtrusionId = this.nextId();
    const oShapeRepId = this.nextId();
    const oProductShapeId = this.nextId();
    const openingStepId = this.nextId();
    const relVoidId = this.nextId();
    const relVoidGuid = generateGuid();

    // Window
    const winOriginId = this.nextId();
    const winAxisId = this.nextId();
    const winPlacementId = this.nextId();
    const windowStepId = this.nextId();
    const relFillId = this.nextId();
    const relFillGuid = generateGuid();

    const linesParts: string[] = [];

    // Opening placement
    linesParts.push(`#${openingOriginId}=IFCCARTESIANPOINT((${offset.toFixed(4)},0.0,0.0));`);
    linesParts.push(`#${openingAxisId}=IFCAXIS2PLACEMENT3D(#${openingOriginId},$,$);`);
    linesParts.push(`#${openingPlacementId}=IFCLOCALPLACEMENT($,#${openingAxisId});`);

    // Opening profile
    const oCorners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: 0 },
    ];
    for (let i = 0; i < 5; i++) {
      linesParts.push(
        `#${oProfilePointIds[i]}=IFCCARTESIANPOINT((${oCorners[i].x.toFixed(4)},${oCorners[i].y.toFixed(4)}));`
      );
    }
    linesParts.push(
      `#${oPolylineId}=IFCPOLYLINE((${oProfilePointIds.map((id) => `#${id}`).join(',')}));`
    );
    linesParts.push(`#${oProfileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${oPolylineId});`);

    linesParts.push(`#${oDirId}=IFCDIRECTION((0.0,1.0,0.0));`);
    linesParts.push(
      `#${oExtrusionId}=IFCEXTRUDEDAREASOLID(#${oProfileId},#${openingAxisId},#${oDirId},1.0);`
    );

    linesParts.push(`#${oShapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${oExtrusionId}));`);
    linesParts.push(`#${oProductShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${oShapeRepId}));`);

    linesParts.push(
      `#${openingStepId}=IFCOPENINGELEMENT('${openingGuid}',$,'Opening_${this.escapeStep(name)}',$,$,#${openingPlacementId},#${oProductShapeId},$);`
    );

    linesParts.push(
      `#${relVoidId}=IFCRELVOIDSELEMENT('${relVoidGuid}',$,$,$,#${wallStepId},#${openingStepId});`
    );

    // Window entity
    linesParts.push(`#${winOriginId}=IFCCARTESIANPOINT((${offset.toFixed(4)},0.0,0.0));`);
    linesParts.push(`#${winAxisId}=IFCAXIS2PLACEMENT3D(#${winOriginId},$,$);`);
    linesParts.push(`#${winPlacementId}=IFCLOCALPLACEMENT($,#${winAxisId});`);
    linesParts.push(
      `#${windowStepId}=IFCWINDOW('${guid}',$,'${this.escapeStep(name)}',$,$,#${winPlacementId},$,$,${h.toFixed(4)},${w.toFixed(4)});`
    );

    linesParts.push(
      `#${relFillId}=IFCRELFILLSELEMENT('${relFillGuid}',$,$,$,#${openingStepId},#${windowStepId});`
    );

    return { lines: linesParts.join('\n'), windowStepId, openingStepId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcColumn
  // -------------------------------------------------------------------------

  /**
   * Genera IfcColumn con IfcBoundingBox (simplificado).
   */
  writeColumn(
    column: Column,
    spaceId: number
  ): { lines: string; columnStepId: number; guid: string } {
    const guid = generateGuid();
    const name = column.properties.name ?? column.material ?? `Column_${column.id}`;

    const r = (column.diameter as number) / 2;
    const h = column.height as number;
    const cx = column.position.x;
    const cy = column.position.y;

    const originId = this.nextId();
    const axisId = this.nextId();
    const placementId = this.nextId();

    // Approximate cylinder as octagonal prism
    const numSides = 8;
    const profilePointIds: number[] = [];
    for (let i = 0; i <= numSides; i++) profilePointIds.push(this.nextId());

    const polylineId = this.nextId();
    const profileId = this.nextId();
    const directionId = this.nextId();
    const extrusionId = this.nextId();
    const shapeRepId = this.nextId();
    const productShapeId = this.nextId();
    const columnStepId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const linesParts: string[] = [];

    // Placement at column center
    linesParts.push(`#${originId}=IFCCARTESIANPOINT((${cx.toFixed(4)},${cy.toFixed(4)},0.0));`);
    linesParts.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${originId},$,$);`);
    linesParts.push(`#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`);

    // Octagonal profile points (approximating circle)
    for (let i = 0; i <= numSides; i++) {
      const angle = (2 * Math.PI * (i % numSides)) / numSides;
      const px = r * Math.cos(angle);
      const py = r * Math.sin(angle);
      linesParts.push(`#${profilePointIds[i]}=IFCCARTESIANPOINT((${px.toFixed(4)},${py.toFixed(4)}));`);
    }

    linesParts.push(
      `#${polylineId}=IFCPOLYLINE((${profilePointIds.map((id) => `#${id}`).join(',')}));`
    );
    linesParts.push(`#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${polylineId});`);

    linesParts.push(`#${directionId}=IFCDIRECTION((0.0,0.0,1.0));`);
    linesParts.push(
      `#${extrusionId}=IFCEXTRUDEDAREASOLID(#${profileId},#${axisId},#${directionId},${h.toFixed(4)});`
    );

    linesParts.push(`#${shapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${extrusionId}));`);
    linesParts.push(`#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);

    linesParts.push(
      `#${columnStepId}=IFCCOLUMN('${guid}',$,'${this.escapeStep(name)}',$,$,#${placementId},#${productShapeId},$);`
    );

    linesParts.push(
      `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${relGuid}',$,$,$,(#${columnStepId}),#${spaceId});`
    );

    return { lines: linesParts.join('\n'), columnStepId, guid };
  }

  // -------------------------------------------------------------------------
  // IfcSlab (Floor)
  // -------------------------------------------------------------------------

  /**
   * Genera IfcSlab (FLOOR) con contorno del Room extruido por espesor.
   */
  writeFloor(
    floor: Floor,
    room: Room,
    spaceId: number
  ): { lines: string; slabStepId: number; guid: string } {
    const guid = generateGuid();
    const name = floor.properties.name ?? `Floor_${floor.id}`;
    const thickness = (floor.thickness as number) ?? 0.2; // default 20cm

    const originId = this.nextId();
    const axisId = this.nextId();
    const placementId = this.nextId();

    // Contour points from room geometry
    const contourPointIds: number[] = [];
    for (let i = 0; i <= room.geometry.length; i++) {
      contourPointIds.push(this.nextId());
    }

    const polylineId = this.nextId();
    const profileId = this.nextId();
    const directionId = this.nextId();
    const extrusionId = this.nextId();
    const shapeRepId = this.nextId();
    const productShapeId = this.nextId();
    const slabStepId = this.nextId();
    const relId = this.nextId();
    const relGuid = generateGuid();

    const linesParts: string[] = [];

    // Placement at Z = -thickness (below floor level)
    linesParts.push(`#${originId}=IFCCARTESIANPOINT((0.0,0.0,${(-thickness).toFixed(4)}));`);
    linesParts.push(`#${axisId}=IFCAXIS2PLACEMENT3D(#${originId},$,$);`);
    linesParts.push(`#${placementId}=IFCLOCALPLACEMENT($,#${axisId});`);

    // Contour
    for (let i = 0; i < room.geometry.length; i++) {
      const v = room.geometry[i];
      linesParts.push(
        `#${contourPointIds[i]}=IFCCARTESIANPOINT((${v.x.toFixed(4)},${v.y.toFixed(4)}));`
      );
    }
    // Close
    if (room.geometry.length > 0) {
      const first = room.geometry[0];
      linesParts.push(
        `#${contourPointIds[room.geometry.length]}=IFCCARTESIANPOINT((${first.x.toFixed(4)},${first.y.toFixed(4)}));`
      );
    }

    linesParts.push(
      `#${polylineId}=IFCPOLYLINE((${contourPointIds.map((id) => `#${id}`).join(',')}));`
    );
    linesParts.push(`#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,#${polylineId});`);

    linesParts.push(`#${directionId}=IFCDIRECTION((0.0,0.0,1.0));`);
    linesParts.push(
      `#${extrusionId}=IFCEXTRUDEDAREASOLID(#${profileId},#${axisId},#${directionId},${thickness.toFixed(4)});`
    );

    linesParts.push(`#${shapeRepId}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${extrusionId}));`);
    linesParts.push(`#${productShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);

    linesParts.push(
      `#${slabStepId}=IFCSLAB('${guid}',$,'${this.escapeStep(name)}',$,$,#${placementId},#${productShapeId},$,.FLOOR.);`
    );

    linesParts.push(
      `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${relGuid}',$,$,$,(#${slabStepId}),#${spaceId});`
    );

    return { lines: linesParts.join('\n'), slabStepId, guid };
  }
}
