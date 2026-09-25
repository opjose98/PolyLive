---
name: ExportRoomIfcUseCase-detalles
description: Generación en worker, timeline, validaciones previas.
type: infraestructura
depends-on: "[[ExportRoomIfcUseCase]], [[IFC-Compatibility-Gate]]"
mentioned-in: "arquitectura-aplicacion-v1.md §7, pseudocodigo-step-ifc.md §9"
tags: #ifc #export #worker
---

# ExportRoomIfcUseCase — Detalles de Implementación

## Timeline (Worker)
1. Validar Room (5ms)
2. Generar IfcProject + IfcSite + IfcBuilding (10ms)
3. Generar IfcSpace para cada Room (20ms)
4. Generar IfcWall para cada Wall (50ms)
5. Generar IfcOpeningElement para cada Door/Window (30ms)
6. Generar IfcColumn para cada Column (20ms)
7. Escribir archivo STEP (50ms)

Total esperado: ~185ms para un Room con 20 muros

## Validaciones previas (antes de worker)
- IFC-Compatibility-Gate 8 criterios
- Si alguno falla (error): no procede
- Si alguno falla (warning): continúa pero nota en IFC

---

*Creada: 2026-09-14*