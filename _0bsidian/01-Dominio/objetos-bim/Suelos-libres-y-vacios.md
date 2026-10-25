---
name: Suelos-libres-y-vacios
description: Suelos fuera de recintos (andenes, patios, placas) dibujados con formas, y vacíos en cualquier suelo.
type: dominio
depends-on: "[[Floor-especificacion]], [[Niveles-y-fases]]"
mentioned-in: "docs/26 § 11"
tags: #dominio #suelo #anden #cuantificacion
---

# Suelos libres y vacíos

- Un `Floor` es **de recinto** (`properties.zoneId`, toma el contorno neto del recinto) o **libre** (`outline`
  propio): andenes, circulaciones exteriores, placas deportivas.
- Cualquier suelo puede tener **vacíos** (`holes`): se descuentan del área neta y la trama no los cruza. Un vacío
  también sirve para un andén perimetral (el edificio queda como hueco).
- Formas: polígono por toques (tocar el primer vértice o «Cerrar»), rectángulo y círculo arrastrados.
  Círculo = polígono de 48 lados.
- **Edición (H-88):** seleccionado se resalta y da área neta, perímetro y espesor; sus vértices y el centro de cada
  arista se arrastran (la arista se desplaza en perpendicular). Doble toque **aísla** el suelo (libre o de
  recinto) para editarlo y pintar su avance.
- Cuantificación: IFC `IfcSlab` con `IfcArbitraryProfileDefWithVoids` y `NetArea`; cuadro de áreas S-01… aparte de
  los recintos; Avance los pinta como un soporte más.

Código: `domain/objects/floor.ts`, `application/use-cases/CreateFloorUseCase.ts`, `application/editor/EditorCreation.ts`
(formas), `ui/canvas/planRenderer.ts`. Test: `test/editor/EditorController.test.ts` (suelos libres y vacíos),
`test/ifc/IFCRevitExport.test.ts`.
