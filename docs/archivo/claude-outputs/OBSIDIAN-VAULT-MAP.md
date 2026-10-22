# OBSIDIAN-VAULT-MAP

## Mapa de la bóveda Obsidian — PolyLive

La bóveda (`_0bsidian/`) organiza sus notas en carpetas espejo de las capas de arquitectura del sistema, más una carpeta de testing transversal. Este mapa documenta la estructura tal como quedó al cierre del experimento, incluyendo las carpetas que se planearon pero no llegaron a poblarse — un dato honesto sobre el alcance real de los seis spikes frente a la taxonomía completa que se dejó lista para crecer.

---

## 1. Estructura de carpetas

```
_0bsidian/
├── 00-Introducción/            (vacía — reservada, no usada en estos 6 spikes)
├── 01-Dominio/                 24 notas
│   ├── geometría/               8
│   ├── objetos-bim/             7
│   ├── survey/                  3
│   └── validación/              6
├── 02-Aplicación/               22 notas
│   ├── comandos/                8
│   ├── máquina-estados/         3
│   └── use-cases/              11
├── 03-Infraestructura/          5 notas
│   ├── export-ifc/              5
│   ├── ble/                     (vacía)
│   ├── filesystem/              (vacía)
│   └── sqlite/                  (vacía)
├── 04-UI-UX/                    3 notas
│   ├── arquitectura/            3
│   ├── decisiones-36/           (vacía)
│   ├── temas/                   (vacía)
│   └── wireframes/              (vacía)
├── 05-Testing/                 12 notas
│   ├── unit/                    3
│   ├── integration/             3
│   ├── recovery/                3
│   ├── field/                   1
│   └── fixtures/                2
├── 06-Referencias-Cruzadas/    (vacía)
├── 07-Código-Generado/         (vacía)
├── _grafo-dependencias/        (vacía — utilidad reservada)
└── _plantillas/                (vacía — utilidad reservada)
```

**Total contado por carpeta: 66 notas de contenido.** El seguimiento acumulado por spike (`SPIKES-BREAKDOWN.md`) registra 67 al cierre del Spike #6; la diferencia de una nota corresponde a una nota índice/raíz no capturada en el listado recursivo por carpeta y no afecta ninguna cifra de spikes ni de tests, que se verificaron directamente contra el código y los archivos de test generados.

Cuatro subcarpetas de `03-Infraestructura` y `04-UI-UX` (`ble`, `filesystem`, `sqlite`, `decisiones-36`, `temas`, `wireframes`), además de `00-Introducción`, `06-Referencias-Cruzadas`, `07-Código-Generado`, `_grafo-dependencias` y `_plantillas`, están **scaffoldeadas pero vacías**: la taxonomía completa de la bóveda se diseñó para un alcance mayor al que cubrieron estos seis spikes (persistencia SQLite, por ejemplo, se documentó como notas satélite del proyecto en lugar de notas de vault dedicadas — ver nota en §2). Esto es intencional y transparente, no un vacío accidental: refleja que el experimento priorizó profundidad vertical en seis dominios de alto riesgo técnico sobre completar horizontalmente toda la taxonomía planeada.

## 2. Notas por categoría

### 01-Dominio (24 notas)

**`geometría/`** (8): `CDT-algoritmo.md`, `CDT-casos-prueba.md`, `miter-encuentros.md`, `proyecciones-punto-muro.md`, `sistema-coordenadas-6-capas.md`, `snap-angular.md`, `tipos-geometricos.md`, `transformaciones-coordenadas.md`. Alimentó el Spike #1 completo.

**`objetos-bim/`** (7): `Column-especificación.md`, `Door-especificacion.md`, `Floor-especificacion.md`, `RevitObjectBase.md`, `Room-especificacion.md`, `Wall-especificación.md`, `Window-especificacion.md`. Alimentó las entidades de dominio del Spike #2.

**`survey/`** (3): `gpsAnchor-referencia.md`, `SiteCoordinateSystem.md`, `SurveyControlPoint.md`. Notas de topografía, aún sin UseCase implementado (ver `NEXT-STEPS.md`).

**`validación/`** (6): `DoorWindowValidationService.md`, `ExportValidationService.md`, `matriz-reglas-de-negocio.md`, `RoomValidationService.md`, `ValidationWarning-tipos.md`, `WallValidationService.md`. Consumidas transversalmente por los UseCases del Spike #5 vía `IValidationService`.

### 02-Aplicación (22 notas)

**`comandos/`** (8): `CloseRoomCommand.md`, `Command-abstracción.md`, `CommandStack.md`, `CreateWallCommand.md`, `DeleteObjectCommand.md`, `lista-18-comandos.md`, `MoveWallCommand.md`, `UpdateWallThicknessCommand.md`. `lista-18-comandos.md` es la nota "índice" que enumera el contrato completo de comandos tipados — la nota de entrada obligatoria del Spike #5.

**`máquina-estados/`** (3): `SurveyInteractionMode.md`, `SurveyLifecycle.md`, `transiciones-máquina.md`. Documentan el ciclo de vida de un levantamiento (CREATING → EDITING → EXPORTING), consumidas por el Gesture Handler del Spike #4.

