---
name: SurveyInteractionMode
description: Modos de interacción dentro de estados — draw, move, measure, audit. Controla qué hace el touch.
type: aplicación
depends-on: "[[SurveyLifecycle]], [[Canvas2D-interacción]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §14, tabla-decisiones-36.md I-1"
tags: #modo #interacción #ui
---

# SurveyInteractionMode — Modos de Interacción

## Resumen
Dentro de un estado (CREATING, EDITING), hay modos que definen qué hace un toque en el Canvas:
- **draw** — trazar muros, agregar vértices
- **move** — mover muros/columnas
- **measure** — capturar medición BLE
- **audit** — capturar fotos y vincularlas

## Modos

**DRAW** — Trazo de muros / agregación de vértices
**MOVE** — Movimiento de objetos
**MEASURE** — Captura de medición (BLE o manual)
**AUDIT** — Captura de foto + vinculación

## Descripción de modos

### DRAW
**Cuándo:** CREATING (trazo) o EDITING (agregar Wall/Column nuevos)

**Qué hace un toque:**
1. Toca en Canvas → crea un vértice (Point2D)
2. Segundo toque → crea segundo vértice → Wall nuevo (si espesor/altura están set)
3. Tercer+ toque → agrega vértice al polígono del Recinto (CREATING)

**Canvas feedback:**
- Línea punteada desde último vértice al dedo (preview)
- Snap angular activo (visual: línea se "ajusta" a 0°/90°/45°)
- Grid de precisión visible

### MOVE
**Cuándo:** EDITING

**Qué hace un toque:**
1. Long-press en un objeto (Wall/Column) → entra en "move mode"
2. Arrastra el dedo → el objeto sigue al dedo (preview)
3. Suelta → persiste el movimiento (comando MoveWallCommand)

**Canvas feedback:**
- Objeto se vuelve semitransparente (indicando que está siendo movido)
- Línea de referencia muestra desplazamiento

### MEASURE
**Cuándo:** EDITING (con BLE disponible)

**Qué hace un toque:**
1. Toca el botón FAB "MEDIR"
2. Selecciona un Wall como referencia (toca en Canvas)
3. App captura 7 muestras BLE automáticamente
4. Muestra promedio en UI

**Canvas feedback:**
- Wall seleccionada se resalta
- Contador de muestras capturadas (7/7)
- Resultado final: "Distancia: 3.45m ± 0.05m"

### AUDIT
**Cuándo:** EDITING

**Qué hace un toque:**
1. Toca el botón FAB "FOTO"
2. Captura foto (automático con cámara del dispositivo)
3. Selecciona objeto para vincular (toca en Canvas o en PropertyPanel)
4. Foto queda vinculada

**Canvas feedback:**
- Objeto vinculado muestra icono de foto
- PropertyPanel muestra cantidad de fotos vinculadas

## Transiciones entre modos

DRAW (modo por defecto)
├─ toca FAB MOVER → MOVE
├─ toca FAB MEDIR → MEASURE
└─ toca FAB FOTO → AUDIT

MOVE
├─ toca FAB DRAW → DRAW
└─ suelta objeto → DRAW

MEASURE
├─ termina captura → DRAW
└─ presiona "Cancel" → DRAW

AUDIT
├─ termina vinculación → DRAW
└─ presiona "Cancel" → DRAW

## Invariantes

- Solo un modo a la vez
- DRAW es el modo "por defecto" (si no hay otro activo)
- Cambiar de modo cancela la operación anterior (ej: suelta objeto si estaba en MOVE)
- MEASURE y AUDIT pueden estar activos solo si el hardware lo permite (BLE, cámara)

---

## Relacionado con

- [[SurveyLifecycle]] — contexto de estado más amplio
- [[Canvas2D-interacción]] — implementación de gestos
- [[tabla-decisiones-36.md]] — decisión I-1 sobre modos

---

*Creada: 2026-09-14*