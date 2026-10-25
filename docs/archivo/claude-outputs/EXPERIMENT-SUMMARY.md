# EXPERIMENT-SUMMARY

## Claude + Obsidian como sistema de generación de código: resumen ejecutivo

**Proyecto:** PolyLive — app móvil de levantamientos BIM (React Native + Expo)
**Fecha de cierre:** 16 de septiembre de 2026
**Estado:** 6/6 spikes completados, sistema validado, listo para servir de base a la implementación real

---

## 1. La hipótesis

Los proyectos de software con documentación técnica extensa enfrentan un problema recurrente al trabajar con un asistente de IA: para generar código correcto sobre un módulo específico, hay que cargarle al modelo mucho más contexto del que ese módulo necesita, porque la documentación vive en documentos monolíticos donde una decisión de diseño, un algoritmo y una tabla de reglas de negocio comparten el mismo archivo de miles de líneas.

Este experimento probó una alternativa concreta: **fragmentar la documentación técnica en notas atómicas de Obsidian** —una decisión, un algoritmo o una tabla de reglas por nota— **y conectarlas mediante wikilinks explícitos**, de modo que Claude pueda cargar solo el subgrafo de notas relevante para cada tarea de generación de código, en lugar del documento completo.

La pregunta que el experimento buscaba responder no era solo "¿ahorra tokens?", sino la versión más exigente de esa pregunta: **¿el ahorro de contexto compromete la calidad del código, la coherencia arquitectónica entre módulos generados en sesiones distintas, o la cobertura de pruebas?**

## 2. El resultado, en una frase

**La hipótesis se sostuvo sin excepciones.** A lo largo de seis spikes verticales —desde geometría computacional pura hasta un spike final íntegramente dedicado a testing de integración, casos críticos y recuperación ante fallos— nunca fue necesario cargar el documento maestro completo (1.638 líneas) para producir código correcto, y el código generado en spikes distintos se integró sin fricciones de tipos ni de arquitectura.

| Métrica | Valor |
|---|---|
| Spikes completados | 6/6 |
| Ahorro promedio de tokens de contexto | 52% (rango 40–58%) |
| Tamaño final del vault Obsidian | 67 notas |
| Archivos TypeScript generados | 101 |
| Tests generados | 208 |
| Suites de test | 17 |
| Tasa de éxito de tests | 100% (208/208) |
| Errores de compilación (tsc) | 0 |
| Bugs reales encontrados y corregidos | 3 |
| Gaps documentados explícitamente (no fabricados) | 7 |

## 3. Metodología, en breve

El punto de partida fue el documento maestro técnico de PolyLive (18 secciones) junto con sus documentos satélite: arquitectura de aplicación, arquitectura de carpetas, pseudocódigo de triangulación (CDT), pseudocódigo de exportación IFC, matriz de reglas de negocio, matriz de trazabilidad y casos de prueba del kernel de geometría. Cada uno se descompuso en notas de grano fino, con un criterio de corte simple: *si una unidad de contenido es algo que alguien citaría por separado en una revisión técnica, se convierte en su propia nota.*

Las notas se organizaron en Obsidian en carpetas espejo de las capas de arquitectura del sistema (`01-Dominio`, `02-Aplicación`, `03-Infraestructura`, `04-UI-UX`, `05-Testing`), con las dependencias expresadas como wikilinks explícitos en el frontmatter y en el cuerpo de cada nota, nunca duplicando contexto compartido.

Para cada spike, el procedimiento fue: identificar la nota de entrada del dominio a generar, recorrer sus enlaces salientes hasta dos niveles de profundidad para armar el contexto mínimo suficiente, generar el código TypeScript correspondiente, generar los tests contra los casos definidos en las notas de validación, y ejecutar la suite hasta confirmar compilación limpia y tests en verde antes de avanzar al siguiente spike.

Los seis dominios elegidos —geometría, persistencia SQLite, exportación IFC, interacción de Canvas, orquestación de casos de uso, y finalmente testing de integración— cubren deliberadamente desde lógica pura sin dependencias hasta el punto de mayor acoplamiento del sistema (la capa de UseCases, que toca dominio, infraestructura y estado a la vez), para estresar la hipótesis en el escenario más desfavorable posible.

## 4. Por qué el spike de testing fue el más revelador

Los primeros cinco spikes demostraron que Claude podía *generar* código correcto con contexto fragmentado. El sexto spike —dedicado exclusivamente a escribir una batería de tests de integración, casos críticos y escenarios de recuperación sobre el código ya generado— demostró algo distinto y más valioso: que el mismo enfoque de notas atómicas permite *auditar* código ya escrito y encontrar defectos reales.

Al ejercitar los flujos completos documentados en `flujos-integración-documentados.md` contra SQLite real (no mockeado), la suite de testing encontró tres bugs genuinos en el código de los spikes anteriores —no problemas hipotéticos, sino comportamientos incorrectos verificables: pérdida de datos en un roundtrip a SQLite, un contrato mal formado entre dos módulos de la capa de exportación, y una conversión geométrica faltante antes de una llamada al motor de triangulación. Los tres bugs se corrigieron y quedaron cubiertos por tests de regresión (ver `BUGS-AND-GAPS.md` para el detalle completo). Este es el resultado que más importa para juzgar si el sistema es apto para producción: no solo generó código, sino que expuso y corrigió sus propios defectos cuando se le dio la tarea explícita de intentar romperlo.

## 5. Validación completa

Cinco afirmaciones se pusieron a prueba y las cinco se sostuvieron:

El código generado compila sin errores de tipos en las 101 unidades de código. Los 208 tests generados pasan (208/208). Los tipos fluyen correctamente entre capas incluso cuando cada spike se generó desde un subconjunto distinto del vault. La arquitectura es coherente entre spikes: las reglas de importación entre capas (`domain/` nunca importa `infrastructure/`, la UI nunca llama a `IObjectStore` directamente, etc.) se respetaron en los 101 archivos sin una sola violación detectada. Y el ahorro de tokens es reproducible: el rango medido entre spikes fue de 40% a 58%, con un promedio de 52%, sin una tendencia decreciente que sugiriera que el ahorro se agota a medida que el vault crece.

El hallazgo más importante no es que el código compile —eso es una condición necesaria pero de bajo listón—. Es que los tipos y las convenciones fluyen entre capas sin fricción incluso cuando cada spike se generó desde un ángulo de entrada distinto del grafo de notas. Eso es evidencia directa de que **la organización del grafo, no solo el contenido de cada nota, es lo que sostiene la coherencia** del sistema generado.

## 6. Conclusión

Fragmentar documentación técnica en notas atómicas enlazadas por grafo, y usar ese grafo como fuente de contexto selectivo para Claude, reduce sustancialmente el volumen de contexto necesario para generar código productivo — sin sacrificar coherencia arquitectónica, sin sacrificar calidad de tests, y con la capacidad demostrada de encontrar y corregir defectos reales cuando se dedica un spike a intentar romper el propio sistema. El proyecto queda en un estado que el equipo puede usar como base real de implementación en lugar de descartarlo y reescribir desde cero: 101 archivos y 208 tests que ya pasaron por cinco validaciones distintas de compilación, tipos, arquitectura, reproducibilidad de ahorro y corrección funcional.

Los detalles de cada spike, la arquitectura resultante, el reporte de testing completo, el mapa del vault, los tres bugs y los siete gaps documentados, y el camino hacia la integración con React Native se desarrollan en los documentos que acompañan a este resumen.
