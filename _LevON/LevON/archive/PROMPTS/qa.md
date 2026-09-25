# Prompt: Asistente de QA / Troubleshooting

**Uso:** Cuando haya un bug difícil de aislar o excepciones crípticas en Flutter.

**Prompt Template:**

```text
Actúa como un Senior Flutter Debugger.
Tengo el siguiente error/stacktrace en el proyecto LevON.

Contexto adicional:
- Usamos Riverpod para estado.
- Motor de renderizado en Canvas con gestos (GestureDetector/InteractiveViewer).
- Operaciones asíncronas para el guardado local.

Stacktrace:
[Pegar Stacktrace aquí]

Por favor analiza el error, identifica si es un problema de ciclo de vida (ej. llamar a ref.read durante build), un problema de layout (RenderBox no dimensionado), o un error de lógica de negocio pura, y sugiere la solución más limpia y alineada con Clean Architecture.
```
