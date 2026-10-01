---
name: Niveles-y-fases
description: Niveles (cotas) y fases del proyecto; selectores de rango; existente y calco.
type: dominio
depends-on: "[[Project-especificacion]]"
mentioned-in: "[[Restricciones-verticales]], [[alcance-nivel-fase]], [[EditorController]], [[MOC-PolyLive]]"
tags: #dominio #niveles #fases #F3
---

# Niveles y fases

Código: `domain/objects/marker.ts`, `infrastructure/sqlite/MarkerStore.ts` (persistencia y **validación**:
cotas únicas, base protegida), `application/workspace/rangeModel.ts` (orden y selección de los deslizadores),
`application/workspace/levelScope.ts` (de los selectores al editor), `ui/workspace/useProjectLevels.ts`.

- Pertenecen al **proyecto**; los objetos guardan su nivel y fase de creación en `properties`.
- Selector de niveles: inferior · **nivel activo** · superior. El activo es la planta que se ve y se edita;
  el rango se calca atenuado.
- Selector de fases: la activa es donde nace lo nuevo; las anteriores se dibujan como **existente** (medio
  tono, sin poché, como en Revit).
- Una sola fuente de verdad: crear/renombrar/borrar/cambiar cota pasa por `MarkerStore` y se recarga
  (la edición en memoria duplicada se eliminó en la [[auditoria-post-M2]]).
