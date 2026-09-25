---
name: DeleteObjectCommand
description: Comando para borrar un objeto (soft-delete) — almacena el objeto para undo.
type: aplicación
depends-on: "[[Command-abstracción]], [[RevitObjectBase]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3"
tags: #command #delete
---

# DeleteObjectCommand

## Resumen
Marca un objeto como borrado. Undo restaura el objeto y todos sus dependientes.

## Interfaz

```typescript
class DeleteObjectCommand extends Command {
  type: string = 'DeleteObject'
  
  objectId: RevitObjectId
  object: RevitObjectBase                // copia del objeto borrado
  cascade: boolean
  deletedCount: number                   // objeto + dependientes
  deletedObjects: RevitObjectBase[]      // todos los objetos borrados (para undo)
  
  constructor(objectId: RevitObjectId, object: RevitObjectBase, cascade: boolean, deletedCount: number, deletedObjects: RevitObjectBase[]) {
    super()
    this.objectId = objectId
    this.object = { ...object }
    this.cascade = cascade
    this.deletedCount = deletedCount
    this.deletedObjects = deletedObjects.map(o => ({ ...o }))
  }
  
  async undo(): Promise<void> {
    // Restaurar todos los objetos borrados
    for (const obj of this.deletedObjects) {
      obj.is_deleted = false
      await objectStore.updateObject(obj.id, obj)
    }
  }
}
```

---

*Creada: 2026-09-14*