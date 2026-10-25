---
name: Puente-de-control
description: Control directo de la app desde el PC (dev client): comandos HTTP/MCP con los mismos casos de uso que la pantalla.
type: aplicación
depends-on: "[[SplitWallUseCase]], [[Suelos-libres-y-vacios]], [[Cortes-y-alzados-de-columna]]"
mentioned-in: "docs/26 § 11"
tags: #desarrollo #mcp #levantamiento
---

# Puente de control

Para levantar planos por comandos y no a toques de pantalla. Solo en desarrollo (`__DEV__`).

- PC: `node app-bim-typescript/scripts/bridge/polylive-bridge.mjs` (HTTP en 127.0.0.1:8765; con `--mcp`, además
  servidor MCP por stdio — registrado en `.mcp.json`). Sin dependencias.
- Tableta: dev client `.qa` + `adb reverse tcp:8765 tcp:8765`. La app pide comandos por long-poll y responde.
- Comandos (`help` los lista): `projects`, `createProject`, `createSpace` (otro bloque o piso de la sede), `open`, `levels`, `setLevels`, `objects`, `ops` (wall,
  door, window, opening, sill, column, floor, void, vertical, station, props, delete, split, merge, section, zone),
  `undo`, `redo`, `exportIfc`, `section`, `columnView`, `ui` (fit, select, elevation, column, section, close, tool,
  level — el nivel activo: los recintos se detectan en él).
- Todo pasa por los casos de uso (validación, deshacer, nivel y fase de nacimiento): lo creado por el puente es igual
  a lo dibujado a mano. Los niveles se nombran por nombre.
- Reglas que muerden: el primer nivel de `createProject` es la base y vale 0 (un nivel bajo el piso va después, con
  cota negativa); en un muro, `a`/`b` (un extremo) mandan sobre `v` (los dos) — H-85; `ops` no es atómico: si falla
  la operación n, las anteriores quedan hechas.
- Informe de uso con un agente (Claude) y de las 15 sedes levantadas así: docs/27.

Código: `application/bridge/bridgeCommands.ts`, `infrastructure/bridge/devBridge.ts`. Test:
`test/bridge/bridgeCommands.test.ts`.
