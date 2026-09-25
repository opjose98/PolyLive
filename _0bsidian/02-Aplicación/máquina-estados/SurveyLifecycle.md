---
name: SurveyLifecycle
description: Estados del ciclo de vida del Levantamiento — idle, creating, editing, recovering, exporting.
type: aplicación
depends-on: "[[Room-especificación]], [[CommandStack]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §14"
tags: #estado #lifecycle #máquina
---

# SurveyLifecycle — Estados del Levantamiento

## Resumen
Un levantamiento (Survey) transita por 5 estados principales que representan qué puede hacer el usuario en cada momento.

## Estados

```typescript
type SurveyState = 'idle' | 'creating' | 'editing' | 'recovering' | 'exporting'
```

**IDLE** — Sin Recinto abierto, esperando selección
**CREATING** — Creando un Recinto nuevo (trazo activo)
**EDITING** — Recinto cerrado, editando objetos (muros, puertas, etc.)
**RECOVERING** — Recuperando de crash (WAL, draft incompleto)
**EXPORTING** — Exportando IFC (UI bloqueada)

## Descripción de estados

### IDLE (inicial)
- No hay Recinto abierto
- Usuario puede:
  - Seleccionar Recinto existente → EDITING
  - Crear Recinto nuevo → CREATING
  - Exportar Recinto existente → EXPORTING
- CommandStack: vacío

### CREATING
- Usuario está trazando un Recinto nuevo (agregando vértices)
- Cada vértice → comando en CommandStack
- Usuario puede:
  - Agregar otro vértice → sigue en CREATING
  - Cerrar el Recinto → EDITING
  - Deshacer (undo) últimos vértices → sigue en CREATING
  - Cancelar trazo → IDLE (borra todos los comandos del trazo)

### EDITING
- Recinto está cerrado, área calculada
- Usuario puede:
  - Agregar/editar/mover muros, columnas, puertas
  - Capturar fotos
  - Hacer undo/redo
  - Cerrar Recinto y volver a IDLE → IDLE
  - Exportar → EXPORTING

### RECOVERING
- App se crasheó, recuperando del WAL de SQLite o draft incompleto
- Usuario ve un diálogo: "¿Restaurar el levantamiento anterior?"
  - SÍ → restaura estado + CommandStack → EDITING (o CREATING si no estaba cerrado)
  - NO → descarta draft → IDLE

### EXPORTING
- Generando IFC en background worker
- UI está bloqueada (no acepta clicks)
- Progreso visible (porcentaje)
- Una vez terminado → IDLE

## Máquina de estados (transiciones válidas)

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

## Invariantes

- Solo un estado a la vez
- Transiciones son explícitas (no "pasan solas")
- CommandStack se resetea en IDLE
- En EXPORTING, la UI rechaza toda entrada

---

## Relacionado con

- [[SurveyInteractionMode]] — modo de interacción dentro de un estado
- [[transiciones-máquina]] — tabla completa de transiciones
- [[CommandStack]] — gestor de undo/redo dentro de los estados

---

*Creada: 2026-09-14*