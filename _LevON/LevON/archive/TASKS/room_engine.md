# Task: Optimización del Room Engine

**Estado:** Pendiente / Planificación
**Módulo:** `lib/application/use_cases/detect_rooms_use_case.dart`

## Problema
El motor de detección actual asume líneas rectas simples y un polígono perfectamente cerrado. A futuro, con curvas y aperturas en T, puede haber "fugas" espaciales o solapes.

## Restricciones
*   El motor debe seguir usando matemática vectorial (`vector_math`) y grafos planares (`Graph`, `Node`).
*   No debe importar nada de Flutter.
*   Debe mantenerse por debajo de O(N^3) para asegurar rendimiento en tiempo real a medida que se añaden muros estructurales.

## Objetivos
1.  Mejorar el algoritmo de búsqueda de ciclos mínimos (Minimal Cycle Detection) para ignorar "islas" desconectadas.
2.  Calcular correctamente el área interior restando las intersecciones de las columnas estructurales internas.
3.  Añadir Unit Tests exhaustivos con datos mockeados.
