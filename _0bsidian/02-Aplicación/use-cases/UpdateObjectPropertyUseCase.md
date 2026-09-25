---
name: UpdateObjectPropertyUseCase
description: UseCase genérico para actualizar cualquier propiedad de un objeto BIM.
type: aplicación
depends-on: "[[RevitObjectBase]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2-3"
tags: #usecase #generic #update
---

# UpdateObjectPropertyUseCase

## Resumen
UseCase genérico que permite actualizar cualquier propiedad de un objeto BIM (Wall, Column, Door, etc.).

## Interfaz

```typescript
interface UpdateObjectPropertyUseCase {
  execute(input: UpdateObjectPropertyInput): Promise<UpdateObjectPropertyOutput>
}

interface UpdateObjectPropertyInput {
  objectId: RevitObjectId
  property: string                   // ej. "thickness", "material", "width"
  newValue: any
}

interface UpdateObjectPropertyOutput {
  object: RevitObjectBase
  warnings: ValidationWarning[]
  commandId: CommandId
}
```

## Flujo

```typescript
async execute(input: UpdateObjectPropertyInput): Promise<UpdateObjectPropertyOutput> {
  // 1. Leer objeto
  const object = await this.objectStore.readObject(input.objectId)
  if (!object) throw new Error("Objeto no existe")
  
  // 2. Actualizar propiedad
  const oldValue = object[input.property]
  object[input.property] = input.newValue
  
  // 3. Validar (según tipo de objeto)
  const validationResult = await this.validateObjectByType(object)
  if (!validationResult.valid) throw new ValidationError(...)
  
  // 4. Persistir
  await this.objectStore.updateObject(input.objectId, object)
  
  // 5. Comando (con oldValue para undo)
  const command = new UpdateObjectPropertyCommand(input.objectId, input.property, oldValue, input.newValue)
  this.commandStack.push(command)
  
  return { object, warnings: validationResult.warnings, commandId: command.id }
}
```

## Invariantes

- El oldValue se guarda en el comando para undo
- Validación ocurre ANTES de persistencia
- Si validación falla, no se persiste nada

---

*Creada: 2026-09-14*