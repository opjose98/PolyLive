---
name: SplitWallUseCase
description: Partir un muro recto en un punto (H-74) repartiendo vanos, alzado y mediciones, en un paso de deshacer.
type: aplicación
depends-on: "[[Wall-especificacion]], [[Restricciones-verticales]], [[WallElevation-MEM]], [[DeleteObjectUseCase]]"
mentioned-in: "docs/25 H-74, docs/26 § 5"
tags: #usecase #muro #culata
---

# SplitWallUseCase

## Para qué
Una culata con la cumbrera a media longitud no cabe en un muro (una altura por extremo). Partirlo en la cumbrera da
dos muros, cada uno con su trapecio, sin cambiar el modelo de datos. Sirve para cualquier muro recto.

## Reglas
- El punto se da en metros desde el arranque (A); cada tramo mide al menos 0,10 m (`MIN_SPLIT_PIECE`).
- El primer tramo **conserva el muro** (id, fotos, mediciones); el segundo es un muro nuevo con el espesor, material,
  portante, notas y propiedades (nivel, fase) del original.
- La restricción del punto de corte es la que deja el alzado igual (`extentAt`): niveles del arranque + desfase.
  En una culata, después se lleva el tope de ese punto a Cubierta en cada tramo.
- Cada puerta, ventana o hueco del alzado va al tramo donde cae su **centro**, con desfase desde el arranque de su
  tramo; si no cabe entero se arrima dentro y la app lo avisa. El antepecho viaja con él.
- Columnas con `embeddedInWallId` pasan al tramo nuevo si su proyección cae en él.
- Las mediciones eran del muro entero: el segundo tramo recibe una **copia** sin longitud aplicada (las diagonales
  de recinto no se copian).
- Deshacer devuelve todo de una vez: los vanos vuelven al muro antes de borrar el tramo nuevo (el borrado de muro
  arrastra en cascada a sus vanos).

## Código y test
`domain/objects/wall-split.ts`, `domain/objects/vertical.ts` (`extentAt`), `application/use-cases/SplitWallUseCase.ts`,
`application/commands/SplitWallCommand.ts`, `ui/workspace/SplitWallDialog.tsx` (botón «Partir» en la hoja del muro).
Test: `test/application/SplitWall.test.ts`.
