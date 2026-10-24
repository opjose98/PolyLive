// =============================================================================
// project.ts — Project y ProjectSpace: la raíz de organización del trabajo
// Portado de LevON: features/projects/domain/project.dart,
//                   bim/services/bim_code_generator.dart
// =============================================================================
//
// POR QUÉ SE AÑADE ESTA ENTIDAD: PolyLive modelaba "proyecto" como "una lista
// plana de Recintos" (así lo decía el comentario de DashboardScreen). Eso
// funciona para un levantamiento suelto y se rompe en cuanto hay dos obras a la
// vez: los Recintos de la nave industrial y los del chalet aparecen mezclados en
// la misma lista, sin forma de exportar "todo el proyecto", sin autor, sin
// disciplina y sin código BIM. LevON ya resolvía esto con `Project` +
// multi-espacio, y es el modelo que se porta aquí.
//
// CORRESPONDENCIA DE CONCEPTOS LevON → PolyLive:
//   Project            → Project (esta clase)
//   SpaceGeometry      → un Recinto (Room) de PolyLive, referenciado por
//                        ProjectSpace, que añade la identidad BIM del espacio
//   Project.walls etc. → los objetos del Room correspondiente
//
// Un `ProjectSpace` es deliberadamente una REFERENCIA a un Room, no un
// contenedor de geometría: duplicar la geometría dentro del proyecto crearía
// dos fuentes de verdad para los mismos muros, que es la clase de problema que
// no se arregla después.
// =============================================================================

// ---------------------------------------------------------------------------
// Branded IDs
// ---------------------------------------------------------------------------

export type ProjectId = string & { readonly __brand: 'ProjectId' };

export function projectId(value: string): ProjectId {
  return value as ProjectId;
}

// ---------------------------------------------------------------------------
// Disciplinas BIM
// ---------------------------------------------------------------------------

/**
 * Disciplina BIM del proyecto. Lista cerrada a propósito: como texto libre,
 * "Arquitectura", "arquitectura" y "ARQ" se convierten en tres disciplinas
 * distintas al filtrar o exportar. Ya no se elige al crear (docs/23 § 7).
 */
export type BimDiscipline = 'Arquitectura' | 'Estructuras' | 'Instalaciones' | 'Topografía' | 'Patrimonio' | 'Otra';

export const DEFAULT_DISCIPLINE: BimDiscipline = 'Arquitectura';

// ---------------------------------------------------------------------------
// Códigos BIM
// ---------------------------------------------------------------------------

const BIM_CODE_PREFIX_PROJECT = 'BIM';
const BIM_CODE_PREFIX_SPACE = 'SPC';

/**
 * Formato aceptado: 2–5 letras mayúsculas seguidas de 1–6 dígitos.
 * Ejemplos válidos: BIM001, ARC042, SPC1, LEV99.
 */
const BIM_CODE_PATTERN = /^[A-Z]{2,5}[0-9]{1,6}$/;

export function isValidBimCode(code: string): boolean {
  return BIM_CODE_PATTERN.test(code);
}

/** Normaliza un código escrito a mano: mayúsculas, sin espacios. */
export function normalizeBimCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Primer código libre con el prefijo dado: `BIM001`, `BIM002`...
 *
 * Reutiliza los huecos que dejan los códigos borrados (busca el primero
 * ausente, no `max + 1`) — al contrario que un contador, que dejaría huecos
 * permanentes y llegaría antes al tope de 999.
 *
 * Al agotarse el rango de tres dígitos sigue con cuatro en vez de caer a un
 * timestamp como hacía LevON: `BIM1000` mantiene la forma legible del código y
 * sigue siendo válido, mientras que `BIM48213` parece un identificador interno.
 */
