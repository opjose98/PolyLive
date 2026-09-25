# Task: Mejora de Exportación DXF

**Estado:** Pendiente
**Módulo:** `lib/export/dxf_exporter.dart`

## Problema
Actualmente, la exportación genera la representación base con líneas y polígonos simples, pero no se inyectan correctamente capas semánticas detalladas (layers) para "MUROS", "PUERTAS", "VENTANAS", o colores específicos para el esquema estándar de AutoCAD.

## Restricciones
*   Debe mantenerse independiente de la capa de UI.
*   Formato ASCII DXF base (R12 o R2000) por simplicidad inicial, evitando esquemas binarios para máxima compatibilidad.

## Objetivos
1.  Implementar la tabla de `LAYER` en el archivo DXF.
2.  Asignar entidades a sus respectivas capas.
3.  Asegurar que las unidades (metros, milímetros) del `GlobalPrefsService` se reflejen en los encabezados del DXF.
