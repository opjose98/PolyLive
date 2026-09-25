---
name: CreateColumnUseCase
description: UseCase para crear una columna — similar a CreateWallUseCase pero sin validación de cruce.
type: aplicación
depends-on: "[[Column-especificación]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2-3"
tags: #usecase #column
---

# CreateColumnUseCase

## Resumen
Idéntico a [[CreateWallUseCase]], pero para columnas. **Sin validación de cruce** (las columnas pueden superponerse).

## Interfaz

```typescript
interface CreateColumnUseCase {
  execute(input: CreateColumnInput): Promise<CreateColumnOutput>
}

interface CreateColumnInput {
  roomId: RoomId
  position: Point2D
  diameter: Meters
  height: Meters
  embeddedInWallId?: WallId
  material?: string
}

interface CreateColumnOutput {
  column: Column
  warnings: ValidationWarning[]
  commandId: CommandId
}
```

## Diferencia con CreateWallUseCase

- **No hay validación de cruce** con otras columnas o muros
- **Sin detección de encuentro** (Miter)
- **Sin snap angular**
- **Validación mínima:** dimensiones > 0, roomId válido

## Flujo

```typescript
async execute(input: CreateColumnInput): Promise<CreateColumnOutput> {
  const column = new Column({
    id: generateId(),
    roomId: input.roomId,
    position: input.position,
    diameter: input.diameter,
    height: input.height,
    embeddedInWallId: input.embeddedInWallId,
    material: input.material
  })
  
  // Validación mínima
  const validationResult = this.columnValidationService.validate(column)
  if (!validationResult.valid) throw new ValidationError(...)
  
  // Persistencia + comando (igual a Wall)
  const columnId = await this.objectStore.createObject(column)
  column.id = columnId
  
  const command = new CreateColumnCommand(column)
  this.commandStack.push(command)
  
  return { column, warnings: validationResult.warnings, commandId: command.id }
}
```

## Relacionado con

- [[Column-especificación]]
- [[CreateWallUseCase]] — patrón idéntico
- [[matriz-reglas-de-negocio]] — sin restricciones de cruce

---

*Creada: 2026-09-14*