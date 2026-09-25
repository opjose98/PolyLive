---
name: backup-integridad
description: Estrategia de backup automático y verificación de integridad de datos.
type: testing
depends-on: "[[database.ts]], [[CommandStack]]"
mentioned-in: "Maestro §13"
tags: #testing #backup #integrity
---

# Backup e Integridad

## Backup automático
- Cada Close Room → backup a timestamp file
- Máximo 5 backups (rotating)
- Nombre: `survey-backup-{timestamp}.db`
- Location: misma carpeta que DB principal

## Verificación de integridad
- SQLite PRAGMA integrity_check
- Verificar: todos los ForeignKeys válidos
- Verificar: no hay objetos huérfanos (Door sin Wall)

## Recuperación desde backup
- Si DB corrupto: restaurar último backup
- Si backup también corrupto: restaurar penúltimo
- If todos corrupto: blank slate

---

*Creada: 2026-09-15*