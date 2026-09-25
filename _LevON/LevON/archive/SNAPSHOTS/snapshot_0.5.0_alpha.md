# Snapshot: 0.5.0-alpha

**Fecha:** 2026-05-01
**Versión:** 0.5.0-alpha

## Estado Técnico Actual
El sistema opera bajo un entorno offline-first, donde las interacciones de UI (Canvas) disparan UseCases que mutan entidades de dominio inmutables. El estado se refleja globalmente vía `flutter_riverpod`.

## Arquitectura Vigente
*   **Presentation:** Flutter + Riverpod. Componentes modulares (`ContextualRibbon`, `PropertiesPanel`). `EditorScreen` como controlador principal de gestos.
*   **Application:** Use Cases atómicos (`detect_rooms_use_case`, `create_wall_use_case`, `validate_geometry_use_case`).
*   **Domain:** Entidades BIM (`Project`, `Wall`, `Room`, etc.) inmutables. `vector_math` para cálculos espaciales.
*   **Infrastructure:** Persistencia asíncrona (`ProjectRepository`, `AutosaveService` con debounce, `LevonArchiveService`).
*   **Export Layer:** Desacoplada de UI/Domain. `DxfExporter`, `IfcExportAdapter`.

## Cambios Importantes Recientes
*   Estabilización de `Clean Architecture`.
*   Implementación de `AutosaveService` que detecta mutaciones en el snapshot del proyecto para respaldos asíncronos.
*   Implementación de `ContextualRibbon` para acciones dinámicas.
*   Setup estructural para IA (`TASKS/`, `PROMPTS/`, `MEMORY/`).

## Estado de Subsistemas
*   **Geometría / BIM:** Funcional. Soporta dibujo punto a punto, particiones, columnas estructurales. Detección automática de habitaciones (`Rooms`).
*   **Persistencia:** Estable. Formato propietario `.levon` comprimido.
*   **Exportación:** Funcional base, pero requiere detalle semántico.
*   **UI/UX:** Canvas táctil optimizado a 60fps con matriz de transformación manual (`_screenToWorld`). Soporte para multitouch.
