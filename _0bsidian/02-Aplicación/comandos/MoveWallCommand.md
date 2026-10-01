---
name: MoveWallCommand
description: Comando para mover un muro — almacena posición anterior para undo.
type: aplicación
depends-on: "[[Command-abstracción]], [[Wall-especificacion]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3"
tags: #command #wall #move
---

# MoveWallCommand

## Resumen
Mueve un muro de una posición a otra. Undo restaura la posición anterior.

## Interfaz

```typescript
class MoveWallCommand extends Command {
  type: string = 'MoveWall'
  
  wallId: WallId
  oldStartPoint: Point2D
  oldEndPoint: Point2D
  newStartPoint: Point2D
  newEndPoint: Point2D
  affectedVanos: RevitObjectId[]  // Doors/Windows que se movieron
  
  constructor(wallId: WallId, oldStart: Point2D, oldEnd: Point2D, newStart: Point2D, newEnd: Point2D, vanos: RevitObjectId[]) {
    super()
    this.wallId = wallId
    this.oldStartPoint = oldStart
    this.oldEndPoint = oldEnd
    this.newStartPoint = newStart
    this.newEndPoint = newEnd
    this.affectedVanos = vanos
  }
  
  async execute(): Promise<void> {
    // Ya fue ejecutado por MoveWallUseCase
  }
  
  async undo(): Promise<void> {
    // Restaurar posición anterior
    const wall = await objectStore.readObject(this.wallId)
    wall.startPoint = this.oldStartPoint
    wall.endPoint = this.oldEndPoint
    await objectStore.updateObject(this.wallId, wall)
  }
}
```

---

*Creada: 2026-09-14*