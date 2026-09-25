// =============================================================================
// ProjectService.test.ts — Proyectos y espacios (portado de LevON)
// =============================================================================
//
// Contra SQLite real: la mitad de lo que hay que verificar aquí son consultas
// (huérfanos, resúmenes agregados, unicidad de códigos) que un mock en memoria
// no ejercitaría.
// =============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices, AppServices } from '../../src/application/AppServices';
import { Room } from '../../src/domain/objects/room';
import { revitObjectId, roomId, levelId, generateId } from '../../src/domain/objects/base';
import { squareMeters } from '../../src/domain/geometry/types';
import {
  generateBimCode,
  isValidBimCode,
  normalizeBimCode,
  Project,
  ProjectSpace,
  projectId,
} from '../../src/domain/objects/project';
import { AppErrorCode } from '../../src/shared/errors/AppError';

// ---------------------------------------------------------------------------
// Dominio puro
// ---------------------------------------------------------------------------

describe('Códigos BIM', () => {
  it('genera el primer código libre con el prefijo dado', () => {
    expect(generateBimCode('BIM', [])).toBe('BIM001');
    expect(generateBimCode('BIM', ['BIM001', 'BIM002'])).toBe('BIM003');
  });

  it('reutiliza los huecos que dejan los códigos borrados', () => {
    // Un contador `max + 1` daría BIM004 y dejaría BIM002 muerto para siempre.
    expect(generateBimCode('BIM', ['BIM001', 'BIM003'])).toBe('BIM002');
  });

  it('normaliza antes de comparar: "bim 001" ya está ocupado', () => {
    expect(generateBimCode('BIM', ['bim 001'])).toBe('BIM002');
  });

  it('pasa a cuatro dígitos al agotar los tres, en vez de caer a un timestamp', () => {
    const taken = Array.from({ length: 999 }, (_, i) => `BIM${String(i + 1).padStart(3, '0')}`);
    expect(generateBimCode('BIM', taken)).toBe('BIM1000');
  });

  it('valida el formato: 2–5 letras mayúsculas y 1–6 dígitos', () => {
    for (const valid of ['BIM001', 'ARC042', 'SPC1', 'LEV99']) {
      expect(isValidBimCode(valid)).toBe(true);
    }
    for (const invalid of ['B1', 'TOOLONGX1', 'bim001', 'BIM', '001', 'BIM 001', 'BIM0000001']) {
      expect(isValidBimCode(invalid)).toBe(false);
    }
  });

  it('normalize quita espacios y pasa a mayúsculas', () => {
    expect(normalizeBimCode('  arc 042 ')).toBe('ARC042');
  });
});

describe('Project — invariantes', () => {
  it('rechaza un nombre vacío', () => {
    expect(
      () => new Project({ id: projectId('p1'), bimCode: 'BIM001', name: '   ' }),
    ).toThrow(/name/);
  });

  it('rechaza un código BIM con formato inválido, y lo dice con un ejemplo', () => {
    expect(() => new Project({ id: projectId('p1'), bimCode: 'xx', name: 'Obra' })).toThrow(/BIM001/);
  });

  it('normaliza el código al construir', () => {
    expect(new Project({ id: projectId('p1'), bimCode: ' bim001 ', name: 'Obra' }).bimCode).toBe('BIM001');
  });

  it('un espacio también exige nombre y código válidos', () => {
    expect(
      () => new ProjectSpace({ projectId: projectId('p1'), roomId: 'r1', bimCode: 'SPC001', name: '' }),
    ).toThrow(/name/);
  });
});

// ---------------------------------------------------------------------------
// Servicio, contra base real
// ---------------------------------------------------------------------------

