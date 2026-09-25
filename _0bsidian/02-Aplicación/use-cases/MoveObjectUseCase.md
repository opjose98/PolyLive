---
name: MoveObjectUseCase
description: UseCase para mover un muro o columna — recalcula vanos hijos.
type: aplicación
depends-on: "[[Wall-especificación]], [[Column-especificación]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2-3"
tags: #usecase #move #spatial
---

# MoveObjectUseCase

## Resumen
Mueve un Wall o Column a una nueva posición. Si el objeto tiene vanos hijos (Door, Window), recalcula sus offsets relativos para mantener la geometría.

## Interfaz

```typescript
interface MoveObjectUseCase {
  execute(input: MoveObjectInput): Promise<MoveObjectOutput>
}

interface MoveObjectInput {
  objectId: RevitObjectId           // Wall o Column
  newStartPoint?: Point2D            // para Wall (end se mantiene, o se especifica ambos)
  newEndPoint?: Point2D              // para Wall
  newPosition?: Point2D              // para Column
}

interface MoveObjectOutput {
  object: RevitObjectBase
  affectedVanos: RevitObjectId[]    // Doors/Windows que se recalcularon
  commandId: CommandId
}
```

## Flujo especial: Wall con Doors/Windows

```typescript
async execute(input: MoveObjectInput): Promise<MoveObjectOutput> {
  const object = await this.objectStore.readObject(input.objectId)
  
  if (object instanceof Wall) {
    // 1. Calcular delta de movimiento
    const oldStart = object.startPoint
    const newStart = input.newStartPoint || oldStart
    const delta = { x: newStart.x - oldStart.x, y: newStart.y - oldStart.y }
    
    // 2. Aplicar delta
    object.startPoint = newStart
    object.endPoint = input.newEndPoint || { 
      x: object.endPoint.x + delta.x, 
      y: object.endPoint.y + delta.y 
    }
    
    // 3. Recalcular vanos hijos (Doors, Windows)
    const vanos = await this.objectStore.listObjects(object.roomId)
      .then(objs => objs.filter(o => (o instanceof Door || o instanceof Window) && o.parentWallId === object.id))
    
    for (const vano of vanos) {
      // offsetAlongWall puede cambiar si el muro se rotó (no implementado en MVP)
      // Por ahora, solo se traslada
      await this.objectStore.updateObject(vano.id, vano)
    }
    
    // 4. Persistir
    await this.objectStore.updateObject(input.objectId, object)
    
    // 5. Comando
    const command = new MoveObjectCommand(input.objectId, oldStart, newStart, ...)
    this.commandStack.push(command)
    
    return { object, affectedVanos: vanos.map(v => v.id), commandId: command.id }
  }
}
```

---

*Creada: 2026-09-14*