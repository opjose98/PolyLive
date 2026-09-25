---
name: Project-especificación
description: Proyecto y Espacio — la raíz de organización del trabajo. Portado de LevON.
type: dominio
depends-on: "[[Room-especificacion]], [[RevitObjectBase]]"
mentioned-in: "[[ProjectService]], [[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]]"
tags: #objetos-bim #proyecto #portado-de-levon
---

# Project — Especificación de Proyecto y Espacio

## Por qué existe

Antes de esta entidad, PolyLive modelaba "proyecto" como **una lista plana de Recintos**. La propia
cabecera de `DashboardScreen.tsx` lo decía: *"no existe ninguna entidad Project en el dominio ni en
el esquema SQLite — inventar una sería una decisión de modelo de datos mayor sin especificación
previa"*.

Eso funciona para un levantamiento suelto y se rompe en cuanto hay **dos obras a la vez**: los
Recintos de la nave industrial y los del chalet aparecen mezclados en la misma lista, sin forma de
exportar "todo el proyecto", sin autor, sin disciplina y sin código BIM.

LevON ya resolvía esto con `Project` + multi-espacio, y es el modelo que se porta aquí.

## Correspondencia LevON → PolyLive

| LevON | PolyLive |
|---|---|
| `Project` | `Project` |
| `SpaceGeometry` | un `Room` referenciado por `ProjectSpace` |
| `Project.walls`, `Project.columns` | los objetos del `Room` correspondiente |
| `BimCodeGenerator` | `generateBimCode` / `generateProjectCode` / `generateSpaceCode` |

## Modelo

```typescript
class Project {
  readonly id: ProjectId
  bimCode: string            // BIM001, ARC042 — único entre proyectos VIVOS
  name: string               // no vacío
  description: string
  discipline: BimDiscipline  // lista cerrada, no texto libre
  author: string
  created_at / updated_at / is_deleted
}

class ProjectSpace {
  readonly projectId: ProjectId
  readonly roomId: string    // REFERENCIA al Recinto, no una copia de su geometría
  bimCode: string            // SPC001 — único DENTRO de su proyecto
  name: string
  orderIndex: number
}
```

## Decisiones de diseño

### `ProjectSpace` referencia un `Room`, no contiene geometría

Duplicar los muros dentro del proyecto crearía **dos fuentes de verdad** para la misma geometría.
Es la clase de problema que no se arregla después.

### La disciplina es una lista cerrada

Como texto libre, `Arquitectura`, `arquitectura` y `ARQ` se convierten en tres disciplinas distintas
al filtrar o exportar.

### El código BIM reutiliza huecos

`generateBimCode` busca el primer código **ausente**, no `max + 1`. Un contador dejaría huecos
permanentes (borrar BIM002 lo perdería para siempre) y llegaría antes al tope de tres dígitos.
Al agotar los tres dígitos pasa a cuatro (`BIM1000`) en vez de caer a un timestamp como hacía
LevON: `BIM1000` mantiene la forma legible del código, `BIM48213` parece un identificador interno.

### La unicidad del código NO es un `UNIQUE` del schema

Solo compiten los proyectos **vivos**. Un proyecto soft-deleted conserva su código, y un `UNIQUE`
impediría reutilizarlo al borrar el proyecto y crear otro. La comprobación vive en `ProjectStore`.

## Invariantes

- `name` no vacío (validado en el constructor)
- `bimCode` cumple `^[A-Z]{2,5}[0-9]{1,6}$`, normalizado a mayúsculas sin espacios
- `bimCode` único entre proyectos vivos (garantizado por `ProjectStore`)
- `is_deleted = true` es soft-delete: **sus Recintos NO se borran** — quedan huérfanos y se pueden
  readoptar. Borrar la carpeta no destruye lo que hay dentro.

## Persistencia

Dos tablas nuevas, ambas **aditivas** (`CREATE TABLE IF NOT EXISTS`): las bases ya existentes las
aceptan sin migrar ni una fila.

- `projects`
- `project_spaces` — PK compuesta `(project_id, room_id)`

No se añadió una columna `project_id` a `revit_objects` porque el espacio tiene datos propios que no
pertenecen al Recinto (su código BIM, su nombre de espacio, su orden de presentación), y añadir la
columna habría exigido un `ALTER TABLE` sobre la tabla más grande y más crítica del sistema.

## Adopción de Recintos anteriores

`ProjectService.adoptOrphanRooms()` se llama al arrancar (`src/ui/App.tsx`). Sin ella, al actualizar
la app el operador abriría la pantalla de Proyectos, la vería vacía, y **todo su trabajo anterior
quedaría inalcanzable** — seguiría en la base, sin ninguna pantalla desde la que llegar a él.

Es idempotente: sin huérfanos no crea nada.

## Código

- `src/domain/objects/project.ts`
- `src/infrastructure/sqlite/ProjectStore.ts`
- `src/application/projects/ProjectService.ts` — ver [[ProjectService]]
- `src/ui/screens/ProjectsScreen.tsx`, `src/ui/screens/ProjectWorkspaceScreen.tsx`

## Tests

`test/projects/ProjectService.test.ts` — 34 tests contra SQLite real.
