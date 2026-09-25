# SPIKES-BREAKDOWN

## Desglose detallado de los 6 spikes — experimento Claude-Obsidian

Cada spike es un ciclo vertical completo: identificar la nota de entrada del dominio, recorrer el grafo de wikilinks hasta dos niveles de profundidad, generar el código, generar tests contra los casos definidos en las notas de validación, y confirmar compilación y tests en verde antes de avanzar. Este documento desglosa los seis, en el orden en que se ejecutaron.

Nota sobre métricas de tiempo: este experimento no instrumentó el tiempo de reloj por spike como métrica formal — las métricas de esfuerzo que sí se registraron con precisión son notas del vault, archivos generados y tests escritos, que es lo que se reporta abajo. Las cifras de líneas de código son una estimación a partir del tamaño en bytes de los archivos reales (no un conteo exacto de `wc -l`).

---

## Spike #1 — Geometría computacional

**Dominio:** triangulación restringida de Delaunay (CDT), miter de encuentros entre muros, snap angular.

**Notas del vault usadas (8 acumuladas):** `CDT-algoritmo.md`, `CDT-casos-prueba.md`, `miter-encuentros.md`, `snap-angular.md`, `tipos-geometricos.md`, `proyecciones-punto-muro.md`, `sistema-coordenadas-6-capas.md`, `transformaciones-coordenadas.md`.

**Archivos generados (6):** `CDT.ts`, `coordinates.ts`, `miter.ts`, `projections.ts`, `snap.ts`, `types.ts` — todos en `domain/geometry/`, sin ninguna dependencia externa a React Native, Expo o Zustand.

**Tests:** 36, incluyendo el archivo más extenso de todo el proyecto en su categoría — `geometry/CDT.test.ts`, con 12 casos de triangulación (rectángulo, L-shape, U-shape, huecos múltiples, puntos casi colineales, polígono auto-intersectante tipo "bowtie", entre otros) más suites dedicadas a snap (16 ángulos predefinidos) y miter (T-joints, ángulos agudos y obtusos).

**Estado:** ✅ Completo. Este fue el spike de menor acoplamiento — lógica pura sin I/O — y sirvió como caso de control: si la hipótesis fallaba incluso aquí, no tenía sentido seguir.

**Lección aprendida:** el criterio de "una decisión, una nota" resultó especialmente efectivo en geometría, donde cada algoritmo (CDT, miter, snap) tiene una nota propia con su pseudocódigo y casos de prueba adyacentes — el subgrafo relevante para generar `CDT.ts` no necesitó tocar ninguna nota de infraestructura o UI.

---

## Spike #2 — Persistencia SQLite

**Dominio:** modo WAL, esquema de tablas, reconstrucción de drafts a mitad de trazo, recuperación.

**Notas del vault usadas (47 acumuladas, +39 sobre el spike anterior):** la mayor parte de este salto corresponde a notas de objetos BIM (`RevitObjectBase.md`, `Wall-especificación.md`, `Room-especificacion.md`, etc.) y de validación (`WallValidationService.md`, `RoomValidationService.md`, `matriz-reglas-de-negocio.md`) que el schema de persistencia necesita conocer para las foreign keys y las reglas de integridad.

**Archivos generados (14):** `database.ts`, `ObjectStore.ts`, `schema.ts`, `types.ts` en `infrastructure/sqlite/`, más las clases de dominio (`Wall`, `Door`, `Window`, `Column`, `Room`, `Floor`, `RevitObjectBase`, `audit-photo`, `measurement`) que el store necesita persistir.

**Tests:** 20, concentrados en `sqlite/ObjectStore.test.ts` — CRUD completo, validación de foreign keys (un `Door` sin `Wall` padre debe rechazarse), soft-delete y restauración.

**Estado:** ✅ Completo.

**Lección aprendida:** este spike acumuló casi 6× las notas del spike anterior (8→47) porque persistencia es, por naturaleza, el punto donde convergen todas las entidades de dominio — pero el *ahorro de tokens* no se degradó proporcionalmente, porque el grafo permite cargar "esta entidad y sus reglas de validación" sin arrastrar las entidades no relacionadas.

