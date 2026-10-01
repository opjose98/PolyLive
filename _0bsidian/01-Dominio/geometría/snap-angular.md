---
name: snap-angular
description: Snap a ángulos específicos — fuerza Wall vs Wall a ángulos predefinidos (0°, 90°, 45°, etc).
type: dominio
depends-on: "[[tipos-geometricos]]"
mentioned-in: "Maestro §11.1/11.2, tabla-decisiones-36.md H-3"
tags: #geometría #interacción #ui
---

# Snap Angular

## Resumen
Durante el trazo, los muros tienden a "pegarse" a ángulos comunes (0°, 90°, 45°, 30°, etc.), mejorando la precisión y la apariencia de planos.

**Snap Angular = tolerancia angular invisible.**

## Decisión de UI

Según [[tabla-decisiones-36.md]], el snap angular es:
- **INVISIBLE:** El usuario no ve que se está aplicando
- **CONFIGURABLE:** Tolerancia ajustable en [[panel-espacios]] (drawer derecho)
- **OPTIONAL:** Usuario puede desactivarlo con un toggle

## Ángulos predefinidos

```typescript
const SNAP_ANGLES: Degrees[] = [
  degrees(0),      // horizontal
  degrees(90),     // vertical
  degrees(45),     // diagonal
  degrees(30),     // arquitectónico común
  degrees(60),     // arquitectónico común
  degrees(-45),    // diagonal opuesta
  degrees(-30),
  degrees(-60),
]
```

## Algoritmo

### Entrada
- `wallAngle: Degrees` — ángulo calculado del muro que está trazando el usuario
- `tolerance: Degrees` — rango de tolerancia (típicamente 5°, configurable)

### Proceso

```typescript
function snapToNearestAngle(wallAngle: Degrees, tolerance: Degrees): Degrees {
  let nearest = wallAngle
  let minDifference = tolerance
  
  for (const snapAngle of SNAP_ANGLES) {
    const difference = Math.abs(angleDifference(wallAngle, snapAngle))
    if (difference < minDifference) {
      minDifference = difference
      nearest = snapAngle
    }
  }
  
  return nearest  // si minDifference >= tolerance, retorna wallAngle original
}
```

### Salida
- El ángulo snapeado, o el ángulo original si no hay ángulo predefinido dentro de la tolerancia

## Invariantes

- Snap angular **nunca** es visible en tiempo real (no hay línea punteada dibujada)
- El snap se aplica **después** de [[miter-encuentros]] (Miter es lo primero)
- Si el usuario activa snap angular a 5° y traza un muro a 92°, este "salta" a 90°

## Interacción con Miter

1. Usuario traza Wall A vertical (90°)
2. Usuario comienza Wall B — intenta hacerlo horizontal pero está a 2°
3. Snap angular lo ajusta a 0° (horizontal)
4. [[miter-encuentros]] calcula el punto exacto de encuentro entre 90° y 0°

---

## Relacionado con

- [[tipos-geometricos]] — usa Degrees
- [[miter-encuentros]] — Snap se aplica después
- [[tabla-decisiones-36.md]] — decisión de UI de invisibilidad
- [[Canvas2D-interacción]] — aplica snap durante el trazo

---

*Creada: 2026-09-14*