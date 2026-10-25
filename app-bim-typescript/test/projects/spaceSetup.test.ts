import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../../src/infrastructure/sqlite/database';
import { MarkerStore } from '../../src/infrastructure/sqlite/MarkerStore';
import { applySpaceSetup, defaultSpaceSetup, readSpaceSetup } from '../../src/application/projects/spaceSetup';

describe('Configuración inicial del espacio (docs/23 § 7)', () => {
  let file: string;
  let db: Database;
  beforeEach(async () => {
    file = path.join(os.tmpdir(), `setup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new Database(file);
    await db.open();
    await db.migrate();
  });
  afterEach(async () => {
    await db.close();
    fs.rmSync(file, { force: true });
  });

  it('aplica la plantilla y las fases, y se lee igual para copiarla a otro espacio', async () => {
    const markers = new MarkerStore(db);
    const a = { projectId: 'p', spaceId: 'a' };
    const setup = { ...defaultSpaceSetup(), phases: ['Existente', 'Demolición', 'Nueva'] };
    await applySpaceSetup(markers, a, setup);
    expect(await readSpaceSetup(markers, a)).toEqual({
      levels: [
        { name: 'Piso', value: 0 },
        { name: 'Muro', value: 2.4 },
        { name: 'Viga', value: 2.6 },
        { name: 'Cubierta', value: 3.5 },
      ],
      phases: ['Existente', 'Demolición', 'Nueva'],
    });
  });

  it('ordena por cota, descarta filas vacías o en cota 0 y deja al menos una fase', async () => {
    const markers = new MarkerStore(db);
    const b = { projectId: 'p', spaceId: 'b' };
    await applySpaceSetup(markers, b, {
      levels: [
        { name: ' ', value: 5 },
        { name: 'Cubierta', value: 3.24 },
        { name: 'Muro', value: 2.22 },
        { name: '', value: 1 },
        { name: 'Otro', value: 0 },
      ],
      phases: ['  '],
    });
    expect(await readSpaceSetup(markers, b)).toEqual({
      levels: [
        { name: 'Nivel 0', value: 0 },
        { name: 'Muro', value: 2.22 },
        { name: 'Cubierta', value: 3.24 },
      ],
      phases: ['Fase 0'],
    });
  });
});
