---
name: flujos-integración-documentados
description: Documentación de 8 flujos de integración principales para testing.
type: testing
depends-on: "[[estrategia-integration-testing]]"
mentioned-in: "Spike #2-5"
tags: #testing #integration #workflows
---

# Flujos de Integración Documentados

## 1. CreateWall
Canvas → UseCase → Validate → Persist → Command → State ✅ Spike #5

## 2. MoveObject
Canvas drag → CanvasManager → MoveObjectUseCase → Persist → Command ✅ Spike #5

## 3. CloseRoom
UseCase → CDT (worker) → Calculate area → Create Floor → Persist ✅ Spike #5

## 4. ExportIfc
UseCase → Compatibility gate → IFCSerializer → Write file ✅ Spike #3

## 5. Undo/Redo
CommandStack.undo() → Command.undo() → Persist → State update ✅ Spike #5

## 6. BLE Measurement
Gesture (measure mode) → BLE capture 7x → Average → Store ✅ Spike #4 UI

## 7. Photo Capture + Link
CapturePhotoUseCase → Write file + DB record → LinkPhotoCommand ✅ Spike #5

## 8. Multi-step transaction
CreateWall + CreateDoor + CloseRoom → 1 transaction, undo reversa todos ✅

---

*Creada: 2026-09-15*