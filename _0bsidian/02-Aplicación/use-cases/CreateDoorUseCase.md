---
name: CreateDoorUseCase
description: UseCase para crear una puerta — requiere Wall padre, valida limites del muro.
type: aplicación
depends-on: "[[Door-especificación]], [[proyecciones-punto-muro]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2-3"
tags: #usecase #door #vano
---

# CreateDoorUseCase

## Resumen
Crea una puerta dentro de un muro. **Requiere Wall padre válido.** Valida que la puerta no sobresale excesivamente del muro.

## Interfaz

```typescript
interface CreateDoorUseCase {
  execute(input: CreateDoorInput): Promise<CreateDoorOutput>
}

interface CreateDoorInput {
  roomId: RoomId
  parentWallId: WallId              // REQUERIDO
  offsetAlongWall: Meters
  offsetPerpendicular: Meters
  width: Meters
  height: Meters
  doorType?: string
  material?: string
}

interface CreateDoorOutput {
  door: Door
  warnings: ValidationWarning[]
  commandId: CommandId
}
```

## Validación especial

1. **Wall padre existe:** Si no existe → error bloqueante
2. **Dentro de limites:** Si sobresale → warning (no bloqueante)
3. **Dimensiones válidas:** width > 0, height > 0

## Flujo

```typescript
async execute(input: CreateDoorInput): Promise<CreateDoorOutput> {
  // 1. Verificar Wall padre
  const parentWall = await this.objectStore.readObject(input.parentWallId)
  if (!parentWall) throw new Error("Wall padre no existe")
  
  // 2. Crear puerta
  const door = new Door({
    id: generateId(),
    roomId: input.roomId,
    parentWallId: input.parentWallId,
    offsetAlongWall: input.offsetAlongWall,
    offsetPerpendicular: input.offsetPerpendicular,
    width: input.width,
    height: input.height,
    doorType: input.doorType,
    material: input.material
  })
  
  // 3. Validar
  const validationResult = this.doorValidationService.validate(door, { walls: [parentWall] })
  if (!validationResult.valid) throw new ValidationError(...)
  
  // 4. Persistir
  const doorId = await this.objectStore.createObject(door)
  door.id = doorId
  
  // 5. Comando
  const command = new CreateDoorCommand(door)
  this.commandStack.push(command)
  
  return { door, warnings: validationResult.warnings, commandId: command.id }
}
```

## Relacionado con

- [[Door-especificación]]
- [[Wall-especificación]] — padre requerido
- [[proyecciones-punto-muro]] — cálculo de offsets

---

*Creada: 2026-09-14*