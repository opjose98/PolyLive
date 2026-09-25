---
name: transiciones-máquina
description: Tabla completa de transiciones válidas entre estados — qué acción pasa de qué estado a cuál.
type: aplicación
depends-on: "[[SurveyLifecycle]], [[SurveyInteractionMode]]"
mentioned-in: "arquitectura-aplicacion-v1.md §14"
tags: #estado #transición #matriz
---

# Transiciones de Máquina de Estados

## Tabla maestra

| Desde | Acción | A | Condición |
|---|---|---|---|
| IDLE | Seleccionar Recinto existente | EDITING | Recinto existe, sin crash |
| IDLE | Crear Recinto nuevo | CREATING | — |
| IDLE | Exportar Recinto | EXPORTING | Recinto cerrado y válido |
| IDLE | Recuperar de crash | RECOVERING | Draft incompleto en WAL |
| CREATING | Agregar vértice | CREATING | Vértice válido (no duplicado) |
| CREATING | Cerrar Recinto | EDITING | >= 3 vértices, polígono válido |
| CREATING | Deshacer (undo) | CREATING | CommandStack.canUndo() |
| CREATING | Cancelar trazo | IDLE | Usuario presiona "Cancel" |
| EDITING | Crear muro | EDITING | — |
| EDITING | Crear columna | EDITING | — |
| EDITING | Mover objeto | EDITING | Comando MoveObjectCommand |
| EDITING | Capturar foto | EDITING | — |
| EDITING | Capturar medición | EDITING | BLE disponible |
| EDITING | Deshacer (undo) | EDITING | CommandStack.canUndo() |
| EDITING | Exportar Recinto | EXPORTING | Validación pasó |
| EDITING | Volver a IDLE | IDLE | Usuario presiona "Done" o "Discard" |
| EXPORTING | Exportación completa | IDLE | IFC guardado exitosamente |
| EXPORTING | Error en exportación | EDITING | Validación o I/O falló (retry) |
| EXPORTING | Cancelar exportación | EDITING | Usuario presiona "Cancel" |
| RECOVERING | Restaurar draft | EDITING | Usuario selecciona "Restore" |
| RECOVERING | Restaurar (sin cerrar) | CREATING | Draft estaba en trazo (no cerrado) |
| RECOVERING | Descartar draft | IDLE | Usuario selecciona "Discard" |

## Transiciones prohibidas (rechazadas)

No se puede ir de CREATING a EXPORTING sin cerrar primero.
No se puede cambiar entre MEASURE/AUDIT sin volver a DRAW primero.
No se puede entrar en EDITING mientras se exporta (EXPORTING).
No se puede cambiar de Recinto si hay uno en edición sin cerrar primero.

## Errores y recuperación

EXPORTING + error I/O → EDITING (con warning)
- Usuario puede retry o descartar

RECOVERING + validación falla → IDLE
- Draft está corrupto, no se puede restaurar

## Invariantes de transición

- Una transición es atómica (no puede quedarse "a mitad")
- Presionar "Cancel" dos veces = resultado igual
- Al cambiar de estado, el modo vuelve a DRAW
- Al ir a IDLE, se borra el CommandStack (salvo si va a EXPORTING)

---

## Diagrama de estados

IDLE → CREATING
IDLE → EDITING (seleccionar existente)
IDLE → EXPORTING
IDLE ← EDITING (cancelar)
IDLE ← RECOVERING (descartar)
CREATING → EDITING (cerrar Recinto)
CREATING ← IDLE (cancelar trazo)
EDITING → EXPORTING (exportar)
EDITING → IDLE (cerrar sesión)
RECOVERING → EDITING (restaurar cerrado)
RECOVERING → CREATING (restaurar abierto)
RECOVERING → IDLE (descartar)
EXPORTING → IDLE (completado)
EXPORTING → EDITING (error)

---

## Relacionado con

- [[SurveyLifecycle]] — definición de estados
- [[SurveyInteractionMode]] — modos dentro de estados
- [[CommandStack]] — undo/redo como transiciones

---

*Creada: 2026-09-14*