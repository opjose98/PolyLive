---
name: tests-geometría-core
description: Test cases específicos para CDT, snap, miter — 12 casos reales.
type: testing
depends-on: "[[CDT-algoritmo]], [[CDT-casos-prueba]], [[estrategia-unit-testing]]"
mentioned-in: "Spike #1 completado"
tags: #testing #geometry #cdt
---

# Tests — Geometría Core

## CDT Test Cases (12)
Cada caso testea un escenario de triangulación:

1. Rectangle — 4 vértices, ningún hueco
2. L-Shape — 6 vértices, ángulo de 90°
3. U-Shape — 8 vértices, 2 entrantes
4. Rectangle + 2 holes — validar exclusión de triángulos
5. Tangent points — vértices en línea casi colineal
6. Nearly colinear — ángulos muy cerrados
7. Very small hole — hueco mínimo
8. Duplicate vertices — puntos repetidos
9. Almost closed — polígono sin cierre perfecto
10. Self-intersecting — líneas que se cruzan
11. Highly elongated — polígono muy alargado
12. Realistic complete — caso real con complejidad

## Snap Tests (16 ángulos)
Cada ángulo predefinido (0°, 30°, 45°, 60°, 90°, etc.)
- Input: ángulo aleatorio ± 5°
- Output: snap al predefinido
- Verify: exactitud < 0.1°

## Miter Tests (corner detection)
- Horizontal + Vertical → T-joint exacto
- Acute angle < 10° → error
- Blunt angle > 170° → warning

---

*Creada: 2026-09-15*