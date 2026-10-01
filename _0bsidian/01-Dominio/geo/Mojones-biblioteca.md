---
name: Mojones-biblioteca
description: Mojones con coordenadas reales y posición por proyecto; biblioteca común entre proyectos.
type: dominio
depends-on: "[[CRS-MAGNA-SIRGAS]], [[Georreferencia-proyecto]], [[GPS-promediado]]"
mentioned-in: "[[TopographyService]], [[catalogo-herramientas]], [[MOC-PolyLive]]"
tags: #dominio #topografía #mojones #M2
---

# Mojones y biblioteca

Código: `src/domain/geo/benchmark.ts`, `src/infrastructure/sqlite/GeoStore.ts`
Tests: `test/infrastructure/GeoStore.test.ts`, `test/geo/TopographyService.test.ts`
Reemplaza a [[SurveyControlPoint]] (por sede, eliminado).

## Modelo

- `Benchmark`: coordenadas **reales** en lat/long MAGNA-SIRGAS (independientes del plano elegido), cota,
  origen (`tap` / `typed` / `gps` / `import`), precisión.
- `ProjectBenchmark`: el enlace a un proyecto con su **posición en el dibujo** de un espacio.
- `isControlPoint` = tiene coordenadas reales **y** posición: sirve para amarrar (triángulo relleno).

## Tablas

`benchmarks` (biblioteca) y `project_benchmarks` (enlace + posición). Quitar un mojón de un proyecto no lo
borra de la biblioteca.

## Formas de crearlo (FAB + → Puntos)

| Herramienta | Posición | Coordenadas reales |
|---|---|---|
| Mojón (tocar) | exacta, con snap a nodo | calculadas por el amarre (si existe) |
| Punto GPS | colocado si hay amarre | GPS promediado ([[GPS-promediado]]) |
| Coordenada | colocado si hay amarre | digitadas (N/E o lat/long) |

Un mojón digitado se vuelve punto de control con **Colocar** (tabla de coordenadas).
