---
name: gestión-estado-Zustand
description: Dónde vive cada estado — workspaceStore (cromo), controladores (modelo), SQLite (verdad).
type: ui
depends-on: "[[EditorController]], [[ElevationEditor]]"
mentioned-in: "[[capa-viva-y-camara]], [[trazabilidad-nota-codigo-test]]"
tags: #estado #zustand #react
---

# Gestión de estado

> **Cambió respecto del diseño original.** El `AppState` con 4 slices (survey, ble, ui, control-points)
> se eliminó en la [[auditoria-post-M2]]: la pantalla lo escribía en cada render y nadie lo leía.

| Estado | Dónde | Notas |
|---|---|---|
| Datos (objetos, proyectos, niveles, topografía) | **SQLite** | Única fuente de verdad |
| Modelo de la planta en edición | `EditorController` (`subscribe`) | Puro, con tests |
| Alzado | `ElevationEditor` | Puro, con tests |
| Cromo: modo, herramienta, FAB, paneles, filtros, capas, tema, snaps, escala, selectores de rango | `state/workspaceStore.ts` (Zustand vanilla) | `useStore(workspaceStore, selector)` |
| Toasts | store propio en `primitives/Toast.tsx` | |
| Lo que cambia con el dedo (trazo, arrastre, snap) | **fuente viva** `ui/canvas/liveOverlay.ts` | Solo el lienzo se suscribe; ver [[capa-viva-y-camara]] |

## Reglas

- La pantalla se suscribe al editor con `sameStructure`: ignora los cambios que solo son "vivos".
- El modo y el tema **no se persisten** (siempre abre en Levantamiento, tema claro).
