---
name: restauracion-en-dispositivo
description: Restaurar una copia de seguridad en el dispositivo. Por qué era posible y se creía que no.
type: infraestructura
depends-on: "[[backup-integridad]], [[escenarios-recuperacion]]"
mentioned-in: "[[mapa-de-navegacion]], [[bugs-corregidos-unificacion]]"
tags: #infraestructura #backup #restore
---

# Restauración en el dispositivo

## El problema

La restauración estaba declarada explícitamente como **fuera de alcance** en la cabecera de
`ExpoBackupDatabaseUseCase`, con este argumento:

> *"expo-sqlite no expone API pública para cargar un backup sobre una base con nombre ya existente
> en disco."*

Eso es **cierto** y también es **irrelevante**: la restauración no necesita ninguna API de SQLite.

El resultado era un producto que hacía copias de seguridad que **nadie podía restaurar desde el
dispositivo** — es decir, en la práctica, sin copias de seguridad.

## La solución

Una base SQLite es **un archivo**. `expo-sqlite` lo coloca en una ruta conocida y estable dentro del
sandbox de la app, y `expo-file-system` sabe copiar archivos.

```
${documentDirectory}SQLite/<nombre>
```

## Procedimiento

1. **Cerrar la conexión.** Obligatorio: sobrescribir el archivo de una base con una conexión viva es
   la forma más directa de corromperla — justo lo que esto viene a arreglar.
2. **Borrar los sidecars `-wal` y `-shm`.**
3. **Copiar** el backup sobre el archivo principal.
4. **Reiniciar la app** (`Updates.reloadAsync()`), porque todo el árbol de React tiene referencias a
   servicios construidos sobre la conexión vieja.

## Por qué el paso 2 es imprescindible

La app abre la base en modo WAL (`PRAGMA journal_mode = WAL`), así que junto al archivo principal
hay un `-wal` con transacciones aún no integradas.

Si se sustituye **solo** el archivo principal, SQLite encuentra al abrir un `-wal` que pertenece a
**otra** base, con otro número de generación:

- en el mejor caso, rechaza abrirla
- **en el peor, aplica ese WAL encima del backup y resucita exactamente los datos que se querían
  descartar**

El backup que produce `VACUUM INTO` es un archivo autocontenido en journal-mode DELETE, así que no
necesita sidecars propios.

## Orden de los backups: por NOMBRE, no por mtime

El nombre lleva un timestamp ISO escrito en el momento de crear el backup. El `mtime` lo puede
reescribir cualquier cosa: una sincronización, una copia, una restauración del propio sistema
operativo.

`parseTimestampFromName` devuelve `null` si el nombre no lleva marca de tiempo, en vez de una fecha
inventada: **una fecha falsa en la lista llevaría a restaurar el archivo equivocado.**

## Validaciones antes de tocar nada

- El backup elegido debe **existir y tener tamaño > 0**. Un archivo de 0 bytes sobrescribiendo la
  base destruiría el trabajo del día para "restaurar" una nada.
- Si el directorio `SQLite/` no existe, se crea: restaurar puede ser lo primero que se hace tras
  reinstalar la app.

## Qué ve el operador

La pantalla de Ajustes lista cada copia con su fecha y su tamaño, y advierte antes de restaurar:

- se sustituye **toda** la base de datos
- se pierde cualquier trabajo posterior a esa copia
- la app se reiniciará
- **recomendación: crear una copia AHORA antes de restaurar**, para poder volver atrás

## Efecto colateral del cambio: el backup manual ya funciona en escritorio

Con `VACUUM INTO`, el backup solo necesita `exec()`, que forma parte del contrato genérico
`IDatabase`. La versión anterior pedía el tipo concreto `ExpoSQLiteDatabase` porque llamaba a
`serializeAsync()`, y eso obligaba a `SettingsScreen` a hacer un `instanceof` y a **negar el backup
manual fuera del dispositivo**.

## Código

- `src/native/backup/ExpoRestoreDatabaseUseCase.ts`
- `src/native/backup/ExpoBackupDatabaseUseCase.ts`
- `src/ui/screens/SettingsScreen.tsx`

## Tests

`test/native/backup/ExpoRestoreDatabaseUseCase.test.ts` — 18 tests, incluido el que verifica que los
sidecars se borran **antes** de copiar.
