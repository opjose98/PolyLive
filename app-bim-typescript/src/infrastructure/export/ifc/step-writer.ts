// =============================================================================
// step-writer.ts — Modelo IFC4 en STEP (ISO 10303-21), pensado para Revit
// Basado en: serializador-IFC-general.md, escritura-objetos-IFC.md y el
//            exportador de LevON (lib/export/ifc_exporter.dart)
// =============================================================================
//
// Qué necesita Revit (y un plugin que reconstruya elementos nativos) de un IFC:
//
//   - Un IfcBuildingStorey por NIVEL del proyecto, con su cota: Revit crea sus
//     niveles a partir de ellos.
//   - Colocaciones encadenadas sitio → edificio → piso → elemento → vano. Cada
//     elemento cuelga del piso de su restricción de base (como en LevON: el
//     muro tiene su propio sistema local, X a lo largo del eje).
//   - Muros rectangulares como IfcWallStandardCase: eje ('Axis') + extrusión
//     de su planta + IfcMaterialLayerSetUsage (sin él no es un "standard case"
//     válido en IFC4).
//   - Muros con perfil (base o tope distintos entre extremos) como IfcWall con
//     el alzado extruido a través del espesor: es la geometría de un muro de
//     Revit con perfil editado.
//   - Vanos (IfcOpeningElement) colocados RELATIVOS a su muro y rellenados por
//     IfcDoor / IfcWindow.
//   - GUIDs estables por objeto: reimportar un levantamiento actualizado
//     reconoce los mismos elementos.
//   - Las restricciones de nivel (base, desfase, tope, altura desconectada,
//     y las de cada extremo) en un conjunto de propiedades propio,
//     `PolyLive_RevitConstraints`, para que el plugin cree el muro nativo con
//     exactamente las mismas restricciones.
//
// Cada línea se genera en orden con su id (#N). Los números llevan siempre
// punto decimal (REAL de STEP) y el texto no ASCII se codifica \X2\…\X0\.
// =============================================================================

import { stableGuid } from './guid-generator';

// ---------------------------------------------------------------------------
// Formato STEP
// ---------------------------------------------------------------------------

/** REAL de STEP: siempre con punto decimal, sin exponentes raros ni -0. */
export function stepReal(v: number): string {
  if (!Number.isFinite(v)) return '0.';
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return '0.';
  const s = String(r);
  if (s.includes('e')) return r.toFixed(6);
  return s.includes('.') ? s : `${s}.`;
}

/** STRING de STEP: comillas y barras escapadas, no ASCII como \X2\HHHH\X0\. */
export function stepString(v: string): string {
  let out = '';
  let wide = '';
  const flush = () => {
    if (wide) out += `\\X2\\${wide}\\X0\\`;
    wide = '';
  };
  for (const ch of v) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) {
      flush();
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else if (code > 126) {
      // UTF-16: un carácter fuera del plano básico son dos unidades.
      for (let i = 0; i < ch.length; i++) wide += ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
    } else {
      flush();
      out += ' ';
    }
  }
  flush();
  return `'${out}'`;
}

const ref = (id: number) => `#${id}`;
const refs = (ids: readonly number[]) => `(${ids.map(ref).join(',')})`;
const bool = (b: boolean) => (b ? '.T.' : '.F.');

// ---------------------------------------------------------------------------
// Valores de propiedades
// ---------------------------------------------------------------------------

export type IfcValue =
  | { readonly label: string }
  | { readonly identifier: string }
  | { readonly length: number }
  | { readonly bool: boolean }
  | { readonly real: number };

function ifcValue(v: IfcValue): string {
  if ('label' in v) return `IFCLABEL(${stepString(v.label)})`;
  if ('identifier' in v) return `IFCIDENTIFIER(${stepString(v.identifier)})`;
  if ('length' in v) return `IFCLENGTHMEASURE(${stepReal(v.length)})`;
  if ('bool' in v) return `IFCBOOLEAN(${bool(v.bool)})`;
  return `IFCREAL(${stepReal(v.real)})`;
}

