// =============================================================================
// ProjectStore.ts — Persistencia de Project y ProjectSpace
// Basado en: domain/objects/project.ts, schema.ts (projects, project_spaces)
// =============================================================================
//
// Store separado de ObjectStore a propósito: `Project` y `ProjectSpace` no son
// `RevitObjectBase` (no tienen geometría, ni `roomId`, ni soft-delete en
// cascada de vanos) y no pasan por el CommandStack. Meterlos en ObjectStore
// habría exigido ensanchar `IObjectStore` con métodos que no encajan en su
// contrato, que es exactamente cómo `createMeasurement` y `createAuditPhoto`
// acabaron invocándose con `(store as any)` desde sus UseCases.
// =============================================================================

import { IDatabase } from './database';
import { Project, ProjectSpace, ProjectId, ProjectSummary, BimDiscipline, projectId as toProjectId, normalizeBimCode, generateProjectCode, generateSpaceCode } from '../../domain/objects/project';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  bim_code: string;
  name: string;
  description: string;
  discipline: string;
  author: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

interface ProjectSpaceRow {
  project_id: string;
  room_id: string;
  bim_code: string;
  name: string;
  order_index: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class ProjectStore {
  constructor(private readonly db: IDatabase) {}

  // -------------------------------------------------------------------------
  // Proyectos
  // -------------------------------------------------------------------------

  async createProject(project: Project): Promise<ProjectId> {
    // La unicidad del código BIM se comprueba aquí y no con un UNIQUE en el
    // schema: los proyectos borrados conservan su código, y un UNIQUE impediría
    // reutilizarlo. Solo compiten los proyectos VIVOS.
    const clash = await this.db.get<{ id: string }>(
      `SELECT id FROM projects WHERE bim_code = ? AND is_deleted = 0`,
      [project.bimCode],
    );
    if (clash) {
      throw new AppError({
        code: AppErrorCode.VALIDATION_FAILED,
        userMessage: `Ya existe un proyecto con el código ${project.bimCode}.`,
        technicalDetail: `bim_code collision with project ${clash.id}`,
        context: { bimCode: project.bimCode },
      });
    }

    await this.db.run(
      `INSERT INTO projects (id, bim_code, name, description, discipline, author, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        project.id as string,
        project.bimCode,
        project.name,
        project.description,
        project.discipline,
        project.author,
        project.created_at.toISOString(),
        project.updated_at.toISOString(),
      ],
    );
    return project.id;
  }

  async readProject(id: ProjectId): Promise<Project | null> {
    const row = await this.db.get<ProjectRow>(
      `SELECT * FROM projects WHERE id = ? AND is_deleted = 0`,
      [id as string],
    );
    return row ? this.rowToProject(row) : null;
  }

  /** Proyectos vivos, el más recientemente modificado primero. */
  async listProjects(): Promise<Project[]> {
    const rows = await this.db.all<ProjectRow>(
      `SELECT * FROM projects WHERE is_deleted = 0 ORDER BY updated_at DESC`,
    );
    return rows.map((row) => this.rowToProject(row));
  }

  async updateProject(
    id: ProjectId,
    updates: Partial<Pick<Project, 'bimCode' | 'name' | 'description' | 'discipline' | 'author'>>,
  ): Promise<void> {
    const existing = await this.readProject(id);
    if (!existing) {
      throw new AppError({
        code: AppErrorCode.NOT_FOUND,
        userMessage: 'El proyecto no existe o fue eliminado.',
        technicalDetail: `Project ${id} not found`,
      });
    }

    if (updates.bimCode !== undefined) {
      const code = normalizeBimCode(updates.bimCode);
      const clash = await this.db.get<{ id: string }>(
        `SELECT id FROM projects WHERE bim_code = ? AND id <> ? AND is_deleted = 0`,
        [code, id as string],
      );
      if (clash) {
        throw new AppError({
          code: AppErrorCode.VALIDATION_FAILED,
          userMessage: `Ya existe un proyecto con el código ${code}.`,
          technicalDetail: `bim_code collision with project ${clash.id}`,
        });
      }
    }

    // Se reconstruye la entidad para que sus invariantes (nombre no vacío,
    // formato del código) se validen ANTES de escribir, en vez de guardar
    // primero y descubrir el problema al releer.
    const merged = new Project({
      id,
      bimCode: updates.bimCode ?? existing.bimCode,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      discipline: updates.discipline ?? existing.discipline,
      author: updates.author ?? existing.author,
      created_at: existing.created_at,
      updated_at: new Date(),
    });

    await this.db.run(
      `UPDATE projects
       SET bim_code = ?, name = ?, description = ?, discipline = ?, author = ?, updated_at = ?
       WHERE id = ?`,
      [
        merged.bimCode,
        merged.name,
        merged.description,
        merged.discipline,
        merged.author,
        merged.updated_at.toISOString(),
        id as string,
      ],
    );
  }

  /**
   * Soft-delete del proyecto y de sus vínculos con espacios.
   *
   * Los RECINTOS NO SE TOCAN: contienen el levantamiento real, y borrar la
   * carpeta no debe destruir lo que hay dentro. Quedan como Recintos sin
   * proyecto, que `ProjectService.adoptOrphanRooms` puede volver a asignar.
   */
  async deleteProject(id: ProjectId): Promise<void> {
    const now = new Date().toISOString();
    return this.db.transaction(async () => {
      await this.db.run(`UPDATE projects SET is_deleted = 1, updated_at = ? WHERE id = ?`, [
        now,
        id as string,
      ]);
      await this.db.run(
        `UPDATE project_spaces SET is_deleted = 1, updated_at = ? WHERE project_id = ?`,
        [now, id as string],
      );
    });
  }

  /** Códigos BIM en uso por proyectos vivos — para generar el siguiente libre. */
  async usedProjectCodes(): Promise<string[]> {
    const rows = await this.db.all<{ bim_code: string }>(
      `SELECT bim_code FROM projects WHERE is_deleted = 0`,
    );
    return rows.map((r) => r.bim_code);
  }

  async nextProjectCode(): Promise<string> {
    return generateProjectCode(await this.usedProjectCodes());
  }

  // -------------------------------------------------------------------------
  // Espacios
  // -------------------------------------------------------------------------

  async addSpace(space: ProjectSpace): Promise<void> {
    // `INSERT OR REPLACE` y no `INSERT`: la PK es (project_id, room_id), y
    // reañadir un espacio previamente quitado del proyecto es una operación
    // legítima que con un INSERT plano chocaría contra la fila soft-deleted.
    await this.db.run(
      `INSERT OR REPLACE INTO project_spaces
         (project_id, room_id, bim_code, name, order_index, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        space.projectId as string,
        space.roomId,
        space.bimCode,
        space.name,
        space.orderIndex,
        space.created_at.toISOString(),
        space.updated_at.toISOString(),
      ],
    );
  }

  async listSpaces(project: ProjectId): Promise<ProjectSpace[]> {
    const rows = await this.db.all<ProjectSpaceRow>(
      `SELECT * FROM project_spaces
       WHERE project_id = ? AND is_deleted = 0
       ORDER BY order_index ASC, created_at ASC`,
      [project as string],
    );
    return rows.map((row) => this.rowToSpace(row));
  }

  async readSpace(project: ProjectId, roomId: string): Promise<ProjectSpace | null> {
    const row = await this.db.get<ProjectSpaceRow>(
      `SELECT * FROM project_spaces WHERE project_id = ? AND room_id = ? AND is_deleted = 0`,
      [project as string, roomId],
    );
    return row ? this.rowToSpace(row) : null;
  }

  /** Proyecto al que pertenece un Recinto, o `null` si está huérfano. */
  async projectOfRoom(roomId: string): Promise<ProjectId | null> {
    const row = await this.db.get<{ project_id: string }>(
      `SELECT ps.project_id FROM project_spaces ps
       JOIN projects p ON p.id = ps.project_id AND p.is_deleted = 0
       WHERE ps.room_id = ? AND ps.is_deleted = 0`,
      [roomId],
    );
    return row ? toProjectId(row.project_id) : null;
  }

  async updateSpace(
    project: ProjectId,
    roomId: string,
    updates: Partial<Pick<ProjectSpace, 'bimCode' | 'name' | 'orderIndex'>>,
  ): Promise<void> {
    const existing = await this.readSpace(project, roomId);
    if (!existing) {
      throw new AppError({
        code: AppErrorCode.NOT_FOUND,
        userMessage: 'El espacio no existe en este proyecto.',
        technicalDetail: `ProjectSpace (${project}, ${roomId}) not found`,
      });
    }

    const merged = new ProjectSpace({
      projectId: project,
      roomId,
      bimCode: updates.bimCode ?? existing.bimCode,
      name: updates.name ?? existing.name,
      orderIndex: updates.orderIndex ?? existing.orderIndex,
      created_at: existing.created_at,
      updated_at: new Date(),
    });

    await this.db.run(
      `UPDATE project_spaces
       SET bim_code = ?, name = ?, order_index = ?, updated_at = ?
       WHERE project_id = ? AND room_id = ?`,
      [
        merged.bimCode,
        merged.name,
        merged.orderIndex,
        merged.updated_at.toISOString(),
        project as string,
        roomId,
      ],
    );
  }

  /** Quita el espacio del proyecto. El Recinto y sus objetos siguen intactos. */
  async removeSpace(project: ProjectId, roomId: string): Promise<void> {
    await this.db.run(
      `UPDATE project_spaces SET is_deleted = 1, updated_at = ?
       WHERE project_id = ? AND room_id = ?`,
      [new Date().toISOString(), project as string, roomId],
    );
  }

  async usedSpaceCodes(project: ProjectId): Promise<string[]> {
    const rows = await this.db.all<{ bim_code: string }>(
      `SELECT bim_code FROM project_spaces WHERE project_id = ? AND is_deleted = 0`,
      [project as string],
    );
    return rows.map((r) => r.bim_code);
  }

  async nextSpaceCode(project: ProjectId): Promise<string> {
    return generateSpaceCode(await this.usedSpaceCodes(project));
  }

  // -------------------------------------------------------------------------
  // Agregados para listados
  // -------------------------------------------------------------------------

  /**
   * Resumen por proyecto en DOS consultas, no N+1.
   *
   * La alternativa —cargar los objetos de cada Recinto de cada proyecto desde
   * la pantalla— significa decenas de consultas para pintar una lista, y en un
   * dispositivo de campo eso se nota. El área sale de `properties_json` del
   * Room, donde ObjectStore la guarda al cerrarlo.
   */
  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const projects = await this.listProjects();
    if (projects.length === 0) return [];

    const rows = await this.db.all<{
      project_id: string;
      room_id: string;
      properties_json: string | null;
    }>(
      `SELECT ps.project_id, ps.room_id, ro.properties_json
       FROM project_spaces ps
       LEFT JOIN revit_objects ro
         ON ro.id = ps.room_id AND ro.object_type = 'Room' AND ro.is_deleted = 0
       WHERE ps.is_deleted = 0`,
    );

    const byProject = new Map<string, { count: number; area: number; open: number }>();
    for (const row of rows) {
      const bucket = byProject.get(row.project_id) ?? { count: 0, area: 0, open: 0 };
      bucket.count += 1;

      let area: number | null = null;
      if (row.properties_json) {
        try {
          const props = JSON.parse(row.properties_json) as { area?: number | null };
          area = typeof props.area === 'number' ? props.area : null;
        } catch {
          // Un properties_json corrupto no debe impedir listar los proyectos:
          // se cuenta el espacio y su área se toma como desconocida.
          area = null;
        }
      }

      if (area != null) bucket.area += area;
      else bucket.open += 1;

      byProject.set(row.project_id, bucket);
    }

    return projects.map((project) => {
      const bucket = byProject.get(project.id as string) ?? { count: 0, area: 0, open: 0 };
      return {
        project,
        spaceCount: bucket.count,
        totalAreaM2: bucket.area,
        openSpaceCount: bucket.open,
      };
    });
  }

