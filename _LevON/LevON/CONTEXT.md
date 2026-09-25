# Contexto del Proyecto: LevON

**LevON** es un sistema BIM ligero (Lightweight Building Information Modeling) desarrollado en Flutter.

## Filosofía del Proyecto
La arquitectura tradicional de aplicaciones BIM (como Revit o ArchiCAD) está profundamente acoplada a sistemas de escritorio masivos, bases de datos complejas en memoria y flujos de trabajo pesados. LevON busca romper este paradigma trasladando el poder de levantamiento arquitectónico directamente al sitio de obra (field-first).

1.  **Offline-First y Resiliencia:** El levantamiento arquitectónico a menudo ocurre en lugares sin internet (sótanos, zonas rurales). El sistema debe funcionar al 100% offline. Toda la persistencia es local (`.levon`).
2.  **BIM Semántico Ligero:** No solo dibujamos líneas; dibujamos entidades espaciales (`Wall`, `Door`, `Room`). La topología se infiere al vuelo mediante un motor matemático en `Dart`.
3.  **No Sobreingenierizar:** Solo implementar abstracciones cuando sean estrictamente necesarias. Evitar patrones pesados si una función pura matemática puede resolver el problema de forma más predecible.

## Objetivos a Corto y Mediano Plazo
*   Estabilizar el motor geométrico 2D (uniones de muros, snaps).
*   Asegurar la exportación limpia a DXF y a un esquema IFC base.
*   Optimizar la interacción táctil (gestos, handles visuales para edición).

## Restricciones Técnicas
*   **Lenguaje/Framework:** Flutter/Dart (para asegurar portabilidad cross-platform con una sola base de código).
*   **Gráficos:** El renderizado debe basarse en el `CustomPaint` canvas puro de Flutter por razones de performance y control de bajo nivel. No usar motores gráficos pesados (Flame, Unity) para UI 2D.
*   **Geometría:** Se prohíbe delegar el cálculo matemático/geométrico a la capa de UI. Todo cálculo ocurre en los UseCases/Domain y usa `vector_math`.

## Optimización para IA
Este documento proporciona el *system prompt* o estado base para cualquier agente de IA. Si eres una IA leyendo esto:
*   Asume siempre el uso de Clean Architecture.
*   Mantén las dependencias aisladas.
*   Genera respuestas cortas, directas y refactoriza sólo el bloque de código solicitado.
