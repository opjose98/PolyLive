// =============================================================================
// devBridge.ts — Lado app del puente de control directo (solo desarrollo)
// =============================================================================
//
// Con la app en el dev client y `adb reverse tcp:8765 tcp:8765`, este bucle
// pide al puente del PC (scripts/bridge/polylive-bridge.mjs) el siguiente
// comando, lo ejecuta (application/bridge/bridgeCommands) y devuelve el
// resultado. Sin puente escuchando, reintenta cada pocos segundos sin ruido.
// Solo se arranca con __DEV__: la APK de campo no lo lleva activo.
// =============================================================================

import type { AppServices } from '../../application/AppServices';
import { BridgeContext, runBridgeCommand } from '../../application/bridge/bridgeCommands';

const DEFAULT_URL = 'http://127.0.0.1:8765';
const RETRY_MS = 4000;
/** Cabecera propia: un navegador no la puede mandar sin preflight CORS (que el puente no concede). */
const BRIDGE_HEADERS = { 'x-polylive-bridge': '1' };

type MutableContext = { -readonly [K in keyof BridgeContext]: BridgeContext[K] };

let context: MutableContext | null = null;

/** Actualiza lo que el puente ve de la app (editor abierto, navegación, exportar). */
export function updateBridgeContext(patch: Partial<Omit<BridgeContext, 'services'>>): void {
  if (context) Object.assign(context, patch);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Arranca el bucle; devuelve la función que lo detiene. */
export function startDevBridge(services: AppServices, url = DEFAULT_URL): () => void {
  // Cada bucle tiene su contexto: un recargado en caliente para el bucle viejo y crea otro.
  const own: MutableContext = { services, editor: null, projectId: null, spaceId: null };
  context = own;
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const r = await fetch(`${url}/next`, { headers: BRIDGE_HEADERS });
        if (r.status === 204) continue; // sin comandos: otra espera larga
        if (r.status !== 200) {
          await sleep(RETRY_MS); // otro servidor o un error: no martillar el puerto
          continue;
        }
        const c = (await r.json()) as { id: string; cmd: string; args?: Record<string, unknown> };
        let out: { id: string; ok: boolean; result?: unknown; error?: string };
        try {
          out = { id: c.id, ok: true, result: await runBridgeCommand(context ?? own, c.cmd, c.args) };
        } catch (err) {
          const e = err as { userMessage?: string; message?: string };
          out = { id: c.id, ok: false, error: e.userMessage ?? e.message ?? String(err) };
        }
        await fetch(`${url}/result`, { method: 'POST', headers: { ...BRIDGE_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(out) });
      } catch {
        await sleep(RETRY_MS);
      }
    }
  })();
  return () => {
    stopped = true;
    if (context === own) context = null;
  };
}
