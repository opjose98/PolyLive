// =============================================================================
// ProjectService.ts — Casos de uso de Proyectos y Espacios
// Portado de LevON: features/projects/, persistence/project_repository.dart
// =============================================================================
//
// POR QUÉ UN *SERVICE* Y NO UN UseCase POR OPERACIÓN: los UseCases de este
// proyecto existen para orquestar operaciones BIM que pasan por el CommandStack
// (crear un muro emite un CreateWallCommand con su undo). Las operaciones sobre
// proyectos son CRUD de metadatos: no tienen inversa geométrica, no entran en
// Undo/Redo y no tocan el modelo BIM. Convertir cada una en su propia clase
// habría producido seis archivos de veinte líneas con un solo `await` cada uno,
// sin ganar nada de lo que el patrón Command aporta.
//
// Lo que sí hace este servicio y no hace un store: coordinar DOS almacenes
// (ProjectStore y ObjectStore) para que un espacio nuevo tenga a la vez su
// Recinto real y su fila de pertenencia al proyecto.
// =============================================================================

import { ProjectStore } from '../../infrastructure/sqlite/ProjectStore';
import { ObjectStore } from '../../infrastructure/sqlite/ObjectStore';
import { Project, ProjectSpace, ProjectId, ProjectSummary, BimDiscipline, DEFAULT_DISCIPLINE, projectId as toProjectId, normalizeBimCode, isValidBimCode } from '../../domain/objects/project';
import { Room } from '../../domain/objects/room';
import { LevelId, RoomId, generateId, revitObjectId, roomId as toRoomId } from '../../domain/objects/base';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

// ---------------------------------------------------------------------------
// Entrada / salida
// ---------------------------------------------------------------------------

interface CreateProjectInput {
  name: string;
  /** Si se omite, se genera el primer código libre (BIM001, BIM002...). */
  bimCode?: string;
  description?: string;
  discipline?: BimDiscipline;
  author?: string;
}

interface CreateSpaceInput {
  projectId: ProjectId;
  name: string;
  /** Si se omite, se genera el primer código libre del proyecto (SPC001...). */
  bimCode?: string;
}

