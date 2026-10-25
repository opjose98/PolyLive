---
name: Cortes-y-alzados-de-columna
description: Lo que atraviesa un plano vertical — rayado en el alzado del muro, en el corte y en las caras de una columna.
type: aplicación
depends-on: "[[WallElevation-MEM]], [[Restricciones-verticales]], [[Suelos-libres-y-vacios]]"
mentioned-in: "docs/26 § 11"
tags: #alzado #corte #colision
---

# Cortes y alzados de columna

La app no bloquea choques entre elementos: los **dibuja**. `domain/section/sectionCut.ts` corta el modelo con un
plano vertical, descrito en planta por una línea y una banda (medio ancho):

- **Alzado de un muro**: banda = espesor del muro. Muros en T o en cruz, columnas y vigas de planta que entran en él
  salen rayados (un muro con un vano se corta arriba y abajo del hueco).
- **Corte** (herramienta de planta): banda casi nula sobre la línea trazada; también corta losas (con sus vacíos).
- **Columna**: sus cuatro caras, una al lado de otra, cada una con una banda fina por fuera (de 1 mm a 3 cm): un muro
  enrasado no cuenta, uno que la atraviesa sí.

`application/section/cutModel.ts` arma el modelo (perfiles con estaciones, huecos de vanos con antepecho, huellas de
columnas, losas, vigas). `projection.ts` produce las vistas; `ui/screens/ProjectionView.tsx` las dibuja con el mismo
lienzo del alzado. Test: `test/section/sectionCut.test.ts`, `test/elevation/ElevationEditor.test.ts`,
`test/bridge/bridgeCommands.test.ts`.