// ---------------------------------------------------------------------------
// Escritor
// ---------------------------------------------------------------------------

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export class StepWriter {
  private readonly lines: string[] = [];
  private nextId = 1;

  // Entidades compartidas (se crean al construir el contexto).
  ownerHistory = 0;
  private bodyContext = 0;
  private axisContext = 0;
  private origin3 = 0;
  private origin2 = 0;
  private dirZ = 0;
  private dirX = 0;
  private dirNegY = 0;
  private identity3 = 0;
  private readonly materialSets = new Map<string, number>();

  /** Añade una entidad y devuelve su id. */
  add(entity: string): number {
    const id = this.nextId++;
    this.lines.push(`#${id}=${entity};`);
    return id;
  }

  get entityLines(): readonly string[] {
    return this.lines;
  }

  // --- Geometría básica ------------------------------------------------------

  point3(x: number, y: number, z: number): number {
    return this.add(`IFCCARTESIANPOINT((${stepReal(x)},${stepReal(y)},${stepReal(z)}))`);
  }

  point2(x: number, y: number): number {
    return this.add(`IFCCARTESIANPOINT((${stepReal(x)},${stepReal(y)}))`);
  }

  direction3(x: number, y: number, z: number): number {
    return this.add(`IFCDIRECTION((${stepReal(x)},${stepReal(y)},${stepReal(z)}))`);
  }

  /** Sistema local: origen, eje Z (o $ = global) y dirección X (o $). */
  axis3(location: number, axis?: number, refDirection?: number): number {
    return this.add(
      `IFCAXIS2PLACEMENT3D(${ref(location)},${axis ? ref(axis) : '$'},${refDirection ? ref(refDirection) : '$'})`,
    );
  }

  axis2(location: number): number {
    return this.add(`IFCAXIS2PLACEMENT2D(${ref(location)},$)`);
  }

  localPlacement(relTo: number | null, axis: number): number {
    return this.add(`IFCLOCALPLACEMENT(${relTo ? ref(relTo) : '$'},${ref(axis)})`);
  }

  /** Colocación de un elemento: origen (x,y,z) relativo a `relTo`, X según `dir` en planta. */
  placementAt(relTo: number | null, x: number, y: number, z: number, dir?: Vec2): number {
    const loc = this.point3(x, y, z);
    const axis = dir ? this.axis3(loc, this.dirZ, this.direction3(dir.x, dir.y, 0)) : this.axis3(loc);
    return this.localPlacement(relTo, axis);
  }

  polyline2(points: readonly Vec2[], close: boolean): number {
    const ids = points.map((p) => this.point2(p.x, p.y));
    if (close && ids.length > 0) ids.push(ids[0]);
    return this.add(`IFCPOLYLINE(${refs(ids)})`);
  }

  // --- Representaciones ------------------------------------------------------

  /** Prisma: perfil en el plano XY de `position`, extruido `depth` según su Z. */
  extrusion(profile: number, position: number, depth: number): number {
    return this.add(`IFCEXTRUDEDAREASOLID(${ref(profile)},${ref(position)},${ref(this.dirZ)},${stepReal(depth)})`);
  }

  rectangleProfile(cx: number, cy: number, xDim: number, yDim: number): number {
    const pos = this.axis2(this.point2(cx, cy));
    return this.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(pos)},${stepReal(xDim)},${stepReal(yDim)})`);
  }

  circleProfile(radius: number): number {
    return this.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${ref(this.axis2(this.origin2))},${stepReal(radius)})`);
  }

  polygonProfile(points: readonly Vec2[]): number {
    return this.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(this.polyline2(points, true))})`);
  }

  /**
   * Sistema para extruir un perfil dibujado en el plano VERTICAL de un muro:
   * X del perfil = a lo largo del muro, Y del perfil = altura, extrusión hacia
   * -Y local desde `y0`. Con y0 = e/2 y profundidad e, atraviesa el espesor
   * centrado en el eje.
   */
  wallPlaneAxis(x: number, y0: number, z: number): number {
    return this.axis3(this.point3(x, y0, z), this.dirNegY, this.dirX);
  }

  get origin3Axis(): number {
    return this.identity3;
  }

  bodyShape(items: readonly number[], type = 'SweptSolid'): number {
    return this.add(`IFCSHAPEREPRESENTATION(${ref(this.bodyContext)},'Body','${type}',${refs(items)})`);
  }

  axisShape(length: number): number {
    const line = this.polyline2([{ x: 0, y: 0 }, { x: length, y: 0 }], false);
    return this.add(`IFCSHAPEREPRESENTATION(${ref(this.axisContext)},'Axis','Curve2D',(${ref(line)}))`);
  }

  productShape(reps: readonly number[]): number {
    return this.add(`IFCPRODUCTDEFINITIONSHAPE($,$,${refs(reps)})`);
  }

  // --- Relaciones y propiedades ---------------------------------------------

  aggregates(key: string, parent: number, children: readonly number[]): number {
    return this.add(`IFCRELAGGREGATES('${stableGuid(`agg:${key}`)}',${ref(this.ownerHistory)},$,$,${ref(parent)},${refs(children)})`);
  }

  contained(key: string, structure: number, elements: readonly number[]): number {
    return this.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${stableGuid(`contain:${key}`)}',${ref(this.ownerHistory)},$,$,${refs(elements)},${ref(structure)})`,
    );
  }

  propertySet(key: string, name: string, element: number, props: readonly [string, IfcValue][]): number {
    const ids = props.map(([n, v]) => this.add(`IFCPROPERTYSINGLEVALUE(${stepString(n)},$,${ifcValue(v)},$)`));
    const pset = this.add(`IFCPROPERTYSET('${stableGuid(`pset:${name}:${key}`)}',${ref(this.ownerHistory)},${stepString(name)},$,${refs(ids)})`);
    return this.add(
      `IFCRELDEFINESBYPROPERTIES('${stableGuid(`defpset:${name}:${key}`)}',${ref(this.ownerHistory)},$,$,(${ref(element)}),${ref(pset)})`,
    );
  }

  quantities(key: string, name: string, element: number, q: { lengths: [string, number][]; areas?: [string, number][] }): number {
    const ids = [
      ...q.lengths.map(([n, v]) => this.add(`IFCQUANTITYLENGTH(${stepString(n)},$,$,${stepReal(v)},$)`)),
      ...(q.areas ?? []).map(([n, v]) => this.add(`IFCQUANTITYAREA(${stepString(n)},$,$,${stepReal(v)},$)`)),
    ];
    const qto = this.add(`IFCELEMENTQUANTITY('${stableGuid(`qto:${name}:${key}`)}',${ref(this.ownerHistory)},${stepString(name)},$,$,${refs(ids)})`);
    return this.add(
      `IFCRELDEFINESBYPROPERTIES('${stableGuid(`defqto:${name}:${key}`)}',${ref(this.ownerHistory)},$,$,(${ref(element)}),${ref(qto)})`,
    );
  }

  /** Conjunto de capas de un muro de un solo material, reutilizado por espesor y material. */
  materialLayerSet(material: string, thickness: number): number {
    const key = `${material}|${stepReal(thickness)}`;
    const cached = this.materialSets.get(key);
    if (cached) return cached;
    const mat = this.add(`IFCMATERIAL(${stepString(material)},$,$)`);
    const layer = this.add(`IFCMATERIALLAYER(${ref(mat)},${stepReal(thickness)},$,${stepString(material)},$,$,$)`);
    const set = this.add(`IFCMATERIALLAYERSET((${ref(layer)}),${stepString(`${material} ${Math.round(thickness * 1000)} mm`)},$)`);
    this.materialSets.set(key, set);
    return set;
  }

  /** Uso de la capa sobre el eje del muro: centrada (desfase −e/2, sentido positivo). */
  layerSetUsage(set: number, thickness: number): number {
    return this.add(`IFCMATERIALLAYERSETUSAGE(${ref(set)},.AXIS2.,.POSITIVE.,${stepReal(-thickness / 2)},$)`);
  }

  associateMaterial(key: string, elements: readonly number[], material: number): number {
    return this.add(
      `IFCRELASSOCIATESMATERIAL('${stableGuid(`mat:${key}`)}',${ref(this.ownerHistory)},$,$,${refs(elements)},${ref(material)})`,
    );
  }

  // --- Cabecera, contexto y proyecto ----------------------------------------

  /**
   * Personas, aplicación, historial, unidades, contextos y la geometría
   * compartida. Devuelve el id del contexto de representación 3D.
   */
  writeContext(author: string): number {
    const person = this.add(`IFCPERSON($,${stepString(author || 'PolyLive')},$,$,$,$,$,$)`);
    const org = this.add(`IFCORGANIZATION($,'PolyLive',$,$,$)`);
    const personOrg = this.add(`IFCPERSONANDORGANIZATION(${ref(person)},${ref(org)},$)`);
    const app = this.add(`IFCAPPLICATION(${ref(org)},'0.3','PolyLive','PolyLive')`);
    const now = Math.floor(Date.now() / 1000);
    this.ownerHistory = this.add(`IFCOWNERHISTORY(${ref(personOrg)},${ref(app)},$,.ADDED.,$,$,$,${now})`);

    this.origin3 = this.point3(0, 0, 0);
    this.origin2 = this.point2(0, 0);
    this.dirZ = this.direction3(0, 0, 1);
    this.dirX = this.direction3(1, 0, 0);
    this.dirNegY = this.direction3(0, -1, 0);
    this.identity3 = this.axis3(this.origin3, this.dirZ, this.dirX);

    const context = this.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(this.identity3)},$)`);
    this.bodyContext = this.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(context)},$,.MODEL_VIEW.,$)`);
    this.axisContext = this.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${ref(context)},$,.GRAPH_VIEW.,$)`);
    return context;
  }

  /** Unidad de longitud (la usa IfcProjectedCRS como unidad del plano). */
  lengthUnit = 0;

  writeUnits(): number {
    const len = this.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
    this.lengthUnit = len;
    const area = this.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
    const vol = this.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
    const angle = this.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
    return this.add(`IFCUNITASSIGNMENT(${refs([len, area, vol, angle])})`);
  }

  /**
   * Georreferencia (IFC4): el sistema proyectado y la conversión del sistema
   * local del modelo a él. Revit lo lee como "coordenadas compartidas".
   */
  mapConversion(
    context: number,
    mc: {
      crsName: string;
      crsDescription: string;
      geodeticDatum: string;
      eastings: number;
      northings: number;
      orthogonalHeight: number;
      xAxisAbscissa: number;
      xAxisOrdinate: number;
      scale: number;
    },
  ): number {
    const crs = this.add(
      `IFCPROJECTEDCRS(${stepString(mc.crsName)},${stepString(mc.crsDescription)},${stepString(mc.geodeticDatum)},$,$,$,${ref(this.lengthUnit)})`,
    );
    return this.add(
      `IFCMAPCONVERSION(${ref(context)},${ref(crs)},${stepReal(mc.eastings)},${stepReal(mc.northings)},${stepReal(mc.orthogonalHeight)},` +
        `${stepReal(mc.xAxisAbscissa)},${stepReal(mc.xAxisOrdinate)},${stepReal(mc.scale)})`,
    );
  }

  /** Archivo completo alrededor de las entidades escritas. */
  toString(meta: { name: string; author: string; timestamp?: string }): string {
    const ts = meta.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, '');
    return [
      'ISO-10303-21;',
      'HEADER;',
      "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
      `FILE_NAME(${stepString(meta.name)},'${ts}',(${stepString(meta.author || 'PolyLive')}),('PolyLive'),'PolyLive IFC Exporter','PolyLive 0.3','');`,
      "FILE_SCHEMA(('IFC4'));",
      'ENDSEC;',
      'DATA;',
      ...this.lines,
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n');
  }
}

export { ref, refs, bool };
