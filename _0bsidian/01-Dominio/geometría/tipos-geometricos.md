---
name: tipos-geométricos
description: Point2D, Point3D, Triangle, Polygon. Branded types (Meters, SquareMeters, Degrees).
type: dominio
depends-on: 
mentioned-in: "Maestro §3, §4.4"
tags: #geometría #core #tipos
---
# Tipos Geométricos Fundamentales

## Resumen
Define los tipos base para toda operación geométrica en el sistema. Incluye puntos, polígonos y branded types para unidades, evitando confusiones entre números sueltos y magnitudes reales.

## Point2D — Punto en 2D

```typescript
interface Point2D {
  x: number  // en metros, float64
  y: number  // en metros, float64
}
```

**Uso:** Coordenadas de vértices de muros, columnas, puntos de control.

**Convención de ejes:**
- X+ hacia la derecha
- Y+ hacia abajo en Canvas (pero se invierte a Y+ hacia arriba en el sistema local del Room — ver [[sistema-coordenadas-6-capas]])

## Point3D — Punto en 3D

```typescript
interface Point3D {
  x: Meters
  y: Meters
  z: Meters  // altura absoluta en el Piso (Level)
}
```

**Uso:** Posición de objetos BIM en el espacio completo.

## Triangle — Triángulo

```typescript
interface Triangle {
  v0: Point2D
  v1: Point2D
  v2: Point2D
  area: SquareMeters  // área calculada
}
```

**Uso:** Resultado de triangulación CDT.

## Polygon — Polígono Simple

```typescript
interface Polygon {
  vertices: Point2D[]
  holes?: Polygon[]  // huecos internos (columnas, etc.)
  isClosed: boolean  // ¿el último vértice cierra al primero?
}
```

**Uso:** Contorno de un Recinto ([[Room-especificacion]]).

---

## Branded Types — Unidades tipadas

Evitan errores como sumar metros con píxeles. Cada tipo es un wrapper de `number` con validación en tiempo de compilación.

### Metros

```typescript
type Meters = number & { readonly __brand: 'Meters' }

function meters(value: number): Meters {
  if (value < 0) throw new Error("Metros no pueden ser negativos")
  return value as Meters
}
```

**Uso:** `let altura: Meters = meters(3.5)` — ahora no puedes sumar accidentalmente esto con `SquareMeters`.

### SquareMeters

```typescript
type SquareMeters = number & { readonly __brand: 'SquareMeters' }

function squareMeters(value: number): SquareMeters {
  if (value < 0) throw new Error("Área no puede ser negativa")
  return value as SquareMeters
}
```

**Uso:** Área de un Recinto, siempre con `SquareMeters`, nunca un `number` suelto.

### Degrees

```typescript
type Degrees = number & { readonly __brand: 'Degrees' }

function degrees(value: number): Degrees {
  // Normalizar a [0, 360)
  const normalized = ((value % 360) + 360) % 360
  return normalized as Degrees
}
```

**Uso:** Ángulos de rotación, snap angular (ver [[snap-angular]]).

---

## Invariantes

- `Point2D.x` y `Point2D.y` son siempre float64, sin truncamiento en almacenamiento
- Los branded types **nunca** se usan directamente en operaciones aritméticas — siempre extraen el valor con métodos tipados
- Un `Triangle` siempre tiene `area >= 1e-6` (umbral mínimo, ver [[CDT-algoritmo]]), o se marca como "degenerado"

## Relacionado con

- [[sistema-coordenadas-6-capas]] — cómo estos tipos se transforman entre coordenadas
- [[CDT-algoritmo]] — usa Triangle
- [[Wall-especificacion]], [[Room-especificacion]] — usan Point2D/Point3D

---

*Creada: 2026-09-14*