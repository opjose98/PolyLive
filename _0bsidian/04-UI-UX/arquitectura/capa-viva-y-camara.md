---
name: capa-viva-y-camara
description: Cómo el lienzo se mantiene fluido — cámara en el hilo UI, capa viva para trazo y arrastre, regrabado mínimo.
type: ui
depends-on: "[[Canvas2D-interacción]], [[presupuesto-frame]], [[EditorController]], [[ElevationEditor]]"
mentioned-in: "[[gestión-estado-Zustand]], [[uso-a-una-mano]], [[MOC-PolyLive]]"
tags: #canvas #rendimiento #skia #reanimated
---

# Capa viva y cámara

Código: `ui/canvas/PlanCanvas.tsx`, `ui/canvas/liveOverlay.ts`, `ui/canvas/ElevationCanvas.tsx`,
`native/canvas/SkiaCanvasAdapter.ts`. Contexto y mediciones: `docs/17-TEMA-FLUIDEZ-Y-DIBUJO.md`.

## Tres capas

1. **Planta** — un `Picture` grabado en coordenadas de **mundo**. Solo se regraba si cambian los objetos,
   la selección o la escala de grabado.
2. **Viva** — otro `Picture` con el muro en curso, el objeto arrastrado (con sus vanos y handles) y el
   anillo de snap. Se regraba con cada movimiento del dedo; es barata porque contiene solo eso.
3. **Cámara** — matriz (traslación, giro, escala) en shared values de reanimated, aplicada en el hilo UI.

## Reglas (aprendidas con lag real en el teléfono)

- **La cámara viaja a React una vez, al soltar.** Entregarla cada 50 ms re-renderizaba toda la pantalla a
  20 Hz y regrababa la planta en cada paso del pinch (parpadeo).
- Durante un pinch largo se regraba **solo si el zoom se alejó ×1,5** del grabado, y solo el lienzo se entera.
- La pantalla **no** recibe los cambios vivos (`sameStructure`); el lienzo lee la fuente viva con
  `useSyncExternalStore`.
- El objeto arrastrado se **oculta** de la planta mientras está en la capa viva (no se dibuja dos veces).
- En el alzado, el gesto mueve un `Group` en el hilo UI y entrega `applyViewDelta` al soltar; el
  `Picture` se graba más grande que la pantalla para que al panear no aparezcan bordes vacíos.
- El adaptador Skia no reconvierte el color en cada trazo (caché de colores y del estado del pincel).
- El toque no espera al doble toque (se reconocen en paralelo).
