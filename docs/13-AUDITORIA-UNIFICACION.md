# 13 — Auditoría y unificación PolyLive + LevON

**Fecha:** 2026-09-22
**Alcance:** auditoría completa de `app-bim-typescript`, unificación con las funcionalidades de
`_LevON`, cierre de los huecos de UI/UX y extensión de la bóveda Obsidian.

---

## 1. El problema declarado

> *"Acabo de colocar varias funcionalidades de otra APP LevOn, pero no las encuentro disponibles."*

La causa no era una integración incompleta. Eran **dos problemas distintos** que se manifestaban
igual:

1. **Las funcionalidades de LevON no estaban en la app.** `_LevON/` es un proyecto **Flutter/Dart**
   independiente (v0.10.1-alpha, ~22 200 líneas de `lib/`) copiado dentro del árbol. No comparte
   runtime, lenguaje ni stack con `app-bim-typescript` (React Native/TypeScript). Nada de LevON
   podía ejecutarse: no había nada que "encontrar".

2. **Buena parte de PolyLive tampoco estaba disponible.** De **21 casos de uso implementados y
   probados, 11 no eran alcanzables desde ninguna pantalla.**

---

## 2. Auditoría inicial — estado encontrado

### Línea base

| | |
|---|---|
| `tsc --noEmit` | limpio |
| Tests | 499 pasando, **4 fallando** |
| `src/` | ~14 200 líneas |

Los 4 tests rojos eran de `ExpoBackupDatabaseUseCase`: la implementación había migrado a
`VACUUM INTO` y los tests seguían atados a la mecánica anterior. **Tests desfasados contra código
correcto.**

### Casos de uso inalcanzables desde la UI

| UseCase | Estado |
|---|---|
| `CreateColumnUseCase` | sin UI |
| `CreateDoorUseCase` | sin UI |
| `CreateWindowUseCase` | sin UI |
| `MoveObjectUseCase` | sin UI |
| `DeleteObjectUseCase` | sin UI |
| `UpdateObjectPropertyUseCase` | sin UI **y sin estar en AppServices** |
| `DetectRoomsUseCase` | instanciado, nunca invocado |
| `CaptureMeasurementUseCase` | instanciado, nunca invocado |
| `CreateControlPointUseCase` | sin UI y sin estar en AppServices |
| `DefineSiteCoordinateSystemUseCase` | sin UI y sin estar en AppServices |
| `RestoreDatabaseUseCase` | sin UI (y sin variante para dispositivo) |

### Código muerto

- `GestureHandler`, `MiterHandler`, `SnapHandler` — solo exportados desde el barrel
- `domain/geometry/projections.ts` — cero referencias
- `ExpoSQLiteDatabase.serialize()` — huérfano tras migrar el backup
- `uiSlice` y `controlPointsSlice` del store de Zustand — **ningún componente los escribía**

### Superficie de la pantalla principal

`SurveyScreen` solo sabía: encadenar muros con toques, deshacer/rehacer, cerrar recinto, medir por
BLE (sin persistir), y un botón "Foto" que **solo mostraba un `Alert` remitiendo a otra pestaña**.

Sin paneo ni zoom: un levantamiento más grande que la pantalla era literalmente imposible de ver.

---

## 3. Decisiones tomadas

### 3.1 Dirección de la unificación: LevON → TypeScript

Confirmada con el usuario. Razones:

- La bóveda Obsidian —designada fuente de verdad— documenta **la arquitectura RN/Expo/Skia**. No
  contiene una sola nota sobre Flutter.
- `app-bim-typescript` tenía 499 tests y compilaba limpio. La dirección contraria implicaba
  reescribir la bóveda entera y perderlos.

`_LevON/` queda como **referencia de lectura**: no se compila ni se despliega.

### 3.2 Lo portado

| De LevON | A PolyLive |
|---|---|
| `Project` + multi-espacio + `BimCodeGenerator` | `domain/objects/project.ts`, `ProjectService` |
| Motor de Elevación de Muros (MEM/WEP) | `domain/objects/wall-elevation.ts`, `WallElevationService` |
| `SelectionService` (hit-testing) | `application/canvas/SelectionService.ts` |
| `EditorController` | `application/editor/EditorController.ts` |
| `DxfExporter` | `infrastructure/export/dxf/DXFSerializer.ts` |
| SPDS (fotos con marcador en planta) | metadata de `AuditPhoto` + `planRenderer` + `PhotoViewer` |
| `levon_tokens.dart` | `ui/theme/tokens.ts` → hoy `ui/design/tokens.ts` (ver doc 16) |
| Painters de planta y elevación | `ui/canvas/planRenderer.ts`, `ui/canvas/elevationRenderer.ts` |

### 3.3 Lo NO portado, y por qué

