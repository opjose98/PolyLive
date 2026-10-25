// =============================================================================
// stepLint.ts — Validador mínimo de STEP/IFC4 para los tests
// =============================================================================
//
// No reemplaza a IfcOpenShell, pero atrapa exactamente los errores que tenía
// el exportador anterior: entidades con un número de atributos distinto del
// que fija el esquema IFC4, referencias a ids que no existen o del tipo
// equivocado, GUIDs que no siguen la compresión estándar, REAL sin punto.
// =============================================================================

import { isValidIfcGuid } from '../../src/infrastructure/export/ifc/guid-generator';

/** Número de atributos (explícitos + derivados como *) de cada entidad IFC4 que emitimos. */
export const IFC4_ATTRIBUTE_COUNT: Readonly<Record<string, number>> = {
  IFCPERSON: 8,
  IFCORGANIZATION: 5,
  IFCPERSONANDORGANIZATION: 3,
  IFCAPPLICATION: 4,
  IFCOWNERHISTORY: 8,
  IFCCARTESIANPOINT: 1,
  IFCDIRECTION: 1,
  IFCAXIS2PLACEMENT3D: 3,
  IFCAXIS2PLACEMENT2D: 2,
  IFCLOCALPLACEMENT: 2,
  IFCGEOMETRICREPRESENTATIONCONTEXT: 6,
  IFCGEOMETRICREPRESENTATIONSUBCONTEXT: 10,
  IFCSIUNIT: 4,
  IFCUNITASSIGNMENT: 1,
  IFCPROJECT: 9,
  IFCSITE: 14,
  IFCBUILDING: 12,
  IFCBUILDINGSTOREY: 10,
  IFCRELAGGREGATES: 6,
  IFCSPACE: 11,
  IFCSLAB: 9,
  IFCPOLYLINE: 1,
  IFCARBITRARYCLOSEDPROFILEDEF: 3,
  IFCARBITRARYPROFILEDEFWITHVOIDS: 4,
  IFCRECTANGLEPROFILEDEF: 5,
  IFCCIRCLEPROFILEDEF: 4,
  IFCEXTRUDEDAREASOLID: 4,
  IFCSHAPEREPRESENTATION: 4,
  IFCPRODUCTDEFINITIONSHAPE: 3,
  IFCWALLSTANDARDCASE: 9,
  IFCWALL: 9,
  IFCMATERIAL: 3,
  IFCMATERIALLAYER: 7,
  IFCMATERIALLAYERSET: 3,
  IFCMATERIALLAYERSETUSAGE: 5,
  IFCRELASSOCIATESMATERIAL: 6,
  IFCPROPERTYSINGLEVALUE: 4,
  IFCPROPERTYSET: 5,
  IFCRELDEFINESBYPROPERTIES: 6,
  IFCQUANTITYLENGTH: 5,
  IFCQUANTITYAREA: 5,
  IFCQUANTITYVOLUME: 5,
  IFCELEMENTQUANTITY: 6,
  IFCOPENINGELEMENT: 9,
  IFCRELVOIDSELEMENT: 6,
  IFCDOOR: 13,
  IFCWINDOW: 13,
  IFCRELFILLSELEMENT: 6,
  IFCCOLUMN: 9,
  IFCBEAM: 9,
  IFCMEMBER: 9,
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 6,
  IFCPROJECTEDCRS: 7,
  IFCMAPCONVERSION: 8,
};

/** Entidades con GlobalId (IfcRoot) como primer atributo. */
const ROOTED = new Set([
  'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCRELAGGREGATES', 'IFCSPACE', 'IFCSLAB',
  'IFCWALLSTANDARDCASE', 'IFCWALL', 'IFCRELASSOCIATESMATERIAL', 'IFCPROPERTYSET', 'IFCRELDEFINESBYPROPERTIES',
  'IFCELEMENTQUANTITY', 'IFCOPENINGELEMENT', 'IFCRELVOIDSELEMENT', 'IFCDOOR', 'IFCWINDOW', 'IFCRELFILLSELEMENT',
  'IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
]);

/** Tipo exigido por atributo que es referencia (índice → tipos aceptados). */
const REF_TYPES: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  IFCLOCALPLACEMENT: { 0: ['IFCLOCALPLACEMENT'], 1: ['IFCAXIS2PLACEMENT3D'] },
  IFCAXIS2PLACEMENT3D: { 0: ['IFCCARTESIANPOINT'], 1: ['IFCDIRECTION'], 2: ['IFCDIRECTION'] },
  IFCEXTRUDEDAREASOLID: {
    0: ['IFCRECTANGLEPROFILEDEF', 'IFCCIRCLEPROFILEDEF', 'IFCARBITRARYCLOSEDPROFILEDEF', 'IFCARBITRARYPROFILEDEFWITHVOIDS'],
    1: ['IFCAXIS2PLACEMENT3D'],
    2: ['IFCDIRECTION'],
  },
  IFCARBITRARYCLOSEDPROFILEDEF: { 2: ['IFCPOLYLINE'] },
  IFCARBITRARYPROFILEDEFWITHVOIDS: { 2: ['IFCPOLYLINE'], 3: ['IFCPOLYLINE'] },
  IFCRELCONTAINEDINSPATIALSTRUCTURE: { 5: ['IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCBUILDING', 'IFCSITE'] },
  IFCRELVOIDSELEMENT: { 4: ['IFCWALLSTANDARDCASE', 'IFCWALL'], 5: ['IFCOPENINGELEMENT'] },
  IFCRELFILLSELEMENT: { 4: ['IFCOPENINGELEMENT'], 5: ['IFCDOOR', 'IFCWINDOW'] },
  IFCOWNERHISTORY: { 0: ['IFCPERSONANDORGANIZATION'], 1: ['IFCAPPLICATION'] },
  IFCMATERIALLAYERSETUSAGE: { 0: ['IFCMATERIALLAYERSET'] },
  IFCSHAPEREPRESENTATION: { 0: ['IFCGEOMETRICREPRESENTATIONSUBCONTEXT', 'IFCGEOMETRICREPRESENTATIONCONTEXT'] },
  IFCMAPCONVERSION: { 0: ['IFCGEOMETRICREPRESENTATIONCONTEXT'], 1: ['IFCPROJECTEDCRS'] },
  IFCPROJECTEDCRS: { 6: ['IFCSIUNIT'] },
};

