// =============================================================================
// prefsFile.ts — Preferencias en un archivo JSON de la app
// =============================================================================
//
// Un archivo pequeño en la carpeta privada de la app (no en la base: las
// preferencias son del teléfono, no del proyecto, y no viajan en el paquete).
// =============================================================================

import * as FileSystem from 'expo-file-system/legacy';
import type { PrefsStorage, WorkspacePrefs } from '../../state/workspacePrefs';

const FILE = `${FileSystem.documentDirectory}prefs.json`;

interface PrefsFile {
  workspace?: WorkspacePrefs;
  app?: AppPrefs;
}

export interface AppPrefs {
  /** Respaldo local automático al abrir la app. */
  autoBackup?: boolean;
}

async function read(): Promise<PrefsFile> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(FILE)) as PrefsFile;
  } catch {
    return {};
  }
}

async function write(patch: Partial<PrefsFile>): Promise<void> {
  const cur = await read();
  await FileSystem.writeAsStringAsync(FILE, JSON.stringify({ ...cur, ...patch }));
}

export const workspacePrefsFile: PrefsStorage = {
  load: async () => (await read()).workspace ?? null,
  save: (workspace) => write({ workspace }),
};

export async function loadAppPrefs(): Promise<AppPrefs> {
  return (await read()).app ?? {};
}

export async function saveAppPrefs(app: AppPrefs): Promise<void> {
  const cur = await read();
  await write({ app: { ...cur.app, ...app } });
}
