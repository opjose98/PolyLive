---
name: UpdateWallThicknessCommand
description: Comando para actualizar el espesor de un muro — almacena valor anterior para undo.
type: aplicación
depends-on: "[[Command-abstracción]], [[Wall-especificación]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3"
tags: #command #wall #property
---

# UpdateWallThicknessCommand

## Resumen
Cambia el espesor de un muro. Undo restaura el espesor anterior.

## Interfaz

```typescript
class UpdateWallThicknessCommand extends Command {
  type: string = 'UpdateWallThickness'
  
  wallId: WallId
  oldThickness: Meters
  newThickness: Meters
  
  constructor(wallId: WallId, oldThickness: Meters, newThickness: Meters) {
    super()
    this.wallId = wallId
    this.oldThickness = oldThickness
    this.newThickness = newThickness
  }
  
  async undo(): Promise<void> {
    const wall = await objectStore.readObject(this.wallId)
    wall.thickness = this.oldThickness
    await objectStore.updateObject(this.wallId, wall)
  }
}
```

## Patrón genérico

Este patrón se repite para todos los comandos de actualización de propiedades:
- UpdateWallMaterial
- UpdateDoorWidth
- UpdateColumnDiameter
- etc.

Todos almacenan: objectId, oldValue, newValue.

---

*Creada: 2026-09-14*