export function generateBimCode(prefix: string, existingCodes: Iterable<string>): string {
  const taken = new Set<string>();
  for (const code of existingCodes) taken.add(normalizeBimCode(code));

  for (let i = 1; i <= 999999; i++) {
    const digits = String(i).padStart(3, '0');
    const candidate = `${prefix}${digits}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Inalcanzable en la práctica: un millón de códigos con el mismo prefijo.
  throw new Error(`No hay códigos BIM libres para el prefijo ${prefix}`);
}

export function generateProjectCode(existingCodes: Iterable<string>): string {
  return generateBimCode(BIM_CODE_PREFIX_PROJECT, existingCodes);
}

export function generateSpaceCode(existingCodes: Iterable<string>): string {
  return generateBimCode(BIM_CODE_PREFIX_SPACE, existingCodes);
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * Raíz de organización del trabajo: agrupa los Recintos (espacios) de una obra
 * y lleva su identidad BIM.
 *
 * INVARIANTES:
 * - `name` no vacío
 * - `bimCode` válido según `isValidBimCode` y único entre proyectos vivos
 *   (la unicidad la garantiza el store, que es quien ve todos los códigos)
 * - `is_deleted = true` es soft-delete: sus Recintos siguen existiendo y se
 *   pueden reasignar, porque borrar el proyecto no debe borrar el
 *   levantamiento de nadie
 */
export class Project {
  readonly id: ProjectId;
  bimCode: string;
  name: string;
  description: string;
  discipline: BimDiscipline;
  author: string;

  readonly created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  constructor(params: {
    id: ProjectId;
    bimCode: string;
    name: string;
    description?: string;
    discipline?: BimDiscipline;
    author?: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
  }) {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Project.name no puede estar vacío');
    }

    const code = normalizeBimCode(params.bimCode);
    if (!isValidBimCode(code)) {
      throw new Error(
        `Project.bimCode "${params.bimCode}" no es válido: se esperan 2–5 letras mayúsculas y 1–6 dígitos (p. ej. BIM001)`,
      );
    }

    this.id = params.id;
    this.bimCode = code;
    this.name = params.name.trim();
    this.description = params.description?.trim() ?? '';
    this.discipline = params.discipline ?? DEFAULT_DISCIPLINE;
    this.author = params.author?.trim() ?? '';
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }
}

// ---------------------------------------------------------------------------
// ProjectSpace
// ---------------------------------------------------------------------------

/**
 * Un espacio del proyecto: la REFERENCIA a un Recinto más su identidad BIM
 * dentro del proyecto (código y nombre de espacio, orden de presentación).
 *
 * No contiene geometría: la geometría vive en el Room y sus objetos. Ver la
 * nota de cabecera sobre por qué duplicarla sería un error.
 */
export class ProjectSpace {
  readonly projectId: ProjectId;
  /** Recinto referenciado. Es la clave con la que se leen sus objetos BIM. */
  readonly roomId: string;
  bimCode: string;
  name: string;
  orderIndex: number;

  readonly created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  constructor(params: {
    projectId: ProjectId;
    roomId: string;
    bimCode: string;
    name: string;
    orderIndex?: number;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
  }) {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('ProjectSpace.name no puede estar vacío');
    }

    const code = normalizeBimCode(params.bimCode);
    if (!isValidBimCode(code)) {
      throw new Error(`ProjectSpace.bimCode "${params.bimCode}" no es válido (p. ej. SPC001)`);
    }

    this.projectId = params.projectId;
    this.roomId = params.roomId;
    this.bimCode = code;
    this.name = params.name.trim();
    this.orderIndex = params.orderIndex ?? 0;
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }
}

// ---------------------------------------------------------------------------
// Resumen para listados
// ---------------------------------------------------------------------------

/**
 * Datos agregados que la lista de proyectos necesita y que no viven en la
 * entidad: cuántos espacios tiene y cuánta superficie cerrada acumula.
 * Calcularlos en la pantalla obligaría a cargar todos los objetos de todos los
 * Recintos de todos los proyectos para pintar una lista.
 */
export interface ProjectSummary {
  readonly project: Project;
  readonly spaceCount: number;
  /** Suma de áreas de los Recintos cerrados. Los abiertos aportan 0. */
  readonly totalAreaM2: number;
  /** Cuántos espacios siguen sin cerrar. */
  readonly openSpaceCount: number;
}