**Consolidar `Door`/`Window` dentro de `WallOpening`.** LevON eliminó las entidades paralelas.
PolyLive no puede: son objetos BIM persistidos, exportados a IFC y referenciados por el
CommandStack, la validación y sus tests. Se mantienen **los dos modelos con correspondencia
explícita y unidireccional**: `WallOpening` es la fuente de verdad de la elevación, y proyecta un
`Door`/`Window` en la planta.

**Archivos `.levon` (ZIP con JSON).** PolyLive persiste en SQLite. Un segundo formato sería una
segunda fuente de verdad.

**Riverpod / GoRouter.** Equivalentes de Flutter; aquí los cubren Zustand y React Navigation.

**Export PDF.** LevON lo declaraba pero **no lo implementó**. No hay nada que portar.

### 3.4 `ProjectService` es un service, no un UseCase por operación

Los UseCases existen para orquestar operaciones BIM que pasan por el CommandStack. Las operaciones
sobre proyectos son CRUD de metadatos sin inversa geométrica. Seis clases de veinte líneas con un
solo `await` no aportarían nada de lo que el patrón Command da.

---

## 4. Bugs reales corregidos

Detalle completo en la bóveda: `06-Referencias-Cruzadas/bugs-corregidos-unificacion.md`.

| # | Bug | Impacto |
|---|---|---|
| 1 | `execute()` vacío en los 4 `Create*Command` | **El Redo de cualquier creación no hacía nada** |
| 2 | `DeleteObjectCommand.undo()` usaba `updateObject` sobre un objeto borrado | **Deshacer un borrado lanzaba excepción siempre** |
| 3 | `updateObject` no persistía `offsetAlongWall`, `width`, `doorType`… | **Editar un vano no guardaba nada** |
| 4 | `rowToObject` no devolvía `properties` | **El nombre de un objeto desaparecía al recargar** |
| 5 | `notes` declarado en `ObjectProperties` **y** en Wall/Column | Dos fuentes para el mismo dato; se perdía en puertas y recintos |
| 6 | `transaction()` se tragaba el error dentro de la callback | **COMMIT de transacciones fallidas** |
| 7 | `measurements` sin ningún método de lectura | Mediciones de **solo escritura** |
| 8 | `handleMeasure` no llamaba a `CaptureMeasurementUseCase` | La medición se perdía al cerrar la app |
| 9 | `IBLEManager.measure()` × 7 sobre ráfagas de 7 | **49 disparos del láser por medición** |
| 10 | Tests de backup desfasados + fuga de `mockImplementation` | 4 tests rojos contra código correcto |
| 11 | Restauración declarada "imposible" | **En la práctica, no había copias de seguridad** |
| 12 | Recuento de DDL escrito a mano en un test | Se rompía con cada tabla nueva |

Además, **tres comentarios obsoletos** que afirmaban que cosas ya existentes "no existen todavía en
src/" (`AppError.ts`, `RecoverRoomDraftUseCase`, el adaptador de huecos circulares). Uno de ellos
mantenía un `it.todo` vivo; se convirtió en test real.

Y un test que **documentaba un bug como si fuera el contrato**: `EndToEnd.test.ts` afirmaba que tras
un redo el muro "sigue borrado".

---

## 5. Lo construido

### Capa de aplicación

- **`EditorController`** — el cerebro del editor. Lógica pura, sin React ni Skia: recibe puntos de
  pantalla, decide qué UseCase invocar y publica estado inmutable. 56 tests contra SQLite real.
- **`SelectionService`** — hit-testing con prioridad vano → muro → columna → recinto. 24 tests.
- **`ProjectService`** — proyectos y espacios, con adopción de Recintos huérfanos. 34 tests.
- **`WallElevationService`** — CSL, validación de huecos, sincronización con la planta. 49 tests.

### Infraestructura

- **`ProjectStore`** — tablas `projects` y `project_spaces`, aditivas.
- **`DXFSerializer`** — DXF R2000 completo. 38 tests que verifican la estructura par por par.
- **`ExpoRestoreDatabaseUseCase`** — restauración real en dispositivo. 18 tests.
- **`ExpoGpsProvider`** — lectura de GPS con invariante de precisión. 11 tests.
- **`ObjectStore`** — `restoreObject`, lectura de mediciones, actualización de fotos.

### UI

Pantallas nuevas: `ProjectsScreen`, `ProjectWorkspaceScreen`, `WallElevationScreen`,
`SurveyControlScreen`.

Pantallas reescritas: `SurveyScreen`, `SettingsScreen`, `ExportScreen`.

Componentes nuevos: `ToolPalette`, `QuickBar`, `PropertiesPanel`, `PlanCanvasView`, `PhotoViewer`,
`SpacePreview`, `fields.tsx` (NumberField, TextField, SegmentedField, ToggleRow, ReadonlyRow).

