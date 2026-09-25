---
name: tests-comandos
description: Test suite para comando pattern — execute, undo, redo, FIFO.
type: testing
depends-on: "[[Command-abstracción]], [[CommandStack]], [[estrategia-unit-testing]]"
mentioned-in: "Spike #5 completado"
tags: #testing #commands #undo-redo
---

# Tests — Comandos

## Patrón Command
Para cada comando (CreateWall, MoveObject, etc.):

1. execute() — acción realizada correctamente
2. undo() — estado restaurado a pre-state
3. canUndo() — retorna true/false según tipo
4. Idempotencia — execute + undo + execute = mismo resultado

## CommandStack
1. execute(cmd) → cmd en stack
2. undo() → cmd en undoneStack
3. redo() → cmd back a stack
4. New command después undo → undoneStack limpio
5. Size() × 100 → FIFO, limpia oldest
6. clear() → both stacks vacíos

## Transactionalidad
- execute() falla → no persiste nada
- undo() falla → rollback
- Secuencia: cmd1 + cmd2, undo ambos → estado original

---

*Creada: 2026-09-15*