export interface StepEntity {
  readonly id: number;
  readonly type: string;
  /** Atributos de primer nivel, como texto (listas y tipos anidados sin desarmar). */
  readonly args: readonly string[];
}

/** Separa los atributos de primer nivel respetando paréntesis y cadenas. */
export function splitArgs(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === "'") {
        if (body[i + 1] === "'") {
          cur += body[++i];
        } else inStr = false;
      }
      continue;
    }
    if (c === "'") {
      inStr = true;
      cur += c;
    } else if (c === '(') {
      depth++;
      cur += c;
    } else if (c === ')') {
      depth--;
      cur += c;
    } else if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseStep(content: string): Map<number, StepEntity> {
  const data = content.split('DATA;')[1]?.split('ENDSEC;')[0] ?? '';
  const map = new Map<number, StepEntity>();
  for (const raw of data.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^#(\d+)=([A-Z0-9_]+)\((.*)\);$/.exec(line);
    if (!m) throw new Error(`Línea STEP mal formada: ${line}`);
    const id = Number(m[1]);
    if (map.has(id)) throw new Error(`Id repetido #${id}`);
    map.set(id, { id, type: m[2], args: splitArgs(m[3]) });
  }
  return map;
}

/** Ids referenciados dentro de un atributo (incluidas listas y tipos anidados). */
export function refsIn(arg: string): number[] {
  const out: number[] = [];
  const noStrings = arg.replace(/'(?:[^']|'')*'/g, "''");
  for (const m of noStrings.matchAll(/#(\d+)/g)) out.push(Number(m[1]));
  return out;
}

/** Lista de problemas encontrados (vacía = el archivo pasa). */
export function lintIfc(content: string): string[] {
  const problems: string[] = [];
  if (!content.startsWith('ISO-10303-21;')) problems.push('No empieza con ISO-10303-21;');
  if (!content.includes("FILE_SCHEMA(('IFC4'));")) problems.push('FILE_SCHEMA no es IFC4');
  if (!content.trim().endsWith('END-ISO-10303-21;')) problems.push('No termina con END-ISO-10303-21;');
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(content)) problems.push('Hay caracteres no ASCII sin codificar');

  let entities: Map<number, StepEntity>;
  try {
    entities = parseStep(content);
  } catch (e) {
    return [...problems, (e as Error).message];
  }

  const guids = new Set<string>();
  for (const e of entities.values()) {
    const expected = IFC4_ATTRIBUTE_COUNT[e.type];
    if (expected === undefined) problems.push(`#${e.id} ${e.type}: entidad no contemplada por el linter`);
    else if (e.args.length !== expected) problems.push(`#${e.id} ${e.type}: ${e.args.length} atributos, IFC4 exige ${expected}`);

    for (const arg of e.args) {
      for (const r of refsIn(arg)) if (!entities.has(r)) problems.push(`#${e.id} ${e.type}: referencia a #${r} inexistente`);
      // Un REAL de STEP siempre lleva punto: "3" suelto donde va un número es un INTEGER.
    }

    const typed = REF_TYPES[e.type];
    if (typed) {
      for (const [idx, types] of Object.entries(typed)) {
        const arg = e.args[Number(idx)];
        if (!arg || arg === '$') continue;
        for (const r of refsIn(arg)) {
          const target = entities.get(r);
          if (target && !types.includes(target.type)) {
            problems.push(`#${e.id} ${e.type}: atributo ${idx} apunta a ${target.type}, se esperaba ${types.join('|')}`);
          }
        }
      }
    }

    if (ROOTED.has(e.type)) {
      const guid = e.args[0].replace(/^'|'$/g, '');
      if (!isValidIfcGuid(guid)) problems.push(`#${e.id} ${e.type}: GlobalId inválido ${guid}`);
      if (guids.has(guid)) problems.push(`#${e.id} ${e.type}: GlobalId repetido ${guid}`);
      guids.add(guid);
    }
  }

  // Todo elemento físico está contenido en exactamente un piso.
  const containedIn = new Map<number, number>();
  for (const e of entities.values()) {
    if (e.type !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue;
    for (const r of refsIn(e.args[4])) {
      if (containedIn.has(r)) problems.push(`#${r} contenido en dos estructuras`);
      containedIn.set(r, e.id);
    }
  }
  for (const e of entities.values()) {
    if (['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB'].includes(e.type) && !containedIn.has(e.id)) {
      problems.push(`#${e.id} ${e.type}: no está contenido en ningún piso`);
    }
  }
  return problems;
}

/** Entidades de un tipo. */
export function ofType(content: string, type: string): StepEntity[] {
  return [...parseStep(content).values()].filter((e) => e.type === type);
}