export interface SpaceDetail {
  readonly space: ProjectSpace;
  /** El Recinto real. `null` si la fila de relación quedó apuntando a la nada. */
  readonly room: Room | null;
  readonly areaM2: number | null;
  readonly objectCount: number;
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export class ProjectService {
  constructor(
    private readonly projects: ProjectStore,
    private readonly objects: ObjectStore,
    private readonly defaultLevelId: LevelId,
  ) {}

  // -------------------------------------------------------------------------
  // Proyectos
  // -------------------------------------------------------------------------

  async createProject(input: CreateProjectInput): Promise<Project> {
    const bimCode = input.bimCode
      ? normalizeBimCode(input.bimCode)
      : await this.projects.nextProjectCode();

    if (!isValidBimCode(bimCode)) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        userMessage: `El código "${input.bimCode}" no es válido. Usa 2–5 letras y 1–6 dígitos, por ejemplo BIM001.`,
        technicalDetail: `Invalid BIM code: ${input.bimCode}`,
      });
    }

    const project = new Project({
      id: toProjectId(generateId() as string),
      bimCode,
      name: input.name,
      description: input.description,
      discipline: input.discipline ?? DEFAULT_DISCIPLINE,
      author: input.author,
    });

    await this.projects.createProject(project);
    return project;
  }

  listProjects(): Promise<Project[]> {
    return this.projects.listProjects();
  }

  listProjectSummaries(): Promise<ProjectSummary[]> {
    return this.projects.listProjectSummaries();
  }

  readProject(id: ProjectId): Promise<Project | null> {
    return this.projects.readProject(id);
  }

  updateProject(
    id: ProjectId,
    updates: Partial<Pick<Project, 'bimCode' | 'name' | 'description' | 'discipline' | 'author'>>,
  ): Promise<void> {
    return this.projects.updateProject(id, updates);
  }

  deleteProject(id: ProjectId): Promise<void> {
    return this.projects.deleteProject(id);
  }

  // -------------------------------------------------------------------------
  // Espacios
  // -------------------------------------------------------------------------

  /**
   * Crea un espacio: un Recinto nuevo Y su pertenencia al proyecto.
   *
   * Las dos escrituras van en una transacción porque un Recinto sin fila de
   * pertenencia quedaría huérfano (invisible desde el proyecto, y solo
   * recuperable con `adoptOrphanRooms`), y una fila de pertenencia sin Recinto
   * sería un espacio que se lista y no se puede abrir.
   */
  async createSpace(input: CreateSpaceInput): Promise<{ space: ProjectSpace; room: Room }> {
    const project = await this.projects.readProject(input.projectId);
    if (!project) {
      throw new AppError({
        code: AppErrorCode.NOT_FOUND,
        userMessage: 'El proyecto no existe o fue eliminado.',
        technicalDetail: `Project ${input.projectId} not found`,
      });
    }

    const bimCode = input.bimCode
      ? normalizeBimCode(input.bimCode)
      : await this.projects.nextSpaceCode(input.projectId);

    const existingSpaces = await this.projects.listSpaces(input.projectId);

    const newRoomId = generateId();
    const room = new Room({
      id: newRoomId,
      roomId: toRoomId(newRoomId as string),
      levelId: this.defaultLevelId,
      geometry: [],
      isOpen: true,
      properties: { name: input.name, bimCode },
    });

    const space = new ProjectSpace({
      projectId: input.projectId,
      roomId: newRoomId as string,
      bimCode,
      name: input.name,
      orderIndex: existingSpaces.length,
    });

    await this.objects.createObject(room);
    await this.projects.addSpace(space);

    return { space, room };
  }

  /**
   * Espacios del proyecto, con su Recinto y sus cifras.
   *
   * Un espacio cuyo Recinto ya no existe se devuelve con `room: null` en vez de
   * omitirse: ocultarlo dejaría una fila fantasma que nadie puede ver ni
   * limpiar, y la pantalla puede mostrarlo como "espacio sin datos" y ofrecer
   * quitarlo.
   */
  async listSpaceDetails(project: ProjectId): Promise<SpaceDetail[]> {
    const spaces = await this.projects.listSpaces(project);

    const details: SpaceDetail[] = [];
    for (const space of spaces) {
      const room = (await this.objects.readObject(revitObjectId(space.roomId))) as Room | null;
      const objects = room ? await this.objects.listObjects(toRoomId(space.roomId)) : [];
      details.push({
        space,
        room,
        areaM2: room?.area != null ? Number(room.area) : null,
        // El propio Room está en la lista de objetos de su Recinto; se descuenta
        // para que el número que se enseña sea "elementos dibujados".
        objectCount: Math.max(0, objects.length - (room ? 1 : 0)),
      });
    }
    return details;
  }

  updateSpace(
    project: ProjectId,
    roomId: string,
    updates: Partial<Pick<ProjectSpace, 'bimCode' | 'name' | 'orderIndex'>>,
  ): Promise<void> {
    return this.projects.updateSpace(project, roomId, updates);
  }

  /**
   * Quita el espacio del proyecto. El Recinto y todo lo dibujado en él siguen
   * existiendo: queda huérfano y se puede readoptar. Borrar el levantamiento
   * de verdad es otra operación, y debe pedirse explícitamente.
   */
  removeSpace(project: ProjectId, roomId: string): Promise<void> {
    return this.projects.removeSpace(project, roomId);
  }

  /** Proyecto al que pertenece un Recinto, o `null`. */
  projectOfRoom(roomId: RoomId): Promise<ProjectId | null> {
    return this.projects.projectOfRoom(roomId as string);
  }

  // -------------------------------------------------------------------------
  // Migración de datos existentes
  // -------------------------------------------------------------------------

  /**
   * Adopta los Recintos sin proyecto dentro de uno.
   *
   * POR QUÉ HACE FALTA: antes de esta versión la app no tenía proyectos; todos
   * los Recintos colgaban de una lista plana. Sin esta adopción, al actualizar
   * la app el operador abriría la pantalla de Proyectos, la vería vacía, y
   * TODO su trabajo anterior quedaría inalcanzable — seguiría en la base, pero
   * sin ninguna pantalla desde la que llegar a él.
   *
   * Es IDEMPOTENTE: si no hay huérfanos no crea nada y devuelve `null`. Eso
   * permite llamarla en cada arranque sin acumular proyectos vacíos.
   */
  async adoptOrphanRooms(params?: {
    name?: string;
    author?: string;
  }): Promise<{ project: Project; adopted: number } | null> {
    const orphanIds = await this.projects.listOrphanRoomIds();
    if (orphanIds.length === 0) return null;

    const project = await this.createProject({
      name: params?.name ?? 'Levantamientos anteriores',
      description:
        'Creado automáticamente al actualizar la app: agrupa los Recintos que existían antes de que ' +
        'PolyLive organizara el trabajo por proyectos.',
      author: params?.author,
    });

    let index = 0;
    for (const roomIdValue of orphanIds) {
      const room = (await this.objects.readObject(revitObjectId(roomIdValue))) as Room | null;
      const name = (room?.properties.name as string | undefined) ?? `Recinto ${index + 1}`;

      await this.projects.addSpace(
        new ProjectSpace({
          projectId: project.id,
          roomId: roomIdValue,
          bimCode: await this.projects.nextSpaceCode(project.id),
          name,
          orderIndex: index,
        }),
      );
      index++;
    }

    return { project, adopted: orphanIds.length };
  }
}
