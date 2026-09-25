---
name: bugs-corregidos-unificacion
description: Bugs reales encontrados y corregidos durante la unificación PolyLive + LevON.
type: referencia
depends-on: "[[CommandStack]], [[Command-abstracción]], [[matriz-reglas-de-negocio]]"
mentioned-in: "[[trazabilidad-nota-codigo-test]], [[EditorController]]"
tags: #referencia #bugs #auditoría
---

# Bugs corregidos durante la unificación

Todos son **defectos reales de comportamiento**, no mejoras de estilo. Cada uno tiene su test de
regresión.

---

## 1. El Redo de cualquier creación no hacía nada

**Dónde:** `CreateWallCommand`, `CreateColumnCommand`, `CreateDoorCommand`, `CreateWindowCommand`

Su `execute()` estaba vacío ("el objeto ya fue persistido por el UseCase") y su `undo()` hacía
soft-delete. `CommandStack.redo()` reejecuta el comando, así que tras un undo **el redo no
resucitaba nada**: el objeto se quedaba borrado y Rehacer era un no-op silencioso, con el botón
habilitado y sin ningún efecto visible.

**Corrección:** se añadió `restoreObject()` al contrato `IObjectStore` (la inversa exacta del
soft-delete) y los cuatro comandos la llaman. Es idempotente, así que también funciona en la primera
ejecución.

**Agravante:** `test/integration/EndToEnd.test.ts` **documentaba el bug como si fuera el contrato**:
afirmaba que tras el redo el muro "sigue borrado". Se reescribió.

---

## 2. Deshacer un borrado lanzaba una excepción

**Dónde:** `DeleteObjectCommand.undo()`

Hacía `updateObject(id, { is_deleted: false })`, y `ObjectStore.updateObject` empieza con
`SELECT ... WHERE id = ? AND is_deleted = 0` y **lanza** si no encuentra nada. El objeto que se
intenta restaurar está, por definición, borrado.

Deshacer un borrado fallaba **siempre** con `"Object ... not found or is deleted"`.

**Corrección:** usa `restoreObject()`. Y `execute()` vuelve a borrar en el redo (mismo problema
que el bug 1).

---

## 3. `updateObject` no persistía la mitad de los campos

**Dónde:** `ObjectStore.updateObject`

La lista de campos se escribía a mano y estaba incompleta. **Faltaban**:

```
offsetAlongWall, offsetPerpendicular, width, parentWallId,
doorType, windowType, frameType, glazing, embeddedInWallId
```

Mover o redimensionar una puerta o una ventana —desde el panel de propiedades o desde la vista de
elevación— **no persistía nada**: la operación decía que había funcionado y al releer el vano seguía
igual.

**Corrección:** la lista es ahora `SERIALIZED_FIELD_KEYS`, la misma que describe qué se persiste, con
lo que añadir un campo al dominio no puede volver a dejar este punto atrás.

---

## 4. Las propiedades del usuario se escribían y nunca se releían

**Dónde:** `ObjectStore.rowToObject`

`serializeProperties` empieza con `{ ...obj.properties }`, así que el nombre y las notas **sí** se
guardaban. Pero `rowToObject` no pasaba `properties` a ningún constructor.

Renombrar un muro desde el panel de propiedades parecía funcionar y **el nombre desaparecía al
recargar el Recinto**.

**Corrección:** `rowToObject` separa los campos tipados de las propiedades libres y devuelve estas
últimas al objeto.

---

## 5. `notes` estaba declarado en dos sitios

**Dónde:** `ObjectProperties.notes` **y** `Wall.notes` / `Column.notes`

Dos sitios para el mismo dato: escribir `properties.notes` y leer `wall.notes` daban cosas distintas,
y la serialización pisaba una con la otra según el orden. Además, `notes` solo se serializaba dentro
de las ramas de Wall y Column, así que **una nota sobre una puerta o un recinto se perdía**.

**Corrección:** `notes` pasó a ser un campo de `RevitObjectBase` (toda observación de campo vale para
cualquier objeto) y se eliminó de `ObjectProperties`.

---

## 6. `withTransactionAsync` hacía COMMIT de transacciones fallidas

**Dónde:** `ExpoSQLiteDatabase.transaction()`

Capturaba el error de `fn()` **dentro** de la callback para propagarlo después. El efecto era el
contrario al buscado: `withTransactionAsync` decide COMMIT vs ROLLBACK según si su callback lanza.
Al tragarse el error, la callback terminaba "bien" y expo-sqlite **hacía COMMIT de una transacción
fallida**.

