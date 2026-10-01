---
name: CRS-MAGNA-SIRGAS
description: Sistemas de coordenadas de Colombia (Origen Nacional, 5 Gauss-Krüger, geográficas) con proj4 embebido.
type: dominio
depends-on: ""
mentioned-in: "[[Georreferencia-proyecto]], [[TopographyService]], [[Mojones-biblioteca]]"
tags: #dominio #topografía #crs #M2
---

# Sistemas de coordenadas (MAGNA-SIRGAS)

Código: `src/domain/geo/crs.ts` · Tests: `test/geo/georeference.test.ts`

| EPSG | Nombre | Uso |
|---|---|---|
| 9377 | Origen Nacional (CTM12) | Por defecto; el que exige el IGAC |
| 3116 / 3117 / 3118 / 3115 / 3114 | Gauss-Krüger Bogotá / Este / Este-Este / Oeste / Oeste-Oeste | Orígenes clásicos |
| 4686 | Geográficas | Se calcula en 9377 y solo se **muestra** en grados (`workingCrs`) |

- Definiciones proj4 **embebidas**: funciona sin red, en obra.
- `suggestGaussKruger(lon)`: origen de meridiano más cercano (botón "Sugerir con el GPS").
- `meridianConvergence`: ángulo norte de cuadrícula ↔ norte geográfico, calculado con la propia proyección.
- Formato: Norte primero, luego Este; `2.070.001,47` (es-CO). Ver `application/geo/coordinateText.ts`.