---

## Spike #3 — Exportación IFC

**Dominio:** generación manual de STEP (sin librería externa), generación de GUID, compatibility gate de exportación.

**Notas del vault usadas (52 acumuladas, +5):** `escritura-objetos-IFC.md`, `ExportRoomIfcUseCase-detalles.md`, `generación-GUID-IFC.md`, `IFC-Compatibility-Gate.md`, `serializador-IFC-general.md`.

**Archivos generados (5):** `compatibility-gate.ts`, `guid-generator.ts`, `IFCSerializer.ts`, `step-writer.ts` (el archivo individual más grande de todo el proyecto, ~28.6 KB), `types.ts` — todos en `infrastructure/export/ifc/`.

**Tests:** 22, en `ifc/IFCSerializer.test.ts` — verifican que el STEP generado es sintácticamente completo (cabecera y pie balanceados, GUIDs de 22 caracteres) y que el compatibility gate rechaza combinaciones inválidas antes de escribir el archivo.

**Estado:** ✅ Completo. Este spike fue, junto con el de geometría, uno de los que valida la decisión de arquitectura más costosa del proyecto: escribir el generador STEP a mano en TypeScript puro en lugar de depender de una librería IFC externa.

**Lección aprendida:** el crecimiento del vault se detuvo casi por completo (47→52, solo +5 notas) porque el dominio de exportación es genuinamente más pequeño y autocontenido que persistencia — evidencia de que el tamaño del vault no crece linealmente con la complejidad del código, sino con la cantidad de decisiones de diseño distintas que el dominio requiere documentar.

---

## Spike #4 — Interacción de Canvas

**Dominio:** transformaciones de pantalla↔mundo, snap y miter en tiempo real durante el trazo, gestión de gestos.

**Notas del vault usadas (55 acumuladas, +3):** `Canvas2D-interacción.md`, `gestión-estado-Zustand.md`, `presupuesto-frame.md` — un salto pequeño porque este spike reutiliza intensivamente las notas de geometría del Spike #1 (snap, miter) en lugar de generar conocimiento nuevo.

**Archivos generados (12):** `CanvasManager.ts`, `GestureHandler.ts`, `MiterHandler.ts`, `SnapHandler.ts`, `types.ts`, `index.ts` en `application/canvas/`, más `appStore.ts` (Zustand) en `state/`.

**Tests:** 39 — el segundo spike con más tests, cubriendo clamping de escala (5×–500×), distinción tap-vs-pan por umbral de movimiento, y sincronización entre `CanvasManager` y el store de Zustand.

**Estado:** ✅ Completo.

**Lección aprendida:** este fue el primer spike donde el reuso de notas de un spike anterior (geometría) fue más importante que la generación de notas nuevas — el patrón que se confirmaría con más fuerza aún en el Spike #5.

---

## Spike #5 — Capa de UseCases

**Dominio:** orquestación de comandos, rollback explícito ante fallos, los ocho flujos de negocio principales.

