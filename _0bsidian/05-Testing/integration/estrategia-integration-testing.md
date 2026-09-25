---
name: estrategia-integration-testing
description: Tests que validan flujos completos entre capas.
type: testing
depends-on: "[[CreateWallUseCase]], [[ObjectStore]], [[CanvasManager]], [[estrategia-unit-testing]]"
mentioned-in: "Spike #2-5 completados"
tags: #testing #integration #workflows
---

# Estrategia Integration Testing

## Flujos End-to-End

### CreateWall Workflow
1. UI: User drags on Canvas
2. Canvas: CanvasManager.screenToWorld()
3. Application: CreateWallUseCase.execute(input)
4. Domain: WallValidationService.validate()
5. Infrastructure: ObjectStore.createObject()
6. Application: CommandStack.execute(CreateWallCommand)
7. State: Zustand updates
8. UI: Re-renders

Test: Verificar que Wall existe en DB + command en stack + state actualizado

### Undo Workflow
1. User: taps Undo
2. State: CommandStack.undo()
3. Command: undo() reversa operación
4. Infrastructure: ObjectStore.updateObject()
5. State: Zustand reflects change
6. UI: Wall desaparece

Test: Verificar estado idéntico a pre-Wall

## Transacciones
- Si validación falla: no persiste, no comanda
- Si persistencia falla: rollback automático

---

*Creada: 2026-09-15*