  /**
   * Recintos que no pertenecen a ningún proyecto vivo.
   *
   * Existen por dos motivos legítimos: bases creadas antes de que existiera la
   * entidad Project (la app modelaba "proyecto" como una lista plana de
   * Recintos), y Recintos cuyo proyecto se borró. En ambos casos contienen
   * trabajo real que no debe quedar inalcanzable.
   */
  async listOrphanRoomIds(): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      `SELECT ro.id FROM revit_objects ro
       WHERE ro.object_type = 'Room' AND ro.is_deleted = 0
         AND NOT EXISTS (
           SELECT 1 FROM project_spaces ps
           JOIN projects p ON p.id = ps.project_id AND p.is_deleted = 0
           WHERE ps.room_id = ro.id AND ps.is_deleted = 0
         )
       ORDER BY ro.created_at ASC`,
    );
    return rows.map((r) => r.id);
  }

  // -------------------------------------------------------------------------
  // Mapeo
  // -------------------------------------------------------------------------

  private rowToProject(row: ProjectRow): Project {
    return new Project({
      id: toProjectId(row.id),
      bimCode: row.bim_code,
      name: row.name,
      description: row.description,
      discipline: row.discipline as BimDiscipline,
      author: row.author,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: row.is_deleted === 1,
    });
  }

  private rowToSpace(row: ProjectSpaceRow): ProjectSpace {
    return new ProjectSpace({
      projectId: toProjectId(row.project_id),
      roomId: row.room_id,
      bimCode: row.bim_code,
      name: row.name,
      orderIndex: row.order_index,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: row.is_deleted === 1,
    });
  }
}
