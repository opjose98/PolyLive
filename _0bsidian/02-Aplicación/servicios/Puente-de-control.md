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
- Comandos (`help` los lista): `projects`, `open`, `levels`, `setLevels`, `objects`, `ops` (wall, door, window,
  opening, sill, column, floor, void, vertical, station, props, delete, split, merge), `undo`, `redo`, `exportIfc`,
  `section`, `columnView`, `ui` (fit, select, elevation, column, section, close, tool).
- Todo pasa por los casos de uso (validación, deshacer, nivel y fase de nacimiento): lo creado por el puente es igual
  a lo dibujado a mano. Los niveles se nombran por nombre.

Código: `application/bridge/bridgeCommands.ts`, `infrastructure/bridge/devBridge.ts`. Test:
`test/bridge/bridgeCommands.test.ts`.