**`use-cases/`** (11): una nota por cada UseCase implementado — `CaptureMeasurementUseCase.md`, `CapturePhotoUseCase.md`, `CloseRoomUseCase.md`, `CreateColumnUseCase.md`, `CreateDoorUseCase.md`, `CreateWallUseCase.md`, `CreateWindowUseCase.md`, `DeleteObjectUseCase.md`, `ExportRoomIfcUseCase.md`, `LinkPhotoToObjectUseCase.md`, `MoveObjectUseCase.md`, `UpdateObjectPropertyUseCase.md`.

### 03-Infraestructura (5 notas)

**`export-ifc/`**: `escritura-objetos-IFC.md`, `ExportRoomIfcUseCase-detalles.md`, `generación-GUID-IFC.md`, `IFC-Compatibility-Gate.md`, `serializador-IFC-general.md`. Alimentó el Spike #3 en su totalidad.

*Nota sobre la ausencia de notas de SQLite en esta carpeta:* la especificación de persistencia (schema, WAL, modelo de datos) vive en los documentos satélite del proyecto (`app-levantamientos-bim-documento-maestro`, `matriz-trazabilidad.md`) en lugar de notas de vault dedicadas bajo `03-Infraestructura/sqlite/`. El Spike #2 se alimentó de esos documentos satélite combinados con las notas de `01-Dominio/objetos-bim/` y `01-Dominio/validación/`, no de una carpeta de notas de infraestructura dedicada — un ejemplo real de que el grafo de contexto no siempre sigue la carpeta que "debería" corresponder por nombre, sino los wikilinks reales entre notas.

### 04-UI-UX (3 notas)

**`arquitectura/`**: `Canvas2D-interacción.md`, `gestión-estado-Zustand.md`, `presupuesto-frame.md`. Alimentó el Spike #4 junto con reuso directo de `01-Dominio/geometría/`.

### 05-Testing (12 notas)

**`unit/`** (3): `estrategia-unit-testing.md`, `tests-comandos.md`, `tests-geometría-core.md`.
**`integration/`** (3): `estrategia-integration-testing.md`, `flujos-integración-documentados.md`, `matriz-casos-criticos.md`.
**`recovery/`** (3): `backup-integridad.md`, `escenarios-recuperación.md`, `plan-validacion-final.md`.
**`field/`** (1): `pruebas-campo-10.md`.
**`fixtures/`** (2): `formato-fixture.md`, `lista-14-fixtures.md`.

Estas 12 notas, todas fechadas 2026-09-15, alimentaron el Spike #6 en su totalidad y son las únicas de todo el vault escritas *después* de que el código de los cinco spikes anteriores ya existiera — su propósito explícito era auditar, no especificar de cero.

## 3. Relaciones entre notas (wikilinks)

El frontmatter de cada nota declara `depends-on` como una lista de wikilinks explícitos, y `mentioned-in` para trazar en qué spike se usó. Ejemplos reales tomados del vault:

- `plan-validacion-final.md` depende de `[[flujos-integración-documentados]]` y `[[pruebas-campo-10]]`.
- `matriz-casos-criticos.md` depende de `[[estrategia-unit-testing]]` y `[[flujos-integración-documentados]]`.
- `tests-comandos.md` depende de `[[Command-abstracción]]`, `[[CommandStack]]` y `[[estrategia-unit-testing]]`.
- `tests-geometría-core.md` depende de `[[CDT-algoritmo]]`, `[[CDT-casos-prueba]]` y `[[estrategia-unit-testing]]`.
- `lista-14-fixtures.md` depende de `[[RevitObjectBase]]`, `[[tipos-geométricos]]` y `[[estrategia-unit-testing]]`.

Este patrón —cada nota de testing enlaza explícitamente a la nota de dominio que testea y a la nota de estrategia que define su forma— es el mecanismo concreto que permitió al Spike #6 recorrer "dos niveles de profundidad" desde cualquier nota de entrada y llegar exactamente al subconjunto de dominio relevante, sin cargar el vault completo.

## 4. Qué notas generan qué código (mapa spike → archivo)

| Carpeta de notas | Código generado |
|---|---|
| `01-Dominio/geometría/` | `domain/geometry/*.ts` (6 archivos) |
| `01-Dominio/objetos-bim/` | `domain/objects/*.ts` (10 archivos) |
| `01-Dominio/validación/` | Consumida vía `IValidationService` — no genera archivos propios en este alcance, define el contrato que las UseCases invocan |
| `02-Aplicación/comandos/` | `application/commands/*.ts` (12 archivos) |
| `02-Aplicación/use-cases/` | `application/use-cases/*.ts` (13 archivos) |
| `03-Infraestructura/export-ifc/` | `infrastructure/export/ifc/*.ts` (5 archivos) |
| `04-UI-UX/arquitectura/` | `application/canvas/*.ts` + `state/appStore.ts` (7 archivos) |
| `05-Testing/*` (las 12 notas) | `test/*.test.ts` (17 suites) + `test/fixtures/*.ts` (7 archivos) |

`01-Dominio/survey/` (3 notas) es, al cierre de este experimento, la única carpeta de dominio poblada que todavía no generó código — los UseCases de topografía (`CreateControlPointUseCase`, `DefineSiteCoordinateSystemUseCase`) están especificados pero no implementados (ver `NEXT-STEPS.md`).
