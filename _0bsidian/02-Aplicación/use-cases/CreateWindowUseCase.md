---
name: CreateWindowUseCase
description: UseCase para crear una ventana — idéntico a CreateDoorUseCase.
type: aplicación
depends-on: "[[Window-especificacion]], [[CreateDoorUseCase]]"
mentioned-in: "Maestro §14"
tags: #usecase #window #vano
---

# CreateWindowUseCase

## Resumen
Idéntico a [[CreateDoorUseCase]], pero para ventanas.

## Interfaz

```typescript
interface CreateWindowUseCase {
  execute(input: CreateWindowInput): Promise<CreateWindowOutput>
}

interface CreateWindowInput {
  roomId: RoomId
  parentWallId: WallId
  offsetAlongWall: Meters
  offsetPerpendicular: Meters
  width: Meters
  height: Meters
  windowType?: string
  frameType?: string
  glazing?: string
}

interface CreateWindowOutput {
  window: Window
  warnings: ValidationWarning[]
  commandId: CommandId
}
```

## Flujo

Idéntico a [[CreateDoorUseCase]] — solo cambia el tipo de objeto de Door a Window.

---

*Creada: 2026-09-14*