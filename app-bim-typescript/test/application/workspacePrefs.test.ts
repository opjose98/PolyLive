import { createWorkspaceStore } from '../../src/state/workspaceStore';
import { bindWorkspacePrefs, mergePrefs, pickPrefs, WorkspacePrefs } from '../../src/state/workspacePrefs';
import { diagnostics, formatEntry } from '../../src/shared/diagnostics';

describe('Preferencias del lienzo', () => {
  it('se cargan al arrancar y se guardan al cambiar (agrupadas)', async () => {
    jest.useFakeTimers();
    let saved: WorkspacePrefs | null = { canvasTheme: 'oscuro', snap: { node: false } as never };
    const saves: WorkspacePrefs[] = [];
    const store = createWorkspaceStore();
    const unbind = await bindWorkspacePrefs(store, { load: async () => saved, save: async (p) => void saves.push(p) }, 100);
    expect(store.getState().canvasTheme).toBe('oscuro');
    expect(store.getState().snap.node).toBe(false);
    expect(store.getState().snap.angle).toBe(true); // clave que no estaba: valor de fábrica
    store.getState().setCanvasTheme('contraste');
    store.getState().toggleSnap('vertex');
    jest.advanceTimersByTime(150);
    expect(saves).toHaveLength(1);
    expect(saves[0].canvasTheme).toBe('contraste');
    expect(saves[0].snap?.vertex).toBe(true);
    unbind();
    jest.useRealTimers();
    saved = null;
  });

  it('unas preferencias ilegibles no impiden arrancar', async () => {
    const store = createWorkspaceStore();
    await bindWorkspacePrefs(store, { load: async () => { throw new Error('roto'); }, save: async () => undefined });
    expect(store.getState().canvasTheme).toBe('claro');
  });

  it('mergePrefs ignora valores de tipo inesperado', () => {
    const s = createWorkspaceStore().getState();
    expect(mergePrefs(s, { canvasTheme: 3 as never, grid: 'x' as never })).toEqual({});
    expect(Object.keys(pickPrefs(s)).sort()).toEqual(['canvasTheme', 'grid', 'layers', 'scale', 'snap']);
  });
});

describe('Registro de diagnóstico', () => {
  it('guarda nivel, origen, mensaje y el detalle del error; avisa a los oyentes', () => {
    diagnostics.clear();
    const seen: string[] = [];
    const off = diagnostics.subscribe((e) => seen.push(e.message));
    diagnostics.error('backup', 'Falló', new Error('disco lleno'));
    off();
    diagnostics.warn('x', 'no se ve');
    const [e] = diagnostics.entries();
    expect(e).toMatchObject({ level: 'error', source: 'backup', message: 'Falló' });
    expect(e.detail).toContain('disco lleno');
    expect(seen).toEqual(['Falló']);
    expect(formatEntry(e)).toMatch(/ERROR \[backup\] Falló/);
  });
});
