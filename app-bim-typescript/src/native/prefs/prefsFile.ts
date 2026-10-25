// =============================================================================
// prefsFile.ts — Preferencias en un archivo JSON de la app
// =============================================================================
//
// Un archivo pequeño en la carpeta privada de la app (no en la base: las
// preferencias son del teléfono, no del proyecto, y no viajan en el paquete).
// Las escrituras van en cola (una tras otra): teclear en el encabezado de la
// memoria no pisa lo escrito un instante antes.
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import type { PrefsStorage, WorkspacePrefs } from '../../state/workspacePrefs';

const FILE = `${FileSystem.documentDirectory}prefs.json`;

interface PrefsFile {
  workspace?: WorkspacePrefs;
  app?: AppPrefs;
  /** Encabezado del contrato e ítems de la memoria de cantidades, por proyecto. */
  memoria?: Record<string, MemoriaPrefs>;
}

/**
 * Lo que se escribe a mano en la memoria (contrato, firmas, código e ítem de
 * cada actividad). shortcut: vive en el teléfono, no viaja en el paquete
 * .polylive; si hiciera falta compartirlo, pasarlo a una tabla del proyecto.
 */
export interface MemoriaPrefs {
  header?: Record<string, string>;
  items?: Record<string, { code: string; description: string; unit: string }>;
}

export interface AppPrefs {
  /** Respaldo local automático al abrir la app. */
  autoBackup?: boolean;
}

let queue: Promise<void> = Promise.resolve();

async function read(): Promise<PrefsFile> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(FILE)) as PrefsFile;
  } catch {
    return {};
  }
}

function enqueue(fn: (cur: PrefsFile) => PrefsFile): Promise<void> {
  const next = queue.then(async () => {
    const cur = await read();
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(fn(cur)));
  });
  queue = next.catch(() => undefined);
  return next;
}

export const workspacePrefsFile: PrefsStorage = {
  load: async () => (await read()).workspace ?? null,
  save: (workspace) => enqueue((cur) => ({ ...cur, workspace })),
};

export async function loadAppPrefs(): Promise<AppPrefs> {
  return (await read()).app ?? {};
}

export async function saveAppPrefs(app: AppPrefs): Promise<void> {
  await enqueue((cur) => ({ ...cur, app: { ...cur.app, ...app } }));
}

export async function loadMemoriaPrefs(projectKey: string): Promise<MemoriaPrefs> {
  return (await read()).memoria?.[projectKey] ?? {};
}

export async function saveMemoriaPrefs(projectKey: string, patch: MemoriaPrefs): Promise<void> {
  await enqueue((cur) => {
    const prev = cur.memoria?.[projectKey] ?? {};
    return {
      ...cur,
      memoria: {
        ...cur.memoria,
        [projectKey]: { header: { ...prev.header, ...patch.header }, items: { ...prev.items, ...patch.items } },
      },
    };
  });
}
