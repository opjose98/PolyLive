# Memory Core (RAG & Embeddings)

Esta carpeta (`MEMORY/`) está estructurada como la bóveda semántica para interacciones futuras con IA (Agentes o Modelos Locales).

## Objetivo
Actualmente, no se implementan bases de datos vectoriales (como ChromaDB o Pinecone). Esta carpeta almacenará resúmenes técnicos, decisiones arquitectónicas complejas y contextos de alto nivel en markdown plano.

En el futuro, cuando LevON integre un Copilot o asistencia IA en la propia aplicación o en el flujo de desarrollo del equipo, el contenido de esta carpeta se chunkeará y embeberá.

## Estructura Futura Recomendada
*   `MEMORY/decisions/` -> ADRs (Architecture Decision Records).
*   `MEMORY/algorithms/` -> Explicaciones paso a paso de por qué el motor geométrico hace algo (ej. "Por qué usamos barrido radial para las uniones en T").
*   `MEMORY/bugs/` -> Post-mortems de fallas críticas para evitar que la IA repita errores pasados.
