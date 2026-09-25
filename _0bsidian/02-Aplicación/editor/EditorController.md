---
name: EditorController
description: Cerebro del editor de planta — herramientas, selección, snaps y persistencia del trazo.
type: aplicación
depends-on: "[[SelectionService]], [[CommandStack]], [[SurveyInteractionMode]], [[Canvas2D-interacción]]"
mentioned-in: "[[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]], [[bugs-corregidos-unificacion]]"
tags: #aplicación #editor #core
---

# EditorController — El cerebro del editor de planta

## Por qué existe

`SurveyScreen.tsx` concentraba estado de React, llamadas a UseCases, transformaciones de coordenadas
y dibujo en un solo componente, y **solo sabía hacer una cosa**: encadenar muros con toques.

Todo lo demás —seleccionar, mover, borrar, editar propiedades, crear vanos y columnas, detectar
recintos, persistir una medición— existía en `application/` **sin ninguna ruta desde la UI**. De 21
casos de uso implementados, 11 eran inalcanzables. Ver [[bugs-corregidos-unificacion]].

Este controlador es esa ruta.

## Es lógica PURA

No importa React, ni Skia, ni `react-native`. Recibe puntos en coordenadas de **pantalla**, los
traduce, decide qué UseCase invocar, y publica un estado inmutable que la vista renderiza.

Eso lo hace testeable en Node sin montar un árbol de componentes — que es lo que permite que el
editor tenga tests de verdad y no solo "renderiza sin romperse".

## Máquina de herramientas

Ver [[SurveyInteractionMode]].

| Herramienta | Qué hace un toque |
|---|---|
| `select` | selecciona el objeto tocado; arrastrar un handle lo mueve |
| `wall` | encadena un muro desde el vértice anterior |
| `door` | inserta una puerta en el muro tocado |
| `window` | inserta una ventana en el muro tocado |
| `column` | coloca una columna libre |
| `measure` | elige el muro destino de la próxima medición |
| `photo` | fija el punto de captura; la vista abre la cámara |

## Invariantes que el controlador sostiene

### El trazo, el borrador y `Room.geometry` siempre coinciden

`persistVertices()` es la **única ruta de escritura** del trazo. Los tres tienen que coincidir
porque `CloseRoomUseCase` triangula `Room.geometry`, **no los muros**: si divergen, el área
calculada no corresponde a lo dibujado en pantalla.

### El futuro deshecho se descarta al escribir sobre él

`undoneVertices` es el espejo del redo del CommandStack. Sin esto, un Redo restauraba el muro pero
no el vértice, y `vertices` quedaba corto frente a los muros realmente persistidos.

### Borrar o reescribir un muro recalcula el trazo

`syncVerticesToWalls()` reconstruye la polilínea desde los muros vivos. Sin ello, "Cerrar Recinto"
triangularía un polígono fantasma.

### Un micro-arrastre no es una edición

Por debajo de 1e-4 m, `endDrag` no hace nada: un temblor de pulso generaría un comando en la pila
que el operador no pidió.

### Un doble toque sobre el último vértice se ignora

Con el snap a nodos activo, tocar junto al último vértice arrastra el toque exactamente encima de
él y pediría un muro de longitud cero. `CreateWallUseCase` lo rechaza con razón, pero el operador
vería un error rojo por un doble toque accidental — de las cosas más fáciles de hacer con guantes
en obra. Se ignora en silencio, con un aviso informativo.

## Orden de los snaps

Fijado por [[Canvas2D-interacción]]:

1. **Snap a nodo existente** — gana siempre, porque es lo que cierra la topología y evita las
   "fugas de recinto" por dos nodos casi coincidentes (bug conocido documentado en LevON)
2. **Snap angular** respecto al vértice anterior, solo si no hay nodo cerca

## Zoom con punto focal compensado

```
offset' = focal − (focal − offset) × (escala' / escala)
```

El punto mundo bajo el dedo se queda donde estaba. Sin esta compensación, hacer pinch desplaza el
dibujo bajo los dedos y se siente roto — es el fallo que LevON tuvo que arreglar dos veces.

## Detección de recintos: sugerencias, no hechos

`detectRooms()` devuelve **sugerencias** que la vista lista y dibuja en el color de selección, solo
con contorno, para que no se confundan con un recinto ya cerrado. Cerrar de verdad sigue siendo
`CloseRoomUseCase`; `adoptSuggestion()` solo adopta el polígono como trazo activo.

## Aviso de encuentro agudo

Tras crear un muro, `warnOnAcuteMeeting()` usa [[MiterHandler]] contra los muros que ya tocaba. Por
debajo de ~10°, el encuentro no se puede ejecutar limpio en obra. Es un **aviso, nunca un bloqueo**:
hay edificios con esquinas así, y la app está para levantar lo que existe.

## Medición: qué cambió

El flujo anterior llamaba a `HuepaDeviceManager.measure()` y el resultado **solo se pintaba**.
Nada llegaba nunca a la tabla `measurements`.

Ahora la ráfaga de 7 muestras se pasa a `CaptureMeasurementUseCase` mediante el campo `samples`
(ver [[CaptureMeasurementUseCase]]), que la persiste. Y `applyMeasurementToWall()` corrige la
longitud del muro conservando su dirección — que es la razón de medir con láser en campo.

> Sin el campo `samples`, el UseCase pediría 7 ráfagas de 7: **49 disparos del láser por medición**,
> unos 20 segundos con el operador apuntando al muro, y un promedio de promedios que ya no es el que
> el método IQR pretende calcular.

## Código

`src/application/editor/EditorController.ts`

## Tests

`test/editor/EditorController.test.ts` — 56 tests contra SQLite real.
