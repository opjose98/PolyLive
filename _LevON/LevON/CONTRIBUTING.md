# Contributing to LevON

LevON es un proyecto de código cerrado y de propiedad intelectual privada. Esta guía está dirigida exclusivamente a desarrolladores internos, contratistas autorizados, y agentes de Inteligencia Artificial que trabajan en el repositorio.

## Trabajo Modular con IA

Toda la documentación y estructura ha sido diseñada pensando en **reducir el uso de tokens** y proporcionar un **contexto modular** para herramientas de IA (como sistemas RAG, agentes autónomos o copilot).

Al realizar cambios o solicitar refactorizaciones a una IA, por favor respeta la estructura:
1.  **Archivos Pequeños y Modulares:** No sobrecargar archivos con múltiples responsabilidades.
2.  **Contexto Preciso:** Antes de ejecutar una tarea, asegúrate de proveer a la IA del contenido en `CONTEXT.md` y `RULES.md` si no tiene contexto global.
3.  **Prompts Centralizados:** Utiliza o guarda prompts útiles en el directorio `PROMPTS/`.

## Flujo de Trabajo (Branching Strategy)

Seguimos una versión simplificada de Git Flow:
*   `main` - Código de producción estable (actualmente apuntando a Alpha estables).
*   `develop` - Rama principal de integración y desarrollo.
*   `feature/*` - Ramas para nuevas características o refactorizaciones de módulos específicos (ej: `feature/room-engine-opt`).
*   `hotfix/*` - Soluciones críticas.

## Pull Requests

1.  Actualiza siempre los tests relevantes (unitarios y de widgets).
2.  Mantén el código comentado en **español técnico**, sobre todo en las funciones algorítmicas (motor geométrico).
3.  No introduzcas lógica de negocio en la UI (`lib/ui`). Usa siempre los proveedores correspondientes.
4.  Si añades módulos significativos, actualiza `ARCHITECTURE.md` y los `SNAPSHOTS/`.
