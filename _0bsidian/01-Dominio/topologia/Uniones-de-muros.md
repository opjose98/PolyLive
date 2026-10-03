---
name: Uniones-de-muros
description: Extremos que coinciden son una unión; mover uno mueve los unidos y las T (T0).
type: dominio
depends-on: "[[EditorController]]"
mentioned-in: "[[Recintos-con-identidad]], [[estado-y-capitulos]]"
tags: #dominio #topología #T0
---

# Uniones de muros

Código: `src/domain/topology/joints.ts`, `src/application/use-cases/ReshapeWallsUseCase.ts` ·
Tests: `test/topology/joints.test.ts`, `test/editor/EditorController.test.ts` (uniones de muros).

- **Unión**: extremos a < 1 mm (el snap los deja iguales). **T**: extremo sobre el tramo interior de otro muro.
- Mover un extremo (arrastre o medida) → mueve los extremos unidos; los muros que cambian de forma
  re-proyectan sus T (mismo parámetro a lo largo del muro).
- Trasladar un muro → estira a los unidos y arrastra las T.
- Un solo paso de deshacer (`ReshapeWallsCommand`); vista previa en vivo (`dragLinked`).
- Solo une muros rectos del mismo nivel.
