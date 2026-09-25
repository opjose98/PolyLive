---
name: IFC-Compatibility-Gate
description: 8 casos de criterio explícito para aceptación de exportación IFC.
type: infraestructura
depends-on: "[[serializador-IFC-general]], [[ExportValidationService]]"
mentioned-in: "pseudocodigo-step-ifc.md §9, Maestro §9.5"
tags: #ifc #validación #compatibility
---

# IFC Compatibility Gate — 8 Criterios de Aceptación

Antes de serializar a IFC, validar:

1. Room cerrado — isOpen = false (si falla: warning, pero permite continuar)
2. Geometría válida — polígono no auto-intersectante (si falla: error bloqueante)
3. Todos los Walls tienen espesor > 0 (si falla: error)
4. Todos los vanos tienen Wall padre válido (si falla: error)
5. Sin Room sin Piso (Level) — levelId requerido (si falla: error)
6. SiteCoordinateSystem definido (si falla: warning, pero permite — posición será {0,0})
7. Ningún objeto tiene is_deleted = true (si falla: excluir del IFC automáticamente)
8. Archivo .ifc escribible (si falla: error I/O)

---

*Creada: 2026-09-14*