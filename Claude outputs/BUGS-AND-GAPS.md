# BUGS-AND-GAPS

## Los 3 bugs encontrados y corregidos, y los 7 gaps documentados

Este documento es, junto con `TESTING-REPORT.md`, la evidencia más concreta de que el Spike #6 no solo agregó cobertura sino que auditó código real. Los tres bugs están descritos exactamente como aparecen en el código fuente de los tests que los descubrieron y corrigieron (`test/critical/CriticalCases.test.ts`), no como resúmenes de segunda mano.

---

## 1. Los tres bugs

### Bug 1 — `ObjectStore` no persistía `linkedPhotos` en el roundtrip a SQLite

**Descripción:** cuando un `LinkPhotoToObjectUseCase` vinculaba una foto a un objeto (por ejemplo, un `Wall`), la actualización de `linkedPhotos` se aplicaba en memoria pero no sobrevivía a una escritura y posterior lectura desde SQLite — el campo se perdía porque `ObjectStore` no lo serializaba/deserializaba correctamente a través de `properties_json`.

**Cómo se descubrió:** al escribir `test/integration/EndToEnd.test.ts` (Flujo 7, "Photo Capture + Link"), el test de extremo a extremo leía el objeto de vuelta desde SQLite real (no desde la instancia en memoria) para verificar el vínculo, y ahí es donde el campo aparecía vacío — un mock de `ObjectStore` nunca habría expuesto este defecto, porque un mock no serializa nada.

**Fix aplicado:** se corrigió `ObjectStore.ts` para que `linkedPhotos` se incluya correctamente en la serialización y deserialización de `properties_json`.

**Test que valida la corrección:** `test/critical/CriticalCases.test.ts` → *"Bug 1 corregido: ObjectStore persiste y restaura linkedPhotos desde properties_json"* — crea un `Wall`, le vincula una foto, relee el objeto desde una instancia nueva de `ObjectStore` sobre la misma base y verifica que `linkedPhotos` contiene el `photoId` esperado. También queda cubierto indirectamente por el Flujo 7 de `EndToEnd.test.ts`.

---

### Bug 2 — `ExportRoomIfcUseCase` no separaba `doors[]` y `windows[]` antes de pasarlos al serializador IFC

**Descripción:** `ExportRoomIfcUseCase` filtraba los objetos hijos de un `Room` con una condición combinada (`instanceof Door || instanceof Window`) hacia un único array, mientras que `IFCSerializer` (la pieza de infraestructura que realmente escribe el STEP) espera recibir `doors` y `windows` como dos arrays separados en su `SerializeInput`. El contrato entre ambos módulos estaba desalineado.

**Cómo se descubrió:** al escribir el Flujo 4 (`ExportIfc`) de `EndToEnd.test.ts` contra el `IFCSerializer` real (no mockeado), el desajuste de contrato quedó documentado explícitamente en un comentario del propio test antes de corregirse en el código fuente.

**Fix aplicado:** se corrigió `ExportRoomIfcUseCase.ts` (y su archivo de tipos asociado, `use-cases/types.ts`) para construir y pasar `doors[]` y `windows[]` como arrays independientes.

**Test que valida la corrección:** `CriticalCases.test.ts` → *"Bug 2 corregido: ExportRoomIfcUseCase pasa doors[] y windows[] por separado al IFCSerializer"* — captura el objeto exacto que recibiría el serializador y verifica que `doors` y `windows` son arrays separados, cada uno con instancias del tipo correcto (`instanceof Door`, `instanceof Window`), no un array mixto.

---

### Bug 3 — `CloseRoomUseCase` no convertía columnas circulares a polígonos de hueco antes de llamar al CDT

**Descripción:** cuando un `Room` con una `Column` interna se cerraba, `CloseRoomUseCase` debía informar al motor de triangulación (CDT) que existe un hueco en esa posición — pero el CDT real (`domain/geometry/CDT.ts`) solo acepta huecos como polígonos (arrays de vértices), mientras que `Column` se describe geométricamente como un círculo (`{center, radius}` derivado de su `diameter`). Faltaba el paso de conversión círculo→polígono antes de invocar al CDT.

**Cómo se descubrió:** al escribir tests de integración con el CDT real (en lugar de un adaptador mockeado) para Recintos con columnas, la ausencia de esa conversión se hizo evidente porque el CDT rechazaba o ignoraba el formato de hueco recibido.

**Fix aplicado:** se corrigió `CloseRoomUseCase.ts` para convertir explícitamente el diámetro de cada `Column` interna en un polígono aproximado (mínimo un triángulo) antes de pasarlo como hueco al CDT.

