# Task: Mejoras en Persistencia (Persistence Engine)

**Estado:** Completado Parcialmente (v0.5.0-alpha)
**Módulo:** `lib/persistence/`

## Problema
La serialización y deserialización JSON está operativa, y el motor de autoguardado funciona asincrónicamente. Sin embargo, no hay un mecanismo de migración de datos (Data Migration) robusto si cambia el esquema de la entidad en el futuro (ej. añadir un campo obligatorio a `Wall`).

## Restricciones
*   Debe mantener la compatibilidad hacia atrás para archivos `.levon` creados en Alpha.
*   Todo se maneja localmente. No depender de migraciones en la nube.

## Objetivos (Para Alpha-Beta)
1.  Añadir un campo de versión de esquema (schemaVersion) al `metadata.json` del paquete `.levon`.
2.  Crear una capa de migradores (`SchemaMigrator`) que adapte el JSON antiguo al modelo nuevo antes de cargarlo en el `ProjectRepository`.
