---
name: catalogo-herramientas
description: Catálogo declarativo del FAB +, filtros, capas y herramientas de esquina; estado de cada herramienta.
type: aplicación
depends-on: "[[modos-de-trabajo]]"
mentioned-in: "[[MOC-PolyLive]], [[estado-y-capitulos]], [[EditorController]]"
tags: #aplicación #herramientas #catálogo
---

# Catálogo de herramientas

Código: `src/application/workspace/catalog.ts` · Tests: `test/application/workspace.test.ts`
Informe completo con estado por herramienta: `docs/18-INFORME-HERRAMIENTAS.md`.

## Principio

Una herramienta está **habilitada si y solo si tiene `binding`** (`isToolEnabled`):

| `binding.kind` | Lo atiende |
|---|---|
| `plan` | [[EditorController]] (`EditorTool`) |
| `elevation` | [[ElevationEditor]] (tipo de vano) |
| `topo` | `useTopography` (mojón, punto GPS, coordenada) |

Sin binding: visible y deshabilitada ("próximamente").

## Estado (2026-10-01)

- FAB +: 12 funcionan, 1 parcial (medición: manual sí, láser BLE sin interfaz), 39 esperan su fase.
- Herramientas de esquina: zoom, snap a nodo y ángulo, tema, líneas y puntos funcionan.
- **Incoherencias abiertas** (se ven activas, no hacen nada): snap a vértice y punto medio, rotación de
  la cuadrícula, escala acotada/anotativa, capas Topografía/Coordinación, filtros de mapa y cuadrícula de
  coordenadas, vigas en alzado. Plan: implementar los snaps y deshabilitar el resto.