Renderers nuevos (funciones puras, testeables): `planRenderer`, `elevationRenderer`.

Sistema de diseño: `ui/design/tokens.ts` + `typography.ts` + `canvasThemes.ts` (el antiguo `ui/theme/tokens.ts` se eliminó en la auditoría post-M2, doc 16).

---

## 6. Estado final

```
tsc --noEmit  → limpio
Tests         → 50 suites · 764 pasando · 4 todo · 0 fallos
src/          → ~25 000 líneas
test/         → ~14 800 líneas
```

**Casos de uso inalcanzables desde la UI: 0 de 18.**

Verificado programáticamente contra `AppServices.useCases` cruzado con `src/ui/`,
`application/editor/`, `application/elevation/` y `application/projects/`.

Los 4 `it.todo` restantes están en `test/field/FieldScenarios.test.ts` y requieren un dispositivo
físico (importar el IFC a Revit, force-close real, prueba de batería de una hora) o una capa de red
que no existe.

---

## 7. Lo que queda fuera — dicho explícitamente

### 7.1 Sin tests de componentes React

El proyecto **no tiene** `@testing-library/react-native` ni `react-test-renderer`, y añadirlos es
una decisión de dependencias que no se ha tomado.

La mitigación fue **sacar la lógica de los componentes**: controlador, servicio de selección y
renderers son funciones y clases puras con 167 tests entre los tres. Lo que queda son vistas
delgadas. **Es el hueco conocido y está acotado a propósito.**

### 7.2 El eje Y de la PLANTA no se invierte

En la vista de planta, `worldToScreen` no invierte Y: el eje Y del mundo crece hacia abajo. Como la
entrada también son toques sobre la misma pantalla, el trazo es **autoconsistente** y el operador no
lo percibe.

Afecta a la orientación absoluta de los exportados (IFC/DXF) respecto al norte geográfico. **No se
cambió** porque tocar `domain/geometry/coordinates.ts` alteraría el contrato que asumen los tests de
geometría existentes, y la corrección correcta pasa por el `SiteCoordinateSystem` (que ya modela la
rotación al norte) y no por invertir un eje.

La vista de **elevación** sí invierte Y: ahí un muro tiene un arriba y un abajo que no son opinables.

### 7.3 Niveles (plantas) no modelados

`AppServices.defaultLevelId` es `'level-1'` para todo. Un edificio de varias plantas necesita que
`LevelId` sea de primera clase. La constante está en **un único sitio** para que el día que se
modele no haya que buscar literales.

### 7.4 Sedes múltiples

`SurveyControlScreen` usa una Sede por defecto (`site-default`). La topografía es usable, con un
único punto que cambiar.

### 7.5 La preferencia de copia automática no se persiste

El interruptor de Ajustes solo afecta a la sesión. **La UI lo dice** en vez de fingir que quedó
guardado. Falta un almacén de preferencias.

### 7.6 Sincronización elevación → planta unidireccional

Dos direcciones exigirían resolver conflictos, y no hay ninguna regla que diga quién gana si el
mismo hueco se mueve a la vez en las dos vistas.

### 7.7 IFC: GUIDs de entidades estructurales

Heredado del estado anterior y también pendiente en LevON: los GUIDs de site, building, storey y
relaciones siguen siendo aleatorios entre exportaciones. Los de los muros sí son estables.

---

## 8. Bóveda Obsidian

Notas nuevas (11), siguiendo el formato existente con frontmatter y wikilinks:

```
00-Introducción/MOC-PolyLive.md                             ← índice maestro
01-Dominio/objetos-bim/Project-especificacion.md
01-Dominio/objetos-bim/WallElevation-MEM.md
01-Dominio/objetos-bim/PhotoMarker-SPDS.md
02-Aplicación/editor/EditorController.md
02-Aplicación/canvas/SelectionService.md
02-Aplicación/servicios/ProjectService.md
02-Aplicación/servicios/WallElevationService.md
03-Infraestructura/export-dxf/DXF-R2000.md
03-Infraestructura/backup-restore/restauracion-en-dispositivo.md
04-UI-UX/pantallas/mapa-de-navegacion.md
04-UI-UX/arquitectura/sistema-de-diseño.md
06-Referencias-Cruzadas/trazabilidad-nota-codigo-test.md     ← nota ↔ código ↔ test
06-Referencias-Cruzadas/bugs-corregidos-unificacion.md
```

`trazabilidad-nota-codigo-test.md` es el que hace **comprobable** que la bóveda es la fuente de
verdad: cada nota apunta a su archivo y a su suite. Donde no hay test, se dice por qué.
