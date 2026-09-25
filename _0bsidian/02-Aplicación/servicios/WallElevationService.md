---
name: WallElevationService
description: Edición de la elevación de un muro — CSL, validación de huecos y sincronización con la planta.
type: aplicación
depends-on: "[[WallElevation-MEM]], [[Wall-especificacion]], [[CommandStack]]"
mentioned-in: "[[DXF-R2000]], [[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]]"
tags: #aplicación #elevacion #MEM #portado-de-levon
---

# WallElevationService

Portado de `wall_csl_service.dart` + `edit_wall_elevation_use_case.dart` de LevON.

## Responsabilidades

1. Transformar entre el sistema local del muro ([[WallElevation-MEM]], CSL) y la pantalla
2. Validar los huecos contra el muro y entre sí
3. CRUD de huecos y niveles, persistiendo en `wall_elevations`
4. Mantener sincronizados los huecos con los vanos BIM que la planta y el exportador IFC ya usan

## El eje Y SE INVIERTE

En CSL la altura crece hacia arriba; en pantalla los píxeles crecen hacia abajo.

Sin esta inversión la elevación saldría **del revés, con el suelo arriba**. En la vista de planta
esto no se nota porque el usuario dibuja sobre la pantalla y el resultado es autoconsistente; aquí
sí se notaría: un muro tiene un arriba y un abajo que no son opinables.

```typescript
cslToScreen({x, y}) → { x: x*escala + offsetX,  y: offsetY − y*escala }
```

`screenToCsl` es su inversa exacta (verificado con round-trip en los tests).

## Severidades de validación

| Severidad | Casos | Comportamiento |
|---|---|---|
| **error** | dimensiones imposibles; dos **vanos** (puerta/ventana) solapados | se rechaza |
| **warning** | el hueco sobresale del muro; un hueco **genérico** solapa con algo | se acepta y se avisa |

**Por qué un hueco genérico solapado es solo un aviso:** un nicho dentro de un paño mayor existe en
obra. Bloquearlo obligaría a no dibujarlo.

**Por qué dos vanos solapados son un error:** eso no se puede construir y no se puede exportar a IFC.

El techo se compara **interpolado en el centro del hueco**, no contra la coronación: en un muro con
culata, comparar solo contra la coronación dejaría pasar un hueco que sobresale por el extremo bajo.

## Snaps de elevación

- `snapXSmart` — extremos del muro, su centro, y los bordes y centros de los huecos ya colocados
- `snapYSmart` — suelo, coronación, umbrales y dinteles existentes

Ambos **excluyen el propio hueco** al ajustarlo: si no, quedaría clavado a su propia posición y no
se podría mover.

> Alinear una ventana con otra a ojo, con el dedo, sobre una pantalla de 6 pulgadas, no es viable.
> El snap es lo que hace usable la colocación.

## Sincronización elevación → planta

```
hueco tipo 'door'    → crea/actualiza un Door en la planta
hueco tipo 'window'  → crea/actualiza un Window
hueco tipo 'opening' → NO crea vano; si tenía uno, lo borra
```

Fabricar un vano para un hueco genérico produciría un símbolo de puerta o ventana en planta que no
corresponde a nada.

Cambiar el tipo entre puerta y ventana **borra el vano anterior y crea otro**: mutar el
`object_type` de una fila sería reescribir su identidad.

## Coronación y `Wall.height`

Cambiar la coronación **sincroniza `Wall.height`**: las dos vistas tienen que contar lo mismo.

Si una culata supera la coronación, la coronación sube (es la altura máxima por contrato, y es lo
que espera IFC).

## Chain mode

`propagateCoronacion()` aplica la coronación a los muros que comparten un extremo. Es lo que permite
**coronar una planta entera de una vez** en lugar de muro a muro.

La adyacencia se calcula por coincidencia de extremos con tolerancia (5 cm por defecto), no por el
[[TopologyGraph]]: aquí basta con "se tocan", y construir el grafo entero para responder a eso sería
desproporcionado.

## Código

`src/application/elevation/WallElevationService.ts`

## Tests

`test/elevation/WallElevationService.test.ts` — 49 tests.
