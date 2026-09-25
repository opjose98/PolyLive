---
name: DeleteObjectUseCase
description: UseCase para borrar un objeto (soft-delete con cascada para vanos hijos).
type: aplicación
depends-on: "[[RevitObjectBase]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, [[matriz-reglas-de-negocio]]"
tags: #usecase #delete #soft-delete
---

# DeleteObjectUseCase

## Resumen
Realiza soft-delete: marca el objeto como borrado pero no lo elimina de SQLite. Si el objeto tiene dependientes (ej. Wall con Doors), también los borra.

## Interfaz

```typescript
interface DeleteObjectUseCase {
  execute(input: DeleteObjectInput): Promise<DeleteObjectOutput>
}

interface DeleteObjectInput {
  objectId: RevitObjectId
  cascade: boolean                  // ¿borrar dependientes? (default: true)
}

interface DeleteObjectOutput {
  deletedCount: number              // objeto + dependientes borrados
  commandId: CommandId
}
```

## Flujo

```typescript
async execute(input: DeleteObjectInput): Promise<DeleteObjectOutput> {
  const object = await this.objectStore.readObject(input.objectId)
  if (!object) throw new Error("Objeto no existe")
  
  let deletedCount = 1
  
  // Si es Wall y cascade=true, borrar vanos hijos
  if (object instanceof Wall && input.cascade) {
    const vanos = await this.objectStore.listObjects(object.roomId)
      .then(objs => objs.filter(o => o.parentWallId === object.id))
    
    for (const vano of vanos) {
      vano.is_deleted = true
      await this.objectStore.updateObject(vano.id, vano)
      deletedCount++
    }
  }
  
  // Soft-delete el objeto
  object.is_deleted = true
  await this.objectStore.updateObject(input.objectId, object)
  
  // Comando
  const command = new DeleteObjectCommand(input.objectId, object, input.cascade, deletedCount)
  this.commandStack.push(command)
  
  return { deletedCount, commandId: command.id }
}
```

## Invariantes

- Nunca se borra físicamente (is_deleted = true, no DELETE en SQL)
- Cascade automático para dependientes (Doors/Windows si Wall se borra)
- El undo restaura el objeto y todos sus dependientes

---

*Creada: 2026-09-14*