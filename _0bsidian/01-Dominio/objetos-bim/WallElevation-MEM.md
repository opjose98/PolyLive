---
name: WallElevation-MEM
description: Motor de Elevación de Muros — vanos en CSL, culatas y cuantificación neta. Portado de LevON.
type: dominio
depends-on: "[[Wall-especificacion]], [[Door-especificacion]], [[Window-especificacion]]"
mentioned-in: "[[WallElevationService]], [[DXF-R2000]], [[trazabilidad-nota-codigo-test]]"
tags: #objetos-bim #elevacion #MEM #portado-de-levon
---

# WallElevation — Motor de Elevación de Muros (MEM)

## Qué resuelve

Hasta ahora un muro de PolyLive solo tenía `height`. Eso no basta para levantar un edificio real:

- un muro tiene **vanos a alturas concretas** (una ventana a 0,90 m de antepecho)
- puede tener una **culata** (altura variable de un extremo a otro, bajo cubierta inclinada)
- lo que se factura y se presupuesta es su **superficie NETA** — la bruta menos los huecos

Sin elevación, la app solo produce una planta.

## Sistema de coordenadas local del muro (CSL)

```
X = distancia desde el inicio del muro, en metros
Y = altura desde el suelo, en metros
```

Los vanos se guardan **siempre en CSL**, nunca en coordenadas mundo. Es lo que permite mover o girar
un muro sin recalcular nada de su elevación: una puerta a 1,2 m del arranque sigue a 1,2 m del
arranque.

## Modelo

```typescript
interface WallOpening {
  id: WallOpeningId
  type: 'door' | 'window' | 'opening'   // mapea a IfcDoor / IfcWindow / IfcOpeningElement
  xOffset: number       // CSL X del borde izquierdo
  width: number
  sillHeight: number    // antepecho. 0 en puertas, ~0.90 en ventanas
  height: number        // dintel = sillHeight + height
  isFlipped: boolean    // solo puertas: invierte el sentido de apertura
  vanoId?: string       // el Door/Window que proyecta en PLANTA
}

interface VerticalLevels {
  base: number          // suelo, siempre 0 en esta versión
  coronacion: number    // altura MÁXIMA — se sincroniza con Wall.height
  leftHeight?: number   // culata: altura en CSL X=0
  rightHeight?: number  // culata: altura en CSL X=longitud
}
```

## Relación con [[Door-especificacion]] y [[Window-especificacion]]

**LevON eliminó `Door` y `Window` y los consolidó dentro de `WallOpening`. PolyLive NO hace esa
eliminación**, y la decisión está asumida:

- `Door` y `Window` son objetos BIM persistidos, exportados a IFC y referenciados por el
  CommandStack, la validación y sus tests. Eliminarlos rompería la mitad del sistema.
- `WallOpening` es la **fuente de verdad de la ELEVACIÓN**.
- Cada hueco de tipo puerta o ventana **proyecta** un `Door`/`Window` en la **PLANTA**.
- Un hueco genérico (`opening`) no proyecta nada: en planta no se dibuja como vano.

La sincronización es **unidireccional** (elevación → planta) a propósito: dos direcciones exigirían
resolver conflictos, y no hay ninguna regla que diga quién gana si el mismo hueco se mueve a la vez
en las dos vistas.

Consecuencias operativas:

- cambiar un hueco de puerta a ventana **reemplaza** el vano en planta (el `object_type` de una fila
  es su identidad; mutarlo sería reescribirla)
- cambiar un hueco a genérico **borra** su vano sin crear otro
- eliminar un hueco elimina su vano

## Cuantificación

```
bruta (rectangular) = longitud × coronación
bruta (con culata)  = longitud × (hIzq + hDer) / 2      [área del trapecio]
huecos              = ÁREA DE LA UNIÓN de los rectángulos de hueco
neta                = max(0, bruta − huecos)
```

### Dos detalles que importan en un presupuesto

**Los huecos se miden como UNIÓN, no como suma.** Dos huecos solapados (una puerta y un hueco
genérico que la engloba) descontarían dos veces la zona común y el neto saldría más bajo de lo real.
Se calcula por compresión de coordenadas 2D: O(n²) en el número de huecos, de sobra para los menos
de veinte que tiene un muro real, y exacto.

**Cada hueco se recorta contra el techo INTERPOLADO en su centro**, no contra la coronación. En un
muro con culata, un hueco de 3 m junto al extremo de 2 m no puede descontar 3 m de muro: ahí el muro
solo mide 2 m.

## Invariantes

- `coronacion > 0`
- `coronacion` es siempre la altura MÁXIMA: si una culata la supera, la coronación sube. Dejarla por
  debajo daría un muro cuya altura declarada es menor que su punto más alto.
- Las dimensiones de los huecos NO se validan en el constructor: un hueco que se está arrastrando
  pasa por estados inválidos de forma transitoria, y lanzar ahí impediría representarlos. La
  validación vive en [[WallElevationService]].

## Persistencia

Tabla `wall_elevations`, una fila por muro con elevación definida. Aditiva.
`levels_json` y `openings_json` guardan niveles y huecos en CSL.

Un muro **sin fila** devuelve la elevación por defecto derivada de `Wall.height`, **sin
persistirla**: abrir la vista de elevación para mirar no debe escribir nada en la base.

La deserialización **normaliza** los campos ausentes: una fila escrita por una versión anterior
puede no traer `isFlipped`, y un `undefined` ahí se propagaría a la UI y al cálculo de superficies
como un valor silenciosamente distinto de `false`.

## Código

- `src/domain/objects/wall-elevation.ts`
- `src/application/elevation/WallElevationService.ts` — ver [[WallElevationService]]
- `src/ui/screens/WallElevationScreen.tsx`, `src/ui/canvas/elevationRenderer.ts`

## Tests

`test/elevation/WallElevationService.test.ts` — 49 tests.
