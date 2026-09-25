---
name: ProjectService
description: Casos de uso de Proyectos y Espacios. Por qué es un service y no un UseCase por operación.
type: aplicación
depends-on: "[[Project-especificacion]], [[Room-especificacion]]"
mentioned-in: "[[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]]"
tags: #aplicación #proyecto #portado-de-levon
---

# ProjectService

## Por qué un *service* y no un UseCase por operación

Los UseCases de este proyecto existen para orquestar **operaciones BIM que pasan por el
[[CommandStack]]**: crear un muro emite un `CreateWallCommand` con su undo.

Las operaciones sobre proyectos son **CRUD de metadatos**: no tienen inversa geométrica, no entran
en Undo/Redo y no tocan el modelo BIM. Convertir cada una en su propia clase habría producido seis
archivos de veinte líneas con un solo `await` cada uno, sin ganar nada de lo que el patrón Command
aporta.

Lo que sí hace este servicio y no hace un store: **coordinar dos almacenes** (`ProjectStore` y
`ObjectStore`) para que un espacio nuevo tenga a la vez su Recinto real y su fila de pertenencia al
proyecto.

## Operaciones

```
createProject / listProjects / listProjectSummaries / readProject / updateProject / deleteProject
createSpace / listSpaceDetails / updateSpace / removeSpace / projectOfRoom
adoptOrphanRooms
```

## Decisiones

### Borrar nunca destruye el levantamiento

- `deleteProject` → soft-delete del proyecto y de sus vínculos. **Los Recintos no se tocan.**
- `removeSpace` → quita el espacio del proyecto. El Recinto y todo lo dibujado siguen existiendo.

En ambos casos el Recinto queda huérfano y se puede readoptar. Borrar el levantamiento de verdad es
otra operación, y debe pedirse explícitamente.

### Los resúmenes se calculan en DOS consultas, no N+1

`listProjectSummaries()` agrega espacios, superficie cerrada y espacios abiertos con un `LEFT JOIN`.
La alternativa —cargar los objetos de cada Recinto de cada proyecto desde la pantalla— significa
decenas de consultas para pintar una lista, y en un dispositivo de campo eso se nota.

### Un espacio roto se muestra, no se oculta

`listSpaceDetails` devuelve `room: null` cuando la fila de relación apunta a un Recinto inexistente.
Ocultarlo dejaría una **fila fantasma que nadie puede ver ni limpiar**; la pantalla lo muestra como
"espacio sin datos" y ofrece quitarlo.

### `adoptOrphanRooms` es idempotente

Sin huérfanos no crea nada y devuelve `null`. Eso permite llamarla en cada arranque sin acumular
proyectos vacíos.

## Numeración de códigos

Los códigos de espacio (`SPC001`) son únicos **dentro de su proyecto**, no globalmente: el código
identifica el espacio dentro de su obra. Dos proyectos distintos pueden tener ambos un `SPC001`.

## Código

- `src/application/projects/ProjectService.ts`
- `src/infrastructure/sqlite/ProjectStore.ts`

## Tests

`test/projects/ProjectService.test.ts` — 34 tests contra SQLite real.
