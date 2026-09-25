# LEVON AUDIT — ÍNDICE MAESTRO
**Versión auditada:** 0.8.0-alpha  
**Fecha de auditoría:** 2026-05-04  
**Auditor:** Claude Sonnet 4.6 (rol: revisor técnico estricto)

---

## Motores de la Aplicación

| Motor | Archivo | Descripción |
|-------|---------|-------------|
| Geometría | [[engine_geometry]] | Intersecciones 2D, formas, polígonos |
| Topología | [[engine_topology]] | Grafo de muros, detección de ciclos, Room Engine |
| Snap & Precisión | [[engine_snap]] | Snap, ángulos, grid, PrecisionService |
| Canvas & Render | [[engine_canvas]] | CustomPainter, capas, transformación de coordenadas |
| Exportación | [[engine_export]] | DXF R2000, IFC4, JSON BIM |
| Persistencia | [[engine_persistence]] | .levon archive, autosave, repositorio |
| Estado (Riverpod) | [[engine_state]] | Providers, notifiers, flujo reactivo |
| Editor Controller | [[engine_editor]] | Dibujo, selección, manipulación, undo/redo |
| Unidades & Precisión | [[engine_units]] | UnitConverter, UnitFormatter, PrecisionService |
| Validación BIM | [[engine_validation]] | ValidationPipeline, reglas BIM |
| Historial | [[engine_history]] | Undo/Redo, WorkspaceSnapshot |
| Motor Elevación (MEM) | `DOCS/architecture/MEM_Wall_Elevation_Engine.md` | CSL, NMS, HAP, CM, QE, WEP — nuevo en 0.8.0 |

---

## Auditoría Técnica

| Documento | Contenido |
|-----------|-----------|
| [[audit_report]] | Reporte completo: bugs, refactors, rendimiento, BIM, despliegue |
| [[snapshot_0.8.0]] | Snapshot del estado actual (versión 0.8.0-alpha) |
| [[snapshot_0.7.2]] | Snapshot archivado (versión 0.7.2-alpha) |

---

## Navegación Rápida
- **¿Dónde pasa algo?** → [[engine_state]] es el hub central de toda la app
- **¿Cómo se detectan rooms?** → [[engine_topology]] → [[engine_geometry]]
- **¿Cómo se exporta a Revit?** → [[engine_export]]
- **¿Por qué el snap no funciona?** → [[engine_snap]] → [[engine_editor]]
- **¿Qué falta para producción?** → [[audit_report]]
- **¿Cómo funciona la elevación de muros?** → `DOCS/architecture/MEM_Wall_Elevation_Engine.md` / [[engine_state]]
