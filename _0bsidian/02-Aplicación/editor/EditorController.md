---
name: EditorController
description: Controlador puro de la planta — herramientas, selección, arrastre, trazo, alcance por nivel/fase, deshacer.
type: aplicación
depends-on: "[[SelectionService]], [[CommandStack]], [[alcance-nivel-fase]], [[Restricciones-verticales]], [[Canvas2D-interacción]]"
mentioned-in: "[[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]], [[capa-viva-y-camara]], [[ElevationEditor]]"
tags: #aplicación #editor #core
---

# EditorController — el cerebro de la planta

Código: `src/application/editor/EditorController.ts` · Tests: `test/editor/EditorController.test.ts`
(reescrito post-F5/M2; la versión de la unificación con `persistVertices` y cierre manual de recintos ya no existe).

## Es lógica PURA

No importa React, Skia ni `react-native`. Recibe puntos de **pantalla**, decide qué caso de uso invocar
y publica un estado inmutable (`EditorState`) al que se suscribe la vista. Testeable en Node.

## Herramientas (`EditorTool`)

| Herramienta | Gesto | Resultado |
|---|---|---|
| `select` | toque / arrastre de handle | selecciona; mueve extremo o centro (un paso de deshacer) |
| `wall` | arrastre libre o punto a punto | `CreateWallUseCase` con snap a nodo y ángulo; cola de guardado |
| `door`, `window` | toque sobre un muro | vano centrado en el toque, ajustado para caber |
| `column` | toque | columna con su base/tope |
| `measure` | toque sobre un muro | destino de la medición (manual o BLE) |
| `photo` | toque | punto pendiente; la vista abre la cámara |

## Invariantes

- **Recintos derivados**: en cada recarga `DetectRoomsUseCase` detecta los cerrados y `syncRoomGeometry`
  mantiene `Room.geometry` igual al mayor (fuera del CommandStack: es dato derivado).
- **Arrastre en vivo**: `updateDrag` solo cambia `dragPreview`; `endDrag` persiste una vez.
- **Alcance**: `scopedObjects` / `walls` filtrados por nivel y fase, **en caché** por identidad de objetos
  y alcance (ver [[alcance-nivel-fase]]).
- **Errores**: `refresh()` recarga sin dejar promesas sin manejar; los fallos se publican en `notice`.
- **Historia única** con el alzado ([[ElevationEditor]]).

## Lo que NO hace

No conoce el modo de trabajo (la vista decide qué es editable: solo Levantamiento) ni la cámara durante un
gesto (el lienzo se la entrega al soltar, ver [[capa-viva-y-camara]]).
