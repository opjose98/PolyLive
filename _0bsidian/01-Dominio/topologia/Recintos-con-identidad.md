---
name: Recintos-con-identidad
description: Recinto persistido (tabla zones) con id, número, nombre, uso, área neta; reconciliación por semilla (T0).
type: dominio
depends-on: "[[Uniones-de-muros]], [[EditorController]]"
mentioned-in: "[[Suelo]], [[Avance-de-obra]], [[estado-y-capitulos]]"
tags: #dominio #topología #T0 #BIM
---

# Recintos con identidad

Código: `src/domain/objects/zone.ts`, `src/application/topology/reconcileZones.ts`,
`src/infrastructure/sqlite/ZoneStore.ts`, `EditorController.syncZones` · Tests: `test/topology/zones.test.ts`.

**Por qué:** antes eran derivados en cada recarga y solo se guardaba el mayor. Suelo, Avance, áreas, IfcSpace y
Rooms de Revit necesitan un recinto que conserve su identidad.

- La identidad la lleva la **semilla** (punto interior guardado).
- Dividir: el lado con la semilla conserva el id. Unir: gana el más antiguo.
- Sin contorno: queda **desligado**, no se borra, y deshacer lo recupera.
- Área **neta** a cara interior (`netGeometry`); al eje como referencia.
- Exportación: un `IfcSpace` por recinto, en su piso, con `Qto_SpaceBaseQuantities`; contorno y rótulo en DXF.
- Nombre, uso y notas no entran al historial de deshacer (metadatos).
