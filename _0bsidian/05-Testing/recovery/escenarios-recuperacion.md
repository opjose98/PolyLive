---
name: escenarios-recuperación
description: Testing de crash recovery — WAL, draft reconstruction, state restoration.
type: testing
depends-on: "[[database.ts]], [[CommandStack]], [[SurveyLifecycle]]"
mentioned-in: "Maestro §13, arquitectura-aplicacion-v1.md"
tags: #testing #recovery #resilience
---

# Escenarios de Recuperación

## Crash durante trazo (CREATING state)
- App cierra en medio de polígono
- WAL preserva: partial geometry
- Restart: "Restore last survey?" → YES
  - Reconstruye Room (sin cerrar)
  - Restaura CommandStack (vértices como comandos)
  - Vuelve a CREATING state
- Verify: mismo polígono, mismo stack

## Crash durante edición (EDITING state)
- App cierra después CreateWall + MoveWall
- WAL preserva: ambas operaciones
- Restart: "Restore?" → YES
  - Room existe, Wall existe en posición movida
  - CommandStack tiene 2 comandos
- Verify: estado exacto pre-crash

## Crash durante exportación (EXPORTING state)
- IFC medio generado, interrupción I/O
- Restart: IFC file inválido/incompleto
- Opción: "Delete partial IFC?" → YES
  - Borra archivo
  - Vuelve a EDITING
- Verify: limpio, listo para reintentar

## Corrupción de SQLite
- DB file corrupto (bit-flip, bad sector)
- Detect: intento de lectura falla
- Action: "Create new blank survey?"
  - Borra DB corrupto
  - Crea nuevo vacío
- Verify: listo para nuevo levantamiento

---

*Creada: 2026-09-15*