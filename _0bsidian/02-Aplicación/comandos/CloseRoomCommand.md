---
name: CloseRoomCommand
description: Comando para cerrar un Recinto — almacena área anterior (nullptr) para undo.
type: aplicación
depends-on: "[[Command-abstracción]], [[Room-especificación]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3"
tags: #command #room #close
---

# CloseRoomCommand

## Resumen
Cierra un Recinto (calcula área, materializa Floor). Undo abre el Recinto de nuevo.

## Interfaz

```typescript
class CloseRoomCommand extends Command {
  type: string = 'CloseRoom'
  
  roomId: RoomId
  geometry: Point2D[]               // polígono del Recinto
  calculatedArea: SquareMeters      // área calculada
  floorId: FloorId | null           // si se creó Floor implícito
  
  async undo(): Promise<void> {
    const room = await objectStore.readObject(this.roomId)
    room.isOpen = true              // reabre el Recinto
    room.area = null
    await objectStore.updateObject(this.roomId, room)
    
    // Si Floor fue implícito, borrar
    if (this.floorId) {
      const floor = await objectStore.readObject(this.floorId)
      floor.is_deleted = true
      await objectStore.updateObject(this.floorId, floor)
    }
  }
}
```

---

*Creada: 2026-09-14*