**Notas del vault usadas (55 acumuladas — sin crecimiento neto respecto al Spike #4):** este es el dato más importante de toda la tabla de resultados. El vault no creció (55→55) porque la capa de UseCases —el punto de mayor acoplamiento del sistema, tocando dominio, infraestructura y estado a la vez— reutilizó casi por completo el grafo ya construido en los cuatro spikes anteriores. Las notas nuevas que sí se agregaron (`comandos/`, `use-cases/`, `máquina-estados/` en `02-Aplicación`) documentan la orquestación en sí, no conocimiento de dominio nuevo.

**Archivos generados (32 — el mayor número de todo el experimento):** 12 Commands + 13 UseCases + `Command.ts`/`CommandStack.ts`/`types.ts` en `application/`.

**Tests:** 29 — proporcionalmente menos tests que archivos, porque gran parte de esta capa son comandos delgados sobre lógica ya validada en los spikes 1 a 4 (crear un comando de movimiento no requiere volver a probar la geometría de proyección que ya se validó en el Spike #1).

**Estado:** ✅ Completo.

**Lección aprendida:** este es el spike que más directamente confirma la hipótesis central del experimento — es el escenario más desfavorable posible (máximo acoplamiento) y es, precisamente, donde el vault se comportó como un activo acumulativo en lugar de exigir documentación nueva proporcional a la complejidad del código generado.

---

## Spike #6 — Testing (integración, casos críticos, campo, recuperación)

**Dominio:** auditar con tests de integración reales (no mockeados) el código de los cinco spikes anteriores.

**Notas del vault usadas (67 acumuladas, +12 sobre el Spike #5):** el bloque completo de `05-Testing/` — `estrategia-unit-testing.md`, `tests-comandos.md`, `tests-geometría-core.md` (unit); `estrategia-integration-testing.md`, `flujos-integración-documentados.md`, `matriz-casos-criticos.md` (integration); `escenarios-recuperación.md`, `backup-integridad.md`, `plan-validacion-final.md` (recovery); `pruebas-campo-10.md` (field); `lista-14-fixtures.md`, `formato-fixture.md` (fixtures).

**Archivos generados (30):** 5 módulos de fixtures (`bim.fixtures.ts`, `geometry.fixtures.ts`, `command.fixtures.ts`, `photo.fixtures.ts`, `room-scenarios.fixtures.ts` + `index.ts`) y 6 suites de test nuevas (`EndToEnd.test.ts`, `Transactions.test.ts`, `CrashRecovery.test.ts`, `CriticalCases.test.ts`, `FieldScenarios.test.ts`, `fixtures.test.ts`), además de las correcciones aplicadas directamente sobre `ObjectStore.ts`, `ExportRoomIfcUseCase.ts` y `CloseRoomUseCase.ts` para resolver los tres bugs que este mismo spike encontró.

**Tests:** 62 nuevos (146 acumulados de los spikes 1–5 → 208 finales).

**Estado:** ✅ Completo — y el único spike que produjo hallazgos que obligaron a modificar código ya dado por terminado: 3 bugs reales corregidos (ver `BUGS-AND-GAPS.md`) y 7 gaps documentados explícitamente como `it.todo()` en lugar de tests fabricados.

**Lección aprendida:** este spike es el que más se diferencia cualitativamente de los cinco anteriores. Los spikes 1–5 probaron que Claude puede *generar* código correcto con contexto fragmentado; el Spike #6 probó que el mismo enfoque de notas atómicas —aplicado esta vez a especificar *cómo probar*, no *qué construir*— es capaz de *auditar* código ya escrito y encontrar defectos reales al forzar SQLite real en lugar de mocks. También expuso el límite honesto del método: cuando el caso de prueba depende de hardware físico (BLE real, batería, Revit), la fragmentación de notas no sustituye la validación en campo, y la suite lo documenta con `it.todo()` en vez de fabricar una verificación falsa.

---

## Tabla consolidada

| Spike | Dominio | Notas acum. | Archivos | Tests | Estado |
|---|---|---|---|---|---|
| #1 | Geometría | 8 | 6 | 36 | ✅ |
| #2 | SQLite | 47 | 14 | 20 | ✅ |
| #3 | IFC | 52 | 5 | 22 | ✅ |
| #4 | Canvas | 55 | 12 | 39 | ✅ |
| #5 | UseCases | 55 | 32 | 29 | ✅ |
| #6 | Testing | 67 | 30 | 62 | ✅ |
| **Total** | | **67 (final)** | **101** | **208** | **100% passing** |

El patrón más claro de la tabla: entre el Spike #4 y el #5 el vault no creció, y entre el #5 y el #6 solo creció 12 notas para producir el segundo mayor volumen de archivos y el mayor volumen de tests de todo el experimento — evidencia consistente de que, a partir de cierto tamaño de vault, el reuso del grafo empieza a pesar más que la generación de notas nuevas.
