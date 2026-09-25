---
name: Command-abstracción
description: Interfaz base Command — execute() y undo() implementados por los 18 comandos del sistema.
type: aplicación
depends-on: "[[RevitObjectBase]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2"
tags: #command #core #undo-redo
---

# Command — Abstracción Base

## Resumen
Todos los comandos implementan la interfaz Command con dos métodos:
- `execute()` — realiza la acción
- `undo()` — revierte la acción

El patrón Command permite deshacer/rehacer cualquier operación.

## Interfaz

```typescript
interface ICommand {
  id: CommandId
  type: string                      // ej. 'CreateWall', 'UpdateWallThickness'
  timestamp: Date
  execute(): Promise<void>
  undo(): Promise<void>
  canUndo(): boolean                // algunos comandos no son reversibles
}

abstract class Command implements ICommand {
  id: CommandId = generateId()
  timestamp: Date = new Date()
  abstract type: string
  
  abstract execute(): Promise<void>
  abstract undo(): Promise<void>
  
  canUndo(): boolean {
    return true  // override si no es reversible
  }
}
```

## Invariantes

- Un comando una vez ejecutado es inmutable (sus datos históricos no cambian)
- `execute()` solo se llama una vez (el CommandStack lo orquesta)
- `undo()` reversa exactamente lo que `execute()` hizo
- `execute()` + `undo()` + `execute()` = estado original (idempotencia)

## Tipos de comandos

Los 18 comandos se organizan en categorías:

| Categoría | Comandos | Reversible |
|---|---|---|
| Creación | CreateWall, CreateColumn, CreateDoor, CreateWindow, CreateFloor | ✅ |
| Movimiento | MoveWall, MoveColumn | ✅ |
| Propiedades | UpdateWallThickness, UpdateWallMaterial, UpdateObjectProperty | ✅ |
| Borrado | DeleteObject | ✅ |
| Recinto | CloseRoom | ✅ |
| Auditoría | CapturePhoto, LinkPhoto | ✅ |
| Validación | ApplyWarning (especial, ver nota) | ⚠️ |

---

## Relacionado con

- [[CreateWallCommand]], [[MoveWallCommand]], etc. — implementaciones específicas
- [[CommandStack]] — gestor de undo/redo
- [[arquitectura-aplicacion-v1.md]] — lista de 18 comandos

---

*Creada: 2026-09-14*