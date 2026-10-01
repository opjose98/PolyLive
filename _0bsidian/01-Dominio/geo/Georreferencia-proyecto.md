---
name: Georreferencia-proyecto
description: Amarre del proyecto a coordenadas reales (Helmert 2D) con ubicación por espacio. El modelo sigue siendo local.
type: dominio
depends-on: "[[CRS-MAGNA-SIRGAS]], [[transformaciones-coordenadas]], [[sistema-coordenadas-6-capas]]"
mentioned-in: "[[TopographyService]], [[Mojones-biblioteca]], [[MOC-PolyLive]], [[modos-de-trabajo]]"
tags: #dominio #topografía #georreferencia #M2
---

# Georreferencia del proyecto

Código: `src/domain/geo/georeference.ts` · Tests: `test/geo/georeference.test.ts`
Reemplaza a [[SiteCoordinateSystem]] (por sede, eliminado en la [[auditoria-post-M2]]).

## Idea central

El modelo **siempre** se guarda en coordenadas locales desde el 0,0,0 del dibujo. Las reales se
**calculan**: cambiar el amarre recalcula todos los espacios sin tocar un muro.

```
espacio (modelo, Y abajo) ──SpacePlacement──▶ proyecto (local, Y arriba) ──Georeference──▶ plano CRS (E, N)
```

## Transformación (Helmert 2D, 4 parámetros)

```
E = E0 + s·( x·cosθ + y·sinθ )
N = N0 + s·(−x·sinθ + y·cosθ )
```

- θ = azimut (horario desde el norte de cuadrícula) del eje +Y local.
- s = 1 salvo ajuste por mojones con escala libre.
- Cota real = `z0` + Z local.
- `SpacePlacement {x, y, rotation}`: ubica cada espacio dentro del proyecto (identidad por defecto).

## Métodos de amarre (`method`)

| Método | Entrada | Función |
|---|---|---|
| `origin` | coordenadas del 0,0 + azimut | `amarreByPointAndAzimuth` |
| `gps` | punto tocado + GPS promediado + azimut | ídem, ver [[GPS-promediado]] |
| `control` | ≥2 [[Mojones-biblioteca]] con coordenadas y posición | `fitControlPoints` (mínimos cuadrados, residuales, RMSE) |
| `none` | — | solo locales |

## Norte

`northFromLocalY(geo, espacio)` = −(θ + giro del espacio): lo que dibuja la aguja de los ejes.
`northUpViewRotation` es el giro de la vista que deja el norte arriba (enganche del gesto de giro).

## Persistencia

Tabla `project_georeference` (JSON por proyecto) en `GeoStore`.