describe('ProjectService', () => {
  let dbPath: string;
  let db: Database;
  let services: AppServices;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `projects-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(dbPath);
    await db.open();
    await db.migrate();
    services = createAppServices(db);
  });

  afterEach(async () => {
    await db.close().catch(() => undefined);
    fs.rmSync(dbPath, { force: true });
  });

  // -------------------------------------------------------------------------
  // CRUD de proyectos
  // -------------------------------------------------------------------------

  describe('proyectos', () => {
    it('crea un proyecto asignándole el primer código libre', async () => {
      const first = await services.projects.createProject({ name: 'Nave industrial' });
      const second = await services.projects.createProject({ name: 'Chalet' });

      expect(first.bimCode).toBe('BIM001');
      expect(second.bimCode).toBe('BIM002');
    });

    it('acepta un código escrito a mano y lo normaliza', async () => {
      const project = await services.projects.createProject({ name: 'Obra', bimCode: ' arc042 ' });
      expect(project.bimCode).toBe('ARC042');
    });

    it('rechaza un código con formato inválido explicando el formato', async () => {
      await expect(
        services.projects.createProject({ name: 'Obra', bimCode: 'x' }),
      ).rejects.toMatchObject({ code: AppErrorCode.VALIDATION_FAILED });
    });

    it('rechaza un código ya usado por otro proyecto vivo', async () => {
      await services.projects.createProject({ name: 'A', bimCode: 'BIM001' });
      await expect(
        services.projects.createProject({ name: 'B', bimCode: 'BIM001' }),
      ).rejects.toMatchObject({ code: AppErrorCode.VALIDATION_FAILED });
    });

    it('permite reutilizar el código de un proyecto borrado', async () => {
      // Los códigos solo compiten entre proyectos VIVOS: por eso la unicidad se
      // comprueba en el store y no con un UNIQUE en el schema.
      const first = await services.projects.createProject({ name: 'A', bimCode: 'BIM001' });
      await services.projects.deleteProject(first.id);

      const reused = await services.projects.createProject({ name: 'B', bimCode: 'BIM001' });
      expect(reused.bimCode).toBe('BIM001');
    });

    it('lista los proyectos vivos y omite los borrados', async () => {
      const a = await services.projects.createProject({ name: 'A' });
      await services.projects.createProject({ name: 'B' });
      await services.projects.deleteProject(a.id);

      const listed = await services.projects.listProjects();
      expect(listed.map((p) => p.name)).toEqual(['B']);
    });

    it('actualiza los campos BIM del proyecto', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });

      await services.projects.updateProject(project.id, {
        name: 'Obra revisada',
        discipline: 'Estructuras',
        author: 'A. Pérez',
        description: 'Ampliación',
      });

      const reread = await services.projects.readProject(project.id);
      expect(reread?.name).toBe('Obra revisada');
      expect(reread?.discipline).toBe('Estructuras');
      expect(reread?.author).toBe('A. Pérez');
      expect(reread?.description).toBe('Ampliación');
    });

    it('rechaza renombrar el código a uno ya ocupado', async () => {
      await services.projects.createProject({ name: 'A', bimCode: 'BIM001' });
      const b = await services.projects.createProject({ name: 'B', bimCode: 'BIM002' });

      await expect(
        services.projects.updateProject(b.id, { bimCode: 'BIM001' }),
      ).rejects.toMatchObject({ code: AppErrorCode.VALIDATION_FAILED });
    });

    it('actualizar un proyecto inexistente falla con NOT_FOUND', async () => {
      await expect(
        services.projects.updateProject(projectId('no-existe'), { name: 'X' }),
      ).rejects.toMatchObject({ code: AppErrorCode.NOT_FOUND });
    });
  });

  // -------------------------------------------------------------------------
  // Espacios
  // -------------------------------------------------------------------------

  describe('espacios', () => {
    it('crear un espacio crea también su Recinto real', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });

      const { space, room } = await services.projects.createSpace({
        projectId: project.id,
        name: 'Planta baja',
      });

      expect(space.bimCode).toBe('SPC001');
      const stored = await services.store.readObject(room.id);
      expect(stored).toBeInstanceOf(Room);
      expect((stored as Room).properties.name).toBe('Planta baja');
    });

    it('numera los espacios de cada proyecto por separado', async () => {
      const a = await services.projects.createProject({ name: 'A' });
      const b = await services.projects.createProject({ name: 'B' });

      const spaceA = await services.projects.createSpace({ projectId: a.id, name: 'Baja' });
      const spaceB = await services.projects.createSpace({ projectId: b.id, name: 'Baja' });

      // SPC001 en ambos: el código identifica el espacio DENTRO de su proyecto.
      expect(spaceA.space.bimCode).toBe('SPC001');
      expect(spaceB.space.bimCode).toBe('SPC001');
    });

    it('lista los espacios con su área y su número de elementos', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Baja' });

      await services.useCases.createWall.execute({
        roomId: room.roomId,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 4, y: 0 },
        thickness: 0.15 as never,
        height: 2.8 as never,
      });

      const details = await services.projects.listSpaceDetails(project.id);
      expect(details).toHaveLength(1);
      expect(details[0].objectCount).toBe(1); // el muro; el propio Room no cuenta
      expect(details[0].areaM2).toBeNull(); // todavía sin cerrar
    });

    it('crear un espacio en un proyecto inexistente falla con NOT_FOUND', async () => {
      await expect(
        services.projects.createSpace({ projectId: projectId('no-existe'), name: 'X' }),
      ).rejects.toMatchObject({ code: AppErrorCode.NOT_FOUND });
    });

    it('quitar un espacio NO borra el Recinto ni lo que hay dibujado en él', async () => {
      // Quitar del proyecto es sacar de la carpeta, no destruir el contenido.
      const project = await services.projects.createProject({ name: 'Obra' });
      const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Baja' });

      await services.projects.removeSpace(project.id, room.id as string);

      expect(await services.projects.listSpaceDetails(project.id)).toHaveLength(0);
      expect(await services.store.readObject(room.id)).not.toBeNull();
    });

    it('borrar el proyecto tampoco borra sus Recintos', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Baja' });

      await services.projects.deleteProject(project.id);

      expect(await services.store.readObject(room.id)).not.toBeNull();
    });

    it('projectOfRoom resuelve el proyecto de un Recinto, y null si está huérfano', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Baja' });

      expect(await services.projects.projectOfRoom(room.roomId)).toBe(project.id as string);

      await services.projects.removeSpace(project.id, room.id as string);
      expect(await services.projects.projectOfRoom(room.roomId)).toBeNull();
    });

    it('renombra un espacio y reordena', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      const { room } = await services.projects.createSpace({ projectId: project.id, name: 'Baja' });

      await services.projects.updateSpace(project.id, room.id as string, {
        name: 'Planta baja revisada',
        orderIndex: 5,
      });

      const [detail] = await services.projects.listSpaceDetails(project.id);
      expect(detail.space.name).toBe('Planta baja revisada');
      expect(detail.space.orderIndex).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Resúmenes
  // -------------------------------------------------------------------------

  describe('resúmenes', () => {
    it('agrega superficie cerrada y cuenta los espacios abiertos', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      const closed = await services.projects.createSpace({ projectId: project.id, name: 'Cerrado' });
      await services.projects.createSpace({ projectId: project.id, name: 'Abierto' });

      await services.store.updateObject(closed.room.id, { area: squareMeters(42.5) } as never);

      const [summary] = await services.projects.listProjectSummaries();
      expect(summary.spaceCount).toBe(2);
      expect(summary.totalAreaM2).toBeCloseTo(42.5);
      expect(summary.openSpaceCount).toBe(1);
    });

    it('un proyecto sin espacios aparece en la lista con cifras a cero', async () => {
      await services.projects.createProject({ name: 'Vacío' });

      const [summary] = await services.projects.listProjectSummaries();
      expect(summary.spaceCount).toBe(0);
      expect(summary.totalAreaM2).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Adopción de Recintos huérfanos
  // -------------------------------------------------------------------------

  describe('adopción de Recintos huérfanos', () => {
    /** Crea un Recinto suelto, como los que dejó la app antes de tener proyectos. */
    async function createLooseRoom(name: string): Promise<string> {
      const id = generateId();
      await services.store.createObject(
        new Room({
          id,
          roomId: roomId(id as unknown as string),
          levelId: levelId('level-1'),
          geometry: [],
          properties: { name },
        }),
      );
      return id as unknown as string;
    }

    it('agrupa los Recintos sin proyecto en un proyecto nuevo', async () => {
      // Sin esto, al actualizar la app el operador vería la lista de proyectos
      // vacía y TODO su trabajo anterior quedaría inalcanzable.
      await createLooseRoom('Salón');
      await createLooseRoom('Cocina');

      const result = await services.projects.adoptOrphanRooms();

      expect(result?.adopted).toBe(2);
      const details = await services.projects.listSpaceDetails(result!.project.id);
      expect(details.map((d) => d.space.name).sort()).toEqual(['Cocina', 'Salón']);
    });

    it('es idempotente: sin huérfanos no crea ningún proyecto', async () => {
      expect(await services.projects.adoptOrphanRooms()).toBeNull();

      await createLooseRoom('Salón');
      await services.projects.adoptOrphanRooms();

      // Segunda pasada: ya no hay huérfanos, así que no debe crear otro proyecto.
      expect(await services.projects.adoptOrphanRooms()).toBeNull();
      expect(await services.projects.listProjects()).toHaveLength(1);
    });

    it('readopta los Recintos cuyo proyecto se borró', async () => {
      const project = await services.projects.createProject({ name: 'Obra' });
      await services.projects.createSpace({ projectId: project.id, name: 'Baja' });
      await services.projects.deleteProject(project.id);

      const result = await services.projects.adoptOrphanRooms();
      expect(result?.adopted).toBe(1);
    });

    it('da un nombre de respaldo al Recinto que no lo tenga', async () => {
      const id = generateId();
      await services.store.createObject(
        new Room({ id, roomId: roomId(id as unknown as string), levelId: levelId('level-1') }),
      );

      const result = await services.projects.adoptOrphanRooms();
      const [detail] = await services.projects.listSpaceDetails(result!.project.id);
      expect(detail.space.name).toBe('Recinto 1');
    });

    it('no adopta Recintos borrados', async () => {
      const id = await createLooseRoom('Borrado');
      await services.store.deleteObject(revitObjectId(id));

      expect(await services.projects.adoptOrphanRooms()).toBeNull();
    });
  });
});
