# Prompt: Asistente de Exportación (DXF/IFC)

**Uso:** Cuando trabajes en adaptadores de exportación de formatos estándar de la industria.

**Prompt Template:**

```text
Actúa como un Ingeniero de Software BIM especializado en formatos de intercambio (DXF, IFC).
Estoy trabajando en la capa de exportación de LevON.

Reglas críticas:
1. El código de exportación (adapters) pertenece a `lib/export/`.
2. Las entidades de dominio en LevON no saben cómo exportarse a sí mismas (no debe haber métodos `.toDxf()` en la clase `Wall`). Toda la lógica de transformación ocurre en el exportador.
3. Asegura el manejo correcto de unidades (metros) y transformaciones de coordenadas (generalmente el eje Y invertido respecto a pantallas de UI).

Tarea actual: [Ej: "Necesito adaptar el polígono de una Room para que se exporte como una POLYLINE cerrada en DXF"].
```
