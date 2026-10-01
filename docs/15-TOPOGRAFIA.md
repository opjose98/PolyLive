# 15 — Topografía (M2: núcleo)

> Estado: **implementado** en la rama `feat/ui-m2-topografia` (sobre `feat/ui-m1-modos`).
> Siguiente: M2b (mapa offline, cuadrícula de coordenadas, inverso/área/replanteo, CSV/KML, IFC georreferenciado).

## 1. Idea central

El modelo **siempre** se guarda en coordenadas locales desde el 0,0,0 del dibujo. Las coordenadas reales se
**calculan** con la georreferencia del proyecto, así que cambiar el amarre recalcula todos los espacios sin tocar
un solo muro.

```
espacio (modelo, Y abajo) ──ubicación del espacio──▶ proyecto (local, Y arriba) ──georreferencia──▶ plano CRS (E, N)
```

- **Georreferencia** (Helmert 2D, 4 parámetros), una por proyecto:
  `E = E0 + s(x·cosθ + y·sinθ)`, `N = N0 + s(−x·sinθ + y·cosθ)`. θ es el azimut (horario desde el norte de
  cuadrícula) del eje +Y local, y s = 1 salvo ajuste con escala libre. La cota real es `z0 + Z local`.
- **Ubicación del espacio** (`SpacePlacement`: x, y, giro antihorario): para proyectos con varios espacios
  dibujado cada uno desde su propio 0,0. Por defecto es la identidad.

## 2. Sistemas de coordenadas (`domain/geo/crs.ts`)

MAGNA-SIRGAS, con definiciones proj4 embebidas (funciona sin red):

| EPSG | Nombre |
|---|---|
| 9377 | Origen Nacional (CTM12) — el que exige hoy el IGAC; por defecto |
| 3116 / 3117 / 3118 / 3115 / 3114 | Gauss-Krüger Bogotá / Este / Este-Este / Oeste / Oeste-Oeste |
| 4686 | Geográficas (lat/long). Se calcula en el plano 9377 y solo se *muestra* en grados |

"Sugerir con el GPS" lee una posición y propone el origen Gauss-Krüger de meridiano más cercano.

## 3. Amarre: asistente de primera apertura (`TopographySetup`)

Se abre solo la primera vez que se entra al modo en un proyecto sin configurar; luego desde el drawer ⋮ o la
acción **Amarre** de la BPC.

1. **Sistema de coordenadas** (o "Solo locales por ahora": se guarda el sistema con método `none`).
2. **Método**, con azimut del eje Y y cota del Nivel 0:
   - **Origen conocido** — coordenadas (planas o lat/long) del 0,0 del dibujo.
   - **GPS** — se toca dónde está parado el operador y se promedia el GPS (ver §5).
   - **Mojones** — ≥2 mojones con coordenadas reales colocados en el dibujo; ajuste por mínimos cuadrados con
     residuales por punto y RMSE. "Escala 1" (cinta/láser) o escala libre. Con el proyecto ya amarrado,
     **Ubicar solo este espacio** calcula la `SpacePlacement` del espacio con sus propios mojones.

Lógica: `application/geo/TopographyService.ts` (`defineLocalOnly`, `defineByPoint`, `defineByGps`,
`defineByControl`, `placeSpaceByControl`). Persistencia: `infrastructure/sqlite/GeoStore.ts`, tabla
`project_georeference`.

## 4. Mojones (`domain/geo/benchmark.ts`)

Un mojón tiene coordenadas **reales** (lat/long MAGNA-SIRGAS + cota) y, en cada proyecto, una **posición en el
dibujo** de un espacio. Con ambas es **punto de control** (triángulo verde relleno); si le falta una, solo contorno.
Las reales se guardan en lat/long para que sirvan en cualquier proyecto aunque use otro origen.

Se crean desde FAB + → **Puntos**:

| Herramienta | Flujo |
|---|---|
| **Mojón** | Tocar la planta (se pega a los vértices); nombre y descripción. Reales = las del amarre (si hay) |
| **Punto GPS** | Celular quieto N s, promedio; nombre. Si hay amarre, se coloca solo en el dibujo |
| **Coordenada** | Digitar N/E (plano del proyecto) o lat/long y cota. Si hay amarre, se coloca solo |

