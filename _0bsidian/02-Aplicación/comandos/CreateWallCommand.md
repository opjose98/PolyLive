---
name: CreateWallCommand
description: Comando para crear un Wall — almacena el muro para undo.
type: aplicación
depends-on: "[[Command-abstracción]], [[Wall-especificación]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3"
tags: #command #wall #create
---

# CreateWallCommand

## Resumen
Ejecuta la creación de un muro. En undo, borra el muro (soft-delete).

## Interfaz

```typescript
class CreateWallCommand extends Command {
  type: string = 'CreateWall'
  
  wall: Wall
  wallId: WallId
  
  constructor(wall: Wall) {
    super()
    this.wall = { ...wall }  // copia profunda
    this.wallId = wall.id
  }
  
  async execute(): Promise<void> {
    // El muro ya fue persistido por el UseCase
    // El comando solo guarda la referencia
  }
  
  async undo(): Promise<void> {
    // Soft-delete el muro
    const wall = await objectStore.readObject(this.wallId)
    wall.is_deleted = true
    await objectStore.updateObject(this.wallId, wall)
  }
  
  async redo(): Promise<void> {
    // Restaurar el muro
    const wall = await objectStore.readObject(this.wallId)
    wall.is_deleted = false
    await objectStore.updateObject(this.wallId, wall)
  }
}
```

## Invariantes

- El muro se persistió ANTES de emitir el comando (en CreateWallUseCase)
- El comando solo es "testigo" de la creación
- `undo()` no borra físicamente, solo marca is_deleted = true

---

*Creada: 2026-09-14*