---
name: modos-de-trabajo
description: Levantamiento, Topografía, Avance, Revisión — qué hace cada modo, qué edita y su color.
type: aplicación
depends-on: "[[catalogo-herramientas]]"
mentioned-in: "[[MOC-PolyLive]], [[sistema-de-diseño]], [[mapa-de-navegacion]], [[estado-y-capitulos]]"
tags: #aplicación #modos #M1
---

# Modos de trabajo

Código: `application/workspace/catalog.ts` (`WORK_MODES`, `categoriesFor`, `filtersFor`, `modeBlock`),
`state/workspaceStore.ts` (`workMode`), `ui/workspace/FabView.tsx`. Detalle: `docs/14-MODOS-DE-TRABAJO.md`.

| Modo | Color | Vistas | Edita el modelo |
|---|---|---|---|
| Levantamiento | ámbar | planta + alzado | **sí** (el único) |
| Topografía | verde | solo planta | no: mojones y coordenadas ([[TopographyService]]) |
| Avance | azul | planta (suelos) + alzado (caras) | no: su capa (M3) |
| Revisión | morado | planta + alzado | no: marcas (M4) |

- Siempre abre en Levantamiento.
- **Toda la interfaz toma el color del modo** (y el tono del tema): ver [[sistema-de-diseño]].
- Fuera de Levantamiento: sin panel de propiedades, sin píldoras de edición, sin handles ni arrastre, en
  planta y en alzado (corregido en la [[auditoria-post-M2]]).