**Biblioteca común**: tablas `benchmarks` (biblioteca) y `project_benchmarks` (enlace + posición). La tabla de
coordenadas muestra los de otros proyectos para **agregarlos**; **Quitar** desenlaza sin borrar de la biblioteca;
**Colocar** pide tocar dónde está el mojón en el dibujo (así un mojón digitado se vuelve punto de control).

## 5. GPS promediado (`native/location/GpsAverager.ts`, `domain/geo/gpsAverage.ts`)

`watchPositionAsync` (BestForNavigation, 1 s) durante los segundos configurados (30 por defecto, drawer ⋮ →
"Promedio del GPS", 5–600 s). Promedio ponderado por 1/precisión², con dispersión y precisión media en vivo
(`GpsCaptureSheet`, anillo de progreso). Por encima de **5 m** avisa "impreciso para amarrar". Se puede terminar
antes o cancelar. El GPS del celular da 3–15 m: sirve para ubicar, no para replantear; el amarre recomendado es
por mojones.

## 6. Ver coordenadas

- **Rótulos en el lienzo** (filtros de Topografía): *Vértices* (puntos de los muros), *Mojones*, *Rótulos de
  coordenadas* (N/E junto a cada punto mostrado) y *Norte*. Sin amarre se rotulan x/y locales (Y arriba).
- **Tocar** un vértice → sonda: BPC "Vértice N … · E …" y rótulo en el punto. Tocar un mojón lo selecciona.
  Tocar un muro muestra la coordenada de su inicio.
- **Tabla de coordenadas** (BPC → Coordenadas, o drawer ⋮): mojones con N/E/cota o lat/long en DMS, origen
  (tocado/digitado/GPS) y precisión; biblioteca; vértices del espacio.
- Convención colombiana: **Norte primero, luego Este**. Formato `2.070.001,47` (es-CO).

Texto: `application/geo/coordinateText.ts` (`coordinateRows`, `coordinateLabel`, `amarreSummary`).

## 7. Norte y giro

Con amarre: aguja **N** del gizmo = `northFromLocalY(geo, espacio)` (también en Levantamiento) y enganche del giro
de dos dedos en "norte arriba" (`northUpViewRotation`). Ver [14 §4](14-MODOS-DE-TRABAJO.md).

## 8. Integración en la planta

`ui/workspace/topo/useTopography.ts` concentra estado y flujos; `SurveyScreen` solo:

- le pasa los toques (`topo.handleTap` primero; si no lo consume, selección normal);
- pinta `planBenchmarks` y `coordLabels` (`planRenderer`: `drawBenchmarks`, `drawCoordLabels`);
- usa su contexto en la BPC (título "Topografía" + resumen del amarre; acciones Coordenadas / Amarre);
- monta `<TopographySheets>` (asistente, formulario de mojón, GPS, tabla) y `<TopographyPanel>` en el drawer;
- Atrás de Android cierra primero la hoja o flujo de Topografía abierto (`topo.back`).

Topografía **no edita muros** (sin arrastre ni trazo; no abre alzados).

## 9. Legado (eliminado)

El Spike #7 (`SurveyControlPoint`, `SiteCoordinateSystem`, tablas `sites` y `survey_control_points`, por sede) y
su pantalla `SurveyControlScreen` se eliminaron en la auditoría post-M2 ([16](16-AUDITORIA-POST-M2.md)): la
topografía vive solo en `domain/geo`. `OperatorId` pasó a `domain/objects/operator.ts` y `GpsCoordinates` a
`domain/geo/gpsAverage.ts`. Las bases instaladas conservan esas tablas vacías; nada las lee.

## 10. Pruebas

- `test/geo/georeference.test.ts` — orígenes CRS, ida y vuelta, sugerencia, convergencia, DMS, transformaciones,
  ajuste por mojones, norte, promedio GPS.
- `test/geo/TopographyService.test.ts`, `test/infrastructure/GeoStore.test.ts`, `test/geo/coordinateText.test.ts`.
- Teléfono (2026-09-30): asistente → solo locales → rótulos x/y; mojón tocado sobre vértice; amarre por origen
  (N 2.070.000, E 4.880.000, az. 30°): vértice (−0,96; −1,22) → N 2.069.999,42 / E 4.879.998,56, igual al
  cálculo a mano; aguja N a −30°; sonda en BPC; tabla; sugerencia por GPS.
- Pendiente de probar a mano: giro de dos dedos con enganche al norte (adb no simula dos dedos) y el promedio GPS
  completo al aire libre.
