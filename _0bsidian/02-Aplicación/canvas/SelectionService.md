---
name: SelectionService
description: Hit-testing — qué objeto BIM hay bajo un punto del canvas. Portado de LevON.
type: aplicación
depends-on: "[[Canvas2D-interacción]], [[tipos-geometricos]]"
mentioned-in: "[[EditorController]], [[trazabilidad-nota-codigo-test]]"
tags: #aplicación #canvas #portado-de-levon
---

# SelectionService — Hit-testing

## Por qué existe

Sin hit-testing, el canvas **solo sabe CREAR**. Todo lo que requiere un objeto ya existente —mover,
borrar, editar propiedades, medir un muro, abrir su elevación— era inalcanzable desde la UI aunque
el UseCase correspondiente existiera desde el principio.

## Es lógica pura

Recibe coordenadas **mundo** (metros) y listas de objetos. No sabe nada de React, de Skia ni de
píxeles. La conversión pantalla→mundo es de `CanvasManager`, y la tolerancia táctil se le pasa ya
convertida a metros (`touchToleranceMeters(px, escala)`).

## Orden de prioridad

```
vano → muro → columna → recinto
```

**Los vanos se prueban ANTES que los muros.** Un vano vive literalmente sobre el eje de su muro
padre: con el orden de LevON (`Wall > Column > Room`), una puerta **nunca podría seleccionarse** —
el muro se comería siempre el toque.

Los recintos van al final porque su área cubre a todos los demás.

## Handles de manipulación

| Objeto | Handles |
|---|---|
| Muro | `start`, `end`, `center` |
| Columna | `center` |
| Vano | *ninguno* |
| Recinto | *ninguno* |

Un vano **no se arrastra**: se reposiciona editando su `offsetAlongWall` en el panel de propiedades,
porque su posición es relativa al muro y no una coordenada libre.

La tolerancia de los handles se amplía un 50% respecto a la del hit-test de objetos: se dibujan
pequeños (7 px) pero tienen que poder agarrarse con el dedo, y tienen prioridad sobre el objeto que
los posee (si no, arrastrar un extremo movería el muro entero).

## Snap a nodos

`findNearestNode()` busca el extremo de muro más cercano. Es lo que permite que un trazo nuevo
"pegue" al final de uno anterior y que el [[TopologyGraph]] detecte el recinto como cerrado.

Sin esto, dos vértices a 2 mm de distancia son **dos nodos distintos** y el recinto nunca cierra —
es la "fuga topológica" que LevON documenta como bug conocido.

## Geometría de vanos

`vanoWorldCenter()` deriva la posición mundo del centro de un vano desde su muro padre. La usan
tanto el hit-test como el renderizado en planta, así que vive aquí en vez de duplicarse en el
painter.

Devuelve `null` si el muro es degenerado: no existe una dirección a lo largo de la cual medir
`offsetAlongWall`.

## Casos que el servicio maneja explícitamente

- **Vano huérfano** (su muro fue borrado): no es seleccionable, y tampoco se dibuja
- **Recinto con menos de 3 vértices** (todavía en trazo): se ignora
- **Columna rectangular rotada**: el punto se lleva al marco local deshaciendo la rotación

## Código

`src/application/canvas/SelectionService.ts`

## Tests

`test/canvas/SelectionService.test.ts` — 24 tests.
