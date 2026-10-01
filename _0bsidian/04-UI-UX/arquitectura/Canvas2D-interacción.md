---
name: Canvas2D-interacción
description: Renderizado Skia + snap + trazo interactivo en Canvas.
type: ui
depends-on: "[[CanvasTransform]], [[snap-angular]], [[miter-encuentros]]"
mentioned-in: "Maestro §11, arquitectura-aplicacion-v1.md §C"
tags: #canvas #ui #interacción
---

> **ESTADO — ampliado.** El lienzo actual (gestos, cámara en el hilo UI, capa viva) está en
> [[capa-viva-y-camara]]; la representación de cada elemento en [[convenciones-de-dibujo]].


# Canvas2D — Interacción

## Resumen
Canvas2D es el área central donde el usuario traza muros, ve objetos, interactúa con snap y miter.

## Componentes

### CanvasTransform
- scale: número (píxeles por metro)
- offsetX, offsetY: número (pan)
- Métodos: worldToScreen, screenToWorld

### Snap Angular (invisible)
- Snap a 0°, 90°, 45°, 30°, 60°
- Tolerancia: 5° (configurable)
- Se aplica automáticamente durante trazo

### Miter (encuentros limpios)
- Detecta esquina/T-joint
- Ajusta puntos finales a línea de encuentro exacta
- Validación de ángulos agudos < 10°

### Trazo interactivo
- Preview: línea punteada desde último punto al dedo
- Grid de precisión (opcional)
- Feedback visual de snap

## Presupuesto de frame
- Snap + miter: 30fps máximo (33ms por frame)
- CDT: 150ms máximo (no bloquea UI, corre en worker)

---

*Creada: 2026-09-14*