---
name: Topologia-de-recintos
description: Cómo los muros cierran recintos (grafo planar) y qué recinto se guarda en el espacio; reglas H-69, H-82, H-83 y H-86.
type: dominio
depends-on: "[[Restricciones-verticales]]"
mentioned-in: "docs/25 (H-69, H-82, H-83, H-86), docs/27"
tags: #dominio #recintos #topología
---

# Topología de recintos

Los recintos salen solos de los muros estructurales del nivel activo (`DetectRoomsUseCase` sobre `TopologyGraph`):

- **Nudos**: dos extremos a menos de 5 cm son el mismo punto.
- **T**: un muro que termina en mitad de otro lo parte; también al revés, si el que pasa llega después (H-69).
- **Cruz (X)**: dos muros que se cruzan sin extremo común se parten en el cruce (H-83: cabinas de baño de PALA).
- **Caras**: cada cara mínima con área de signo positivo es un recinto; el contorno exterior de cada grupo de muros
  se descarta, también el de un segundo grupo suelto (H-82: batería aparte de SDGO).
- **Recinto del espacio** (el que exportan IFC y DXF): el de la base; si la base no tiene muros (2.º piso con cotas
  absolutas), el del nivel más bajo que los tiene (H-86). Un espacio sin ningún muro no exporta IFC (decisión abierta).

Código: `domain/topology/TopologyGraph.ts`, `application/use-cases/DetectRoomsUseCase.ts`,
`application/editor/EditorCore.ts` (`roomLevelOf`). Test: `test/topology/TopologyGraph.test.ts`,
`test/editor/EditorController.test.ts` (niveles y fases).
