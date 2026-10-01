---
name: CreateWallUseCase
description: UseCase para crear un muro — orquesta validación, persistencia, emisión de comando.
type: aplicación
depends-on: "[[Wall-especificacion]], [[WallValidationService]], [[CreateWallCommand]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2-3"
tags: #usecase #wall #core
---

# CreateWallUseCase

## Resumen
Orquesta el flujo completo de creación de un muro:
1. Validar que el muro es válido
2. Persistir en SQLite (IObjectStore)
3. Emitir comando para undo/redo
4. Retornar el muro creado con ID asignado

## Interfaz

```typescript
interface CreateWallUseCase {
  execute(input: CreateWallInput): Promise<CreateWallOutput>
}

interface CreateWallInput {
  roomId: RoomId
  startPoint: Point2D
  endPoint: Point2D
  thickness: Meters
  height: Meters
  material?: string
}

interface CreateWallOutput {
  wall: Wall
  warnings: ValidationWarning[]
  commandId: CommandId  // para undo/redo
}
```

## Flujo

```typescript
async execute(input: CreateWallInput): Promise<CreateWallOutput> {
  // 1. Crear objeto Wall temporal
  const wall = new Wall({
    id: generateId(),
    roomId: input.roomId,
    startPoint: input.startPoint,
    endPoint: input.endPoint,
    thickness: input.thickness,
    height: input.height,
    material: input.material
  })
  
  // 2. Validar
  const validationResult = this.wallValidationService.validate(wall, context)
  if (!validationResult.valid) {
    throw new ValidationError(validationResult.warnings)
  }
  
  // 3. Persistir
  const wallId = await this.objectStore.createObject(wall)
  wall.id = wallId
  
  // 4. Emitir comando
  const command = new CreateWallCommand(wall)
  this.commandStack.push(command)
  
  // 5. Retornar
  return {
    wall,
    warnings: validationResult.warnings,
    commandId: command.id
  }
}
```

## Invariantes

- Si validación falla, NO se persiste nada (transacción atómica)
- El comando se emite DESPUÉS de persistencia (no antes)
- Si persistencia falla, se lanza excepción (no se emite comando)

## Relacionado con

- [[Wall-especificacion]] — objeto que crea
- [[WallValidationService]] — validación
- [[CreateWallCommand]] — comando para undo/redo
- [[IObjectStore]] — persistencia
- [[CommandStack]] — orquestación de undo/redo

---

*Creada: 2026-09-14*