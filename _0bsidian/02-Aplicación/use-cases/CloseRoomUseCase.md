---
name: CloseRoomUseCase
description: UseCase para cerrar un Recinto — ejecuta triangulación CDT, calcula área, materializa Floor implícito.
type: aplicación
depends-on: "[[Room-especificación]], [[CDT-algoritmo]], [[Floor-especificación]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §14, [[RoomValidationService]]"
tags: #usecase #room #close #triangulation
---

# CloseRoomUseCase

## Resumen
Cierra un Recinto:
1. Ejecuta triangulación CDT
2. Calcula área
3. Valida geometría
4. Materializa Floor implícito si no existe
5. Marca Room como cerrado (isOpen = false)

## Interfaz

```typescript
interface CloseRoomUseCase {
  execute(input: CloseRoomInput): Promise<CloseRoomOutput>
}

interface CloseRoomInput {
  roomId: RoomId
}

interface CloseRoomOutput {
  room: Room                        // con area calculada
  floor: Floor                      // implícito si se creó
  warnings: ValidationWarning[]
  commandId: CommandId
}
```

## Flujo

```typescript
async execute(input: CloseRoomInput): Promise<CloseRoomOutput> {
  const room = await this.objectStore.readObject(input.roomId)
  if (!room) throw new Error("Room no existe")
  
  // 1. Obtener columnas como huecos
  const columns = await this.objectStore.listObjects(input.roomId)
    .then(objs => objs.filter(o => o instanceof Column))
  
  const holes = columns.map(col => ({
    center: col.position,
    radius: (col.diameter as number) / 2
  }))
  
  // 2. Triangular
  const triangulation = await this.cdt.triangulate(room.geometry, holes)
  
  // 3. Validar
  const validationResult = this.roomValidationService.validate(room, triangulation, )
  if (!validationResult.valid) throw new ValidationError(...)
  
  // 4. Asignar área y cerrar
  room.area = triangulation.totalArea
  room.isOpen = false
  await this.objectStore.updateObject(input.roomId, room)
  
  // 5. Crear Floor implícito si no existe
  let floor: Floor | null = null
  const floors = await this.objectStore.listObjects(input.roomId)
    .then(objs => objs.filter(o => o instanceof Floor))
  
  if (floors.length === 0) {
    floor = new Floor({
      id: generateId(),
      roomId: input.roomId,
      isImplicit: true,
      material: "default"
    })
    await this.objectStore.createObject(floor)
  }
  
  // 6. Comando
  const command = new CloseRoomCommand(input.roomId, room.geometry, triangulation.totalArea)
  this.commandStack.push(command)
  
  return { room, floor: floor!, warnings: validationResult.warnings, commandId: command.id }
}
```

---

*Creada: 2026-09-14*