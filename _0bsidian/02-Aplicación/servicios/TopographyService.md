---
name: TopographyService
description: Amarres, mojones y coordenadas reales del modo Topografía (une dominio geo con GeoStore).
type: aplicación
depends-on: "[[Georreferencia-proyecto]], [[Mojones-biblioteca]], [[CRS-MAGNA-SIRGAS]], [[GPS-promediado]]"
mentioned-in: "[[modos-de-trabajo]], [[catalogo-herramientas]], [[trazabilidad-nota-codigo-test]]"
tags: #aplicación #topografía #M2
---

# TopographyService

Código: `src/application/geo/TopographyService.ts` · Tests: `test/geo/TopographyService.test.ts`
Texto de coordenadas: `application/geo/coordinateText.ts` (`test/geo/coordinateText.test.ts`).
UI: `ui/workspace/topo/` (`useTopography`, asistente, hojas, panel del drawer ⋮).

| Grupo | Métodos |
|---|---|
| Lectura | `getGeoreference`, `listBenchmarks`, `listLibrary`, `coordinatesOf`, `benchmarkCoordinates` |
| Amarre | `defineLocalOnly`, `defineByPoint`, `defineByGps`, `defineByControl`, `placeSpaceByControl`, `setGpsSeconds` |
| Mojones | `benchmarkFromTap`, `benchmarkFromReal`, `placeBenchmark`, `linkFromLibrary`, `unlinkBenchmark`, `renameBenchmark` |

Redefinir el amarre conserva las ubicaciones de los espacios. Ver `docs/15-TOPOGRAFIA.md`.