**Test que valida la corrección:** `CriticalCases.test.ts` → *"Bug 3 corregido: CloseRoomUseCase convierte Column.diameter en polígono de hueco antes de llamar al CDT"* — crea un `Room` con una `Column` interna, captura los `holes` que recibiría el CDT, y verifica que cada hueco es un array de al menos 3 puntos `{x, y}` — explícitamente **no** un descriptor `{center, radius}`.

---

## 2. Los 7 gaps documentados (`it.todo()`)

La suite de testing distingue deliberadamente entre "esto no está probado" y "esto no existe todavía en el código" — en el segundo caso, en vez de fabricar un test que pase sin verificar nada real, se deja un `it.todo()` con la razón exacta. Estos son los siete, tal como aparecen en el código:

1. **`RecoverRoomDraftUseCase` no implementado** (`test/integration/CrashRecovery.test.ts`) — el Maestro Técnico §7.10 especifica que la app debe reconstruir un `Room` y su `CommandStack` desde `polygon_drafts` y ofrecer continuar o descartar; la tabla `polygon_drafts` existe en el schema y persiste correctamente, pero el UseCase que la consumiría no existe todavía en `src/`.

2. **`AppError USE_CASE_ROLLBACK` con contexto completo no implementado** (`CrashRecovery.test.ts`) — `shared/errors/AppError.ts` está en el árbol de carpetas planeado (`arquitectura-carpetas-v1.md`) pero no existe todavía como archivo real; el caso de "el rollback mismo falla" no tiene todavía un tipo de error dedicado que capture el contexto completo.

3. **`BackupDatabaseUseCase` / `RestoreDatabaseUseCase` no implementados** (`test/critical/CriticalCases.test.ts`) — la estrategia de rotación de hasta 5 backups y restauración desde el último que pase su propia verificación de integridad está completamente especificada en `backup-integridad.md`, pero ningún UseCase la implementa todavía.

4. **Verificación manual en Revit / visor IFC real** (`test/field/FieldScenarios.test.ts`, caso de campo #4) — el STEP generado se valida sintácticamente por tests automatizados, pero confirmar que la geometría se ve correcta al importarlo a Revit real no es automatizable sin Revit.

5. **Force-close real en dispositivo físico durante CREATING/EDITING** (`FieldScenarios.test.ts`, caso de campo #6) — la lógica de persistencia que sobrevive a un reinicio de proceso ya está probada (`CrashRecovery.test.ts`), pero verificar el diálogo real "Restore last survey?" requiere UI renderizada y un dispositivo físico.

6. **Capa de red/upload de IFC** (`FieldScenarios.test.ts`, caso de campo #9) — no existe todavía ningún cliente HTTP ni UseCase de sincronización en `src/`; este caso de campo no tiene código que probar hasta que esa infraestructura se implemente.

7. **Battery stress test de 1 hora** (`FieldScenarios.test.ts`, caso de campo #10) — una prueba de resistencia de una hora en dispositivo físico real está fuera del alcance de un test unitario o de CI; se deja documentada como candidata a un script de smoke-test manual separado, no a Jest.

## 3. Otros gaps conocidos, no fabricados como `it.todo()` pero documentados en comentarios de test

Dos comportamientos incompletos quedaron registrados directamente como comentarios explicativos dentro de tests que sí pasan, porque describen un límite conocido del diseño actual y no un caso pendiente de escribir:

- **`CommandStack` no persiste entre reinicios.** Los objetos sobreviven un "crash" simulado porque cada operación se comitea individualmente a SQLite, pero el historial de undo/redo en sí vive solo en memoria (`application/state/CommandStack.ts` no tiene capa de persistencia). `escenarios-recuperación.md` aspira a reconstruir el `CommandStack` completo tras un reinicio; eso no está implementado.
- **`redo()` sobre una creación no restaura el borrado lógico.** Tras un `undo()` de un `CreateWallCommand` (que hace soft-delete) y un `redo()` posterior, el objeto sigue marcado como borrado, porque el patrón `Command` actual asume que `execute()` ya persistió el objeto la primera vez y no vuelve a hacerlo en el redo. Es un gap conocido del patrón, verificado explícitamente por el Flujo 5 (`Undo/Redo`) de `EndToEnd.test.ts`.

## 4. Por qué esto importa más que el número "208/208"

Cualquier suite de tests puede llegar a un número alto de casos en verde sin verificar comportamiento real. Lo que distingue a este spike es que los tres bugs se encontraron precisamente cuando se dejó de mockear las piezas de infraestructura (SQLite, el serializador IFC, el CDT) y se las ejerció con datos reales de principio a fin — y que, en los siete casos donde una verificación honesta no era posible, la suite lo dice explícitamente en lugar de simularlo. Esa es la señal de que el sistema generado es una base confiable para la implementación real, no solo una cifra de cobertura para un reporte.
