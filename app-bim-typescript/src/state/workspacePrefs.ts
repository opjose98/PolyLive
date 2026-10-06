// =============================================================================
// workspacePrefs.ts — Preferencias del espacio de trabajo que sobreviven al cierre
// =============================================================================
//
// Tema (claro / oscuro / alto contraste, vital al sol), cuadrícula, snaps,
// escala y capas: antes volvían a los valores de fábrica en cada arranque.
// El modo de trabajo NO se guarda: la app siempre abre en Levantamiento
// (decisión del producto, docs/14).
// =============================================================================

import type { StoreApi } from 'zustand/vanilla';
import type { WorkspaceState } from './workspaceStore';

export const PREF_KEYS = ['canvasTheme', 'grid', 'snap', 'scale', 'layers'] as const;
export type WorkspacePrefs = Partial<Pick<WorkspaceState, (typeof PREF_KEYS)[number]>>;

export interface PrefsStorage {
  load(): Promise<WorkspacePrefs | null>;
  save(prefs: WorkspacePrefs): Promise<void>;
}

export function pickPrefs(s: WorkspaceState): WorkspacePrefs {
  return { canvasTheme: s.canvasTheme, grid: s.grid, snap: s.snap, scale: s.scale, layers: s.layers };
}

/** Mezcla lo guardado con los valores actuales (claves nuevas de una versión posterior conservan su valor por defecto). */
export function mergePrefs(s: WorkspaceState, saved: WorkspacePrefs): Partial<WorkspaceState> {
  const out: { -readonly [K in keyof WorkspaceState]?: WorkspaceState[K] } = {};
  if (typeof saved.canvasTheme === 'string') out.canvasTheme = saved.canvasTheme;
  if (saved.grid && typeof saved.grid === 'object') out.grid = { ...s.grid, ...saved.grid };
  if (saved.snap && typeof saved.snap === 'object') out.snap = { ...s.snap, ...saved.snap };
  if (saved.scale && typeof saved.scale === 'object') out.scale = { ...s.scale, ...saved.scale };
  if (saved.layers && typeof saved.layers === 'object') out.layers = { ...s.layers, ...saved.layers };
  return out;
}

/**
 * Carga lo guardado en el store y guarda cada cambio (agrupado: un toggle no
 * escribe el archivo diez veces seguidas). Devuelve la función para soltarlo.
 */
export async function bindWorkspacePrefs(store: StoreApi<WorkspaceState>, storage: PrefsStorage, debounceMs = 500): Promise<() => void> {
  try {
    const saved = await storage.load();
    if (saved) store.setState(mergePrefs(store.getState(), saved));
  } catch {
    // Unas preferencias ilegibles no deben impedir trabajar: se usan las de fábrica.
  }
  let last = JSON.stringify(pickPrefs(store.getState()));
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = store.subscribe((s) => {
    const now = JSON.stringify(pickPrefs(s));
    if (now === last) return;
    last = now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void storage.save(JSON.parse(now)).catch(() => undefined), debounceMs);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
