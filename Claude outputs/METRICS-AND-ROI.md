# METRICS-AND-ROI

## Análisis de métricas finales — experimento Claude-Obsidian

Este documento reúne las métricas cuantitativas del experimento y las interpreta en términos de costo-beneficio y escalabilidad. Donde el experimento no instrumentó una métrica (tiempo de reloj por spike, costo en moneda real), este documento lo dice explícitamente en lugar de rellenar el vacío con una cifra inventada.

---

## 1. Tokens ahorrados vs. enfoque monolítico

| Métrica | Valor |
|---|---|
| Ahorro promedio de tokens de contexto | **52%** |
| Rango observado entre los 6 spikes | 40% – 58% |
| Método de comparación | Notas fragmentadas + wikilinks (recorrido a 2 niveles de profundidad) vs. cargar el documento monolítico equivalente completo |
| Reproducibilidad | Validada — el ahorro se mantuvo dentro del rango en los seis spikes, sin tendencia decreciente a medida que el vault creció de 8 a 67 notas |

La cifra clave no es el 52% en sí, sino que **no se degrada con el tamaño del vault**. Si el ahorro solo funcionara en vaults pequeños, la metodología no escalaría; el hecho de que el Spike #6 (67 notas acumuladas, el vault más grande de todo el experimento) siga dentro del rango 40–58% es la evidencia de que el mecanismo — cargar el subgrafo relevante, no el vault completo — es lo que sostiene el ahorro, no el tamaño absoluto de la documentación.

## 2. Costo-beneficio

Este experimento no registró costos en moneda real por spike, así que este apartado razona en términos **relativos** (proporcionales al consumo de tokens), que es lo único que se puede afirmar con la evidencia disponible — y lo que de todas formas determina el costo real, dado que el costo de generación con un LLM escala directamente con los tokens de contexto consumidos.

| Escenario | Tokens de contexto relativos | Costo relativo |
|---|---|---|
| Documento monolítico completo (1.638 líneas) por cada tarea de generación | 100% (línea base) | 1.00× |
| Vault fragmentado, subgrafo relevante por tarea | 42–60% (promedio 48%) | ~0.48× |

Interpretación honesta: por cada llamada de generación de código sobre este proyecto, el enfoque de vault fragmentado costó, en promedio, **menos de la mitad** que cargar el documento maestro completo — sin necesidad de asumir un precio por token específico, porque la proporción se mantiene independientemente de la tarifa vigente del modelo usado.

**El costo que sí hay que reconocer del lado de la inversión inicial:** fragmentar 1.638 líneas de documento maestro más sus satélites en 67 notas atómicas con wikilinks explícitos no es gratis — es trabajo de organización que un documento monolítico bien indexado no exige. Este experimento no midió ese costo de fragmentación en horas o tokens por separado; lo que sí muestra la tabla de recomendaciones (§3) es a partir de qué escala ese costo se paga solo.

## 3. Escalabilidad validada

La recomendación por escala de proyecto, tal como se documentó al cierre del experimento:

| Escala del proyecto | Recomendación |
|---|---|
| Pequeño (< 50 notas) | El overhead de mantener el grafo probablemente no se paga solo; un documento único bien indexado es casi tan eficiente. Vale la pena fragmentar solo si el proyecto va a crecer. |
| Mediano (50–200 notas) | Rango donde este experimento se ejecutó (67 notas al cierre) y donde rindió mejor: suficiente superficie para un ahorro significativo, aún manejable sin herramientas de auditoría adicionales. |
| Grande (200+ notas) | El enfoque debería seguir escalando, pero conviene automatizar la detección de notas huérfanas o duplicadas en vez de revisarlo a mano. |
| Equipos multi-desarrollador | El grafo permite que distintas personas trabajen en spikes distintos sin pisarse, porque cada spike toca un subgrafo acotado. Observación cualitativa de este experimento, no medida con datos de equipo real (el experimento se ejecutó con un único operador). |

PolyLive, con 67 notas al cierre de los 6 spikes, está firmemente en el rango "mediano" — el rango donde, según esta misma tabla, la metodología rinde mejor. Esto importa para el Spike #8 (integración React Native, `NEXT-STEPS.md`): agregar las notas de UI, BLE, cámara y ubicación que ese spike va a requerir probablemente mantenga el vault dentro del rango mediano-alto, todavía sin necesitar herramientas de auditoría automatizada de notas huérfanas.

## 4. Comparativa: generación manual vs. Claude-Obsidian

Esta comparación se limita a lo que el experimento efectivamente midió — no incluye una cifra de "tiempo ahorrado" o "productividad multiplicada" porque el experimento no instrumentó tiempo de reloj de un desarrollador humano haciendo el mismo trabajo como control. Lo que sí se puede comparar con evidencia real:

| Dimensión | Codificación manual (línea base implícita) | Claude-Obsidian (este experimento) |
|---|---|---|
| Contexto necesario por tarea de generación | Todo el conocimiento relevante vive en la cabeza del desarrollador o se relee del documento completo | 48% del contexto equivalente, en promedio, cargando solo el subgrafo relevante |
| Cobertura de tests generada junto con el código | Depende enteramente de la disciplina del equipo; con frecuencia se pospone | 208 tests en 17 suites, generados como parte del mismo proceso, no como fase separada pospuesta |
| Detección de defectos de integración | Depende de code review manual o de QA dedicado | 3 bugs reales encontrados y corregidos por la propia suite generada, al cruzar capas con SQLite real en el Spike #6 |
| Honestidad sobre cobertura incompleta | Variable según el equipo | 7 casos documentados explícitamente como no verificables sin hardware físico, en vez de tests fabricados que fingen cobertura |
| Reuso de conocimiento entre módulos relacionados | Depende de la memoria y disciplina de documentación del equipo | Medible y verificado: el vault no creció entre los Spikes #4 y #5 (55→55 notas) pese a que el Spike #5 generó el mayor volumen de archivos de todo el experimento |

La ventaja que este experimento sí puede defender con datos es la combinación de menor contexto por tarea **y** trazabilidad explícita de qué se probó y qué no — no una afirmación genérica de "más rápido" que no se midió.

## 5. Resumen para decisión

Para un proyecto del tamaño y complejidad de PolyLive (documentación técnica de cientos a miles de líneas, arquitectura en capas con reglas de importación estrictas, necesidad de testing real antes de producción), la evidencia de este experimento respalda: fragmentar la documentación en notas atómicas con wikilinks explícitos, organizadas en carpetas espejo de las capas de arquitectura; dedicar un spike explícito de testing con datos reales (no solo mocks) antes de dar por cerrado cualquier módulo, porque es ahí donde este experimento encontró sus tres únicos bugs reales; y mantener la disciplina de documentar honestamente lo que no se pudo verificar (`it.todo()` con razón explícita) en lugar de inflar artificialmente una cifra de cobertura.
