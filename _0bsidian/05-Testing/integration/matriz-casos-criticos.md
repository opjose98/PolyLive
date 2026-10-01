---
name: matriz-casos-criticos
description: Matriz de casos críticos (qué pasa si...) y qué testea cada uno.
type: testing
depends-on: "[[estrategia-unit-testing]], [[flujos-integracion-documentados]]"
mentioned-in: "Spike #2-5"
tags: #testing #critical #edge-cases
---

# Matriz de Casos Críticos

| Caso | Qué pasa si | Test | Layer |
|---|---|---|---|
| Door sin Wall padre | FK validation falla | test/sqlite | Infrastructure |
| Polígono auto-intersectante | CDT rechaza | test/geometry | Domain |
| CommandStack lleno (100) | FIFO limpia oldest | test/application | Application |
| BLE timeout | Measurement error | test/canvas | State |
| File I/O falla | Rollback DB | test/sqlite | Infrastructure |
| Undo en stack vacío | No-op | test/application | Application |
| Zoom > 500x | Scale clamped | test/canvas | State |
| Database corrupto | Backup restore | integration | Infrastructure |

---

*Creada: 2026-09-15*