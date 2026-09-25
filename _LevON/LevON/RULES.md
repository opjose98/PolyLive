# Reglas Globales (Rules)

Para mantener la consistencia, estabilidad y limpieza del proyecto, todos los desarrolladores y agentes de IA deben seguir estrictamente estas reglas:

## 1. Clean Architecture Strict
*   **Aislamiento de Dominio:** La capa `lib/domain/` no debe tener absolutamente ninguna dependencia externa (ni Flutter, ni librerías de persistencia). Sólo dependencias matemáticas (ej. `vector_math`).
*   **Sin Lógica en UI:** Los Widgets (`lib/ui/`) solo deben mostrar datos y capturar eventos. Cualquier transformación de datos o lógica compleja ocurre en los Providers o UseCases.

## 2. Enfoque Offline-First
*   **Autonomía Local:** La aplicación debe funcionar completamente sin conexión a internet.
*   **Persistencia Local Síncrona/Asíncrona:** El estado se mantiene en memoria y se persiste en disco local en formato `.levon` mediante `AutosaveService`. Ningún guardado debe bloquear la interfaz de usuario.

## 3. Rendimiento (Performance)
*   **Priorizar Rendimiento Móvil/Tablet:** Los algoritmos geométricos deben ejecutarse a 60fps en dispositivos móviles de gama media.
*   **Renderizado de Canvas:** Optimizar llamadas a `CustomPaint`. Evitar redibujar elementos ocultos (culling) a futuro, y usar `RepaintBoundary` si es necesario.
*   **Estructuras de Datos Ligeras:** Usa `List` estandar, evitar mapas ineficientes en loops calientes del motor gráfico.

## 4. Diseño del Código
*   **Evitar Sobreingeniería:** Si una función topológica simple (ej. cruce de segmentos) funciona bien y es mantenible, no abstraerla tras capas de interfaces innecesarias.
*   **Inmutabilidad:** Todo el Domain debe ser inmutable (`copyWith` patterns) para prevenir bugs silenciosos por referencias de estado mutables en Riverpod.

## 5. Documentación
*   **Comentarios en Español Técnico:** Los comentarios de código y algoritmos core (geometría, topología) deben estar en español técnico para mantener la cohesión del equipo actual.
*   **Uso de IA:** Optimizar documentación para ser consumida como contexto (corto, al punto, evitando redundancia).

## 6. Compatibilidad
*   Mantener la compatibilidad y testeabilidad en Windows/macOS Desktop para desarrollo rápido, pero el target primario siempre será Android Tablet.