Las escrituras parciales de un UseCase que abortó a mitad quedaban persistidas.

**Corrección:** el error atraviesa la callback (que es lo que dispara el ROLLBACK).

**Detalle:** el test existente pasaba con el bug presente, porque solo miraba que el llamador
recibiera el error. El test nuevo comprueba lo que aquel no podía ver: si la callback realmente
rechaza.

---

## 7. Las mediciones eran de SOLO ESCRITURA

**Dónde:** `ObjectStore`

Existía `createMeasurement()` y **ningún método de lectura**. `CaptureMeasurementUseCase` llenaba la
tabla `measurements` y nada en todo el sistema podía volver a leerla: ni la UI para mostrar el
historial de un muro, ni el exportador, ni un informe.

Una medición tomada en campo con el láser **desaparecía de la vista en cuanto se capturaba**.

**Corrección:** `readMeasurement`, `listMeasurements`, `listMeasurementsForWall`, `deleteMeasurement`.

---

## 8. La medición BLE nunca llegaba a la base de datos

**Dónde:** `SurveyScreen.handleMeasure`

Llamaba a `HuepaDeviceManager.measure()` y el resultado **solo se pintaba** y se guardaba en el store
de Zustand. Nada llegaba a la tabla `measurements`: la medición se perdía al cerrar la app, aunque
`CaptureMeasurementUseCase` existía desde el principio.

**Corrección:** ver [[EditorController]].

---

## 9. La captura BLE habría disparado el láser 49 veces

**Dónde:** `CaptureMeasurementUseCase` + `HuepaDeviceManager`

`HuepaDeviceManager.measure()` no devuelve una lectura: devuelve una **ráfaga de 7 ya promediada**.
Si la UI se la hubiera pasado al UseCase a través de `IBLEManager.measure()`, el bucle habría pedido
7 ráfagas: **49 disparos por medición**, unos 20 segundos con el operador apuntando al muro, y un
promedio de promedios que ya no es el que el método IQR pretende calcular.

**Corrección:** campo `samples` en la entrada del UseCase, para quien ya tiene las muestras crudas.

---

## 10. Los tests del backup estaban desfasados

**Dónde:** `test/native/backup/ExpoBackupDatabaseUseCase.test.ts`

La implementación había migrado a `VACUUM INTO` y los tests seguían atados a la mecánica anterior
(`serializeAsync` + `writeAsStringAsync` en Base64). **Cuatro tests rojos contra código correcto.**

**Corrección:** reescritos contra la estrategia real. Además, `jest.clearAllMocks()` no borra las
implementaciones de los mocks, así que el `mockImplementation` de un test se filtraba a los
siguientes; se restablece explícitamente en el `beforeEach`.

---

## 11. Las copias de seguridad no se podían restaurar

**Dónde:** producto completo

Ver [[restauracion-en-dispositivo]]. En la práctica, **no había copias de seguridad**.

---

## 12. El test del recuento de DDL se rompía con cada tabla nueva

**Dónde:** `ExpoSQLiteDatabase.test.ts`

Fijaba `expect(execAsync).toHaveBeenCalledTimes(8)`. Cada tabla nueva del schema lo rompía sin que
hubiera nada roto en el código.

**Corrección:** se comprueba contra `ALL_DDL.length`.

---

## Código muerto eliminado

| Qué | Por qué |
|---|---|
| `GestureHandler` + sus tipos de evento + su test | Ninguna pantalla lo usó nunca. El canvas real traduce los toques con `PanResponder` en `PlanCanvasView`. Mantener las dos cosas significaba tener tests verificando un camino que la app no recorre, mientras el camino real no tenía ninguno. |
| `ExpoSQLiteDatabase.serialize()` | Quedó huérfano al migrar el backup a `VACUUM INTO`. |
| `LONG_PRESS_THRESHOLD_MS` | Solo lo usaba `GestureHandler`. |

## Código muerto **wireado** en lugar de eliminado

| Qué | Dónde se usa ahora |
|---|---|
| `SnapHandler` | [[EditorController]] — snap angular del trazo |
| `MiterHandler` | [[EditorController]] — aviso de encuentro agudo |
| `projections.ts` | [[EditorController]] — proyección de un toque sobre un muro (sustituye una copia hecha a mano de la misma aritmética) |
| `CanvasManager` | [[EditorController]] — transformaciones de viewport |
| `uiSlice` y `controlPointsSlice` de Zustand | `SurveyScreen` y `SurveyControlScreen` los escriben; antes eran estado muerto |
