#!/usr/bin/env node
// =============================================================================
// polylive-bridge.mjs — Puente de control directo con la app (solo desarrollo)
// =============================================================================
//
// La app (dev client .qa) consulta este puente por HTTP a través de
// `adb reverse tcp:8765 tcp:8765` y ejecuta los comandos con sus propios
// servicios y su editor (src/application/bridge). Así un agente levanta un plano
// con comandos (muros, vanos, suelos, niveles…) y no a toques de pantalla.
//
//   node scripts/bridge/polylive-bridge.mjs          servidor HTTP
//   node scripts/bridge/polylive-bridge.mjs --mcp    además, servidor MCP por stdio
//
// HTTP:
//   GET  /next     la app espera aquí el siguiente comando (long-poll 25 s)
//   POST /result   la app devuelve { id, ok, result | error }
//   POST /call     { cmd, args } → espera el resultado (para curl o scripts)
//   Todas (menos /health) exigen la cabecera `x-polylive-bridge: 1`.
//   GET  /health   ¿hay una app conectada?
//
// Sin dependencias: http y JSON-RPC por stdio a mano. Escucha solo en
// 127.0.0.1: el teléfono llega por el túnel de adb, nadie más.
// =============================================================================

import http from 'node:http';

const PORT = Number(process.env.POLYLIVE_BRIDGE_PORT ?? 8765);
const POLL_MS = 25_000;
const CALL_TIMEOUT_MS = 180_000;
const MCP = process.argv.includes('--mcp');

const log = (...a) => process.stderr.write(`[polylive-bridge] ${a.join(' ')}\n`);

// --- Cola de comandos -------------------------------------------------------

let seq = 0;
const queue = [];
/** Respuestas HTTP de la app esperando un comando. */
const waiters = [];
/** id → { resolve, timer } de las llamadas en curso. */
const pending = new Map();
let lastSeen = 0;

function dispatch() {
  while (queue.length && waiters.length) {
    const res = waiters.shift();
    if (res.writableEnded) continue;
    const cmd = queue.shift();
    clearTimeout(res.pollTimer);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cmd));
  }
}

function call(cmd, args) {
  return new Promise((resolve) => {
    const id = String(++seq);
    const timer = setTimeout(() => {
      pending.delete(id);
      const i = queue.findIndex((c) => c.id === id);
      if (i >= 0) queue.splice(i, 1);
      resolve({ ok: false, error: 'Sin respuesta de la app (¿abierta en el dev client, con adb reverse tcp:8765 tcp:8765?).' });
    }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    queue.push({ id, cmd, args: args ?? {} });
    dispatch();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Una página web del PC podría mandar un POST "simple" a 127.0.0.1 sin preflight
    // CORS. Una cabecera propia lo impide: el navegador pediría permiso y no se le da.
    if (req.url !== '/health' && req.headers['x-polylive-bridge'] !== '1') {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'GET' && req.url === '/next') {
      lastSeen = Date.now();
      res.pollTimer = setTimeout(() => {
        const i = waiters.indexOf(res);
        if (i >= 0) waiters.splice(i, 1);
        if (!res.writableEnded) res.writeHead(204).end();
      }, POLL_MS);
      req.on('close', () => {
        const i = waiters.indexOf(res);
        if (i >= 0) waiters.splice(i, 1);
      });
      waiters.push(res);
      dispatch();
      return;
    }
    if (req.method === 'POST' && req.url === '/result') {
      lastSeen = Date.now();
      const body = await readBody(req);
      const p = pending.get(String(body.id));
      if (p) {
        clearTimeout(p.timer);
        pending.delete(String(body.id));
        p.resolve(body);
      }
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST' && req.url === '/call') {
      const body = await readBody(req);
      const out = await call(body.cmd, body.args);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      const connected = Date.now() - lastSeen < POLL_MS + 5000;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ connected, queued: queue.length }));
      return;
    }
    res.writeHead(404).end();
  } catch (e) {
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: String(e) }));
  }
});

/** Si ya hay un puente escuchando, este proceso le reenvía las llamadas (modo MCP). */
let forward = null;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && MCP) {
    log(`el puerto ${PORT} ya tiene un puente: se le reenvían las llamadas`);
    forward = async (cmd, args) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/call`, { method: 'POST', headers: { 'x-polylive-bridge': '1' }, body: JSON.stringify({ cmd, args }) });
      return r.json();
    };
    return;
  }
  log(String(e));
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => log(`escuchando en http://127.0.0.1:${PORT}`));

// --- MCP por stdio (JSON-RPC 2.0, un mensaje por línea) ----------------------

const TOOL = {
  name: 'polylive',
  description:
    'Controla la app PolyLive abierta en la tableta (dev client). `cmd` es el comando y `args` sus argumentos. ' +
    'Empieza con cmd "help" para ver la lista. Los principales: projects, open {project, space}, levels, ' +
    'setLevels, objects, ops {list:[...]} (wall, door, window, opening, column, floor, void, vertical, station, ' +
    'props, delete, split), undo, redo, exportIfc.',
  inputSchema: {
    type: 'object',
    properties: { cmd: { type: 'string' }, args: { type: 'object' } },
    required: ['cmd'],
  },
};

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function onMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'polylive-bridge', version: '1.0.0' },
      },
    });
    return;
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
    return;
  }
  if (method === 'tools/call') {
    const { cmd, args } = params?.arguments ?? {};
    const out = forward ? await forward(cmd, args) : await call(cmd, args);
    send({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: JSON.stringify(out.ok ? out.result : { error: out.error }, null, 1) }], isError: !out.ok },
    });
    return;
  }
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }
  // Notificaciones (sin id): no llevan respuesta.
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método desconocido: ${method}` } });
}

if (MCP) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        void onMessage(JSON.parse(line));
      } catch (e) {
        log('mensaje inválido', String(e));
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
