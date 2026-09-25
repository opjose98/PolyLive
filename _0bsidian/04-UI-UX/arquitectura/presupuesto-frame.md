---
name: presupuesto-frame
description: 30fps snap+miter, 150ms CDT, desacoplados.
type: ui
depends-on: "[[Canvas2D-interacción]], [[CDT-algoritmo]]"
mentioned-in: "Maestro §11.4, arquitectura-aplicacion-v1.md §C"
tags: #performance #canvas #budget
---

# Presupuesto de Frame

## Snap Angular + Miter (UI thread)
- Cálculo de snap: 1-2ms
- Cálculo de miter: 2-3ms
- Renderizado Skia: 10-15ms
- Margen: ~15ms
- **Total: ~30ms (33ms frame = 30fps)**

## CDT (Worker thread, no bloquea)
- Input: polígono + huecos
- Cálculo: O(n log n) triangulación
- Máximo permitido: 150ms
- Si excede: mostrar spinner, resultado "eventual"

## Desacoplamiento
- UI thread: snap + miter + renderizado (siempre fluido)
- Worker thread: CDT (asincrónico)
- No hay bloqueos

---

*Creada: 2026-09-14*