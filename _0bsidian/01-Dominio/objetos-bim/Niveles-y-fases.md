---
name: Niveles-y-fases
description: Niveles (cotas) y fases de cada espacio; selectores de rango; existente y calco.
type: dominio
depends-on: "[[Project-especificacion]]"
mentioned-in: "[[Restricciones-verticales]], [[alcance-nivel-fase]], [[EditorController]], [[MOC-PolyLive]]"
tags: #dominio #niveles #fases #F3
---

# Niveles y fases

Código: `domain/objects/marker.ts`, `infrastructure/sqlite/MarkerStore.ts` (persistencia y **validación**:
cotas únicas, base protegida), `application/workspace/rangeModel.ts` (orden y selección de los deslizadores),
`application/workspace/levelScope.ts` (de los selectores al editor), `ui/workspace/useProjectLevels.ts`.

- Pertenecen a **cada espacio** (migración v4, docs/23 § 7): `project_markers` tiene clave `(space_id, id)` y toda
  operación de `MarkerStore` lleva su `MarkerScope`. Los objetos guardan su nivel y fase de creación en `properties`.
- Al crear un espacio se proponen la plantilla `LEVEL_TEMPLATE` (Piso · Muro · Viga · Cubierta) y sus fases, o se
  copian de otro espacio: `application/projects/spaceSetup.ts`, `ui/workspace/SpaceSetupFields.tsx`.
- Tests: `test/infrastructure/MarkerStore.test.ts` (por espacio, plantilla, copia, migración v4),
  `test/projects/spaceSetup.test.ts`, `test/ifc/IFCProjectExport.test.ts` (un piso por cota),
  `test/package/projectPackage.test.ts` (paquetes anteriores a la v4).
- Selector de niveles: inferior · **nivel activo** · superior. El activo es la planta que se ve y se edita;
  el rango se calca atenuado.
- Selector de fases: la activa es donde nace lo nuevo; las anteriores se dibujan como **existente** (medio
  tono, sin poché, como en Revit).
- Una sola fuente de verdad: crear/renombrar/borrar/cambiar cota pasa por `MarkerStore` y se recarga
  (la edición en memoria duplicada se eliminó en la [[auditoria-post-M2]]).
