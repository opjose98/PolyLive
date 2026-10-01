---
name: transformaciones-coordenadas
description: Fórmulas exactas de transformación entre capas de coordenadas — matemática precisa.
type: dominio
depends-on: "[[tipos-geometricos]], [[sistema-coordenadas-6-capas]]"
mentioned-in: "sistema-coordenadas-y-transformaciones.md §2-4"
tags: #geometría #matemática #core
---

# Transformaciones de Coordenadas — Fórmulas Exactas

## CanvasTransform — Escala y pan

```typescript
interface CanvasTransform {
  scale: number    // píxeles por metro (típicamente 50-200)
  offsetX: number  // píxeles
  offsetY: number  // píxeles
}

// Forward (mundo a pantalla)
function worldToScreen(point: Point2D, t: CanvasTransform): Point2D {
  return {
    x: point.x * t.scale + t.offsetX,
    y: point.y * t.scale + t.offsetY
  }
}

// Inverse (pantalla a mundo)
function screenToWorld(point: Point2D, t: CanvasTransform): Point2D {
  return {
    x: (point.x - t.offsetX) / t.scale,
    y: (point.y - t.offsetY) / t.scale
  }
}
```

## Rotación en 2D

```typescript
function rotatePoint2D(point: Point2D, angle: Degrees): Point2D {
  const rad = degreesToRadians(angle)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  }
}

function degreesToRadians(deg: Degrees): number {
  return (deg as number) * (Math.PI / 180)
}

function radiansToDegrees(rad: number): Degrees {
  return degrees(rad * (180 / Math.PI))
}
```

## Rotación en 3D alrededor del eje Z

```typescript
function rotatePoint3D_Z(point: Point3D, angle: Degrees): Point3D {
  const rotated2D = rotatePoint2D({ x: point.x as number, y: point.y as number }, angle)
  return {
    x: meters(rotated2D.x),
    y: meters(rotated2D.y),
    z: point.z  // Z no se afecta
  }
}
```

## Proyección paralela

```typescript
// Proyectar un punto sobre una línea (muro)
function projectPointToLine(
  point: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D
): Point2D {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const denom = dx * dx + dy * dy
  
  if (denom === 0) throw new Error("Línea degenerada")
  
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / denom
  const clamped = Math.max(0, Math.min(1, t))  // clamp a [0,1]
  
  return {
    x: lineStart.x + clamped * dx,
    y: lineStart.y + clamped * dy
  }
}
```

## Distancia punto a línea

```typescript
function distancePointToLine(
  point: Point2D,
  lineStart: Point2D,
  lineEnd: Point2D
): Meters {
  const projected = projectPointToLine(point, lineStart, lineEnd)
  const dx = point.x - projected.x
  const dy = point.y - projected.y
  return meters(Math.sqrt(dx * dx + dy * dy))
}
```

## Tolerancia de comparación (EPSILON)

```typescript
const EPSILON = 1e-9  // metros

function pointsEqual(p1: Point2D, p2: Point2D, tolerance: Meters = meters(EPSILON)): boolean {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  return Math.sqrt(dx * dx + dy * dy) < (tolerance as number)
}
```

---

## Invariantes

- Todas las transformaciones son **reversibles** (compose(T, T^-1) = identity)
- Rotación preserva distancias (isometría)
- Escala preserva ángulos pero no distancias

---

## Relacionado con

- [[sistema-coordenadas-6-capas]] — aplicación de estas fórmulas
- [[tipos-geometricos]] — usa Meters, Degrees, Point2D, Point3D
- [[miter-encuentros]] — usa projectPointToLine

---

*Creada: 2026-09-14*