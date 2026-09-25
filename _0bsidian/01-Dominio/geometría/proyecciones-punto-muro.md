---
name: proyecciones-punto-muro
description: Proyección de punto al sistema local del muro — offset perpendicular para vanos (puertas, ventanas).
type: dominio
depends-on: "[[tipos-geométricos]], [[sistema-coordenadas-6-capas]]"
mentioned-in: "Maestro §4.3, pseudocodigo-step-ifc.md §4.2"
tags: #geometría #core #parametrización
---

# Proyecciones y Offset Perpendicular

## Resumen
Cuando se crea una puerta o ventana en un muro, su posición se define por:
1. **Offset a lo largo del muro** (distancia desde el inicio)
2. **Offset perpendicular** (distancia desde la línea central del muro, hacia afuera)

Este documento define las fórmulas exactas.

## Coordenada de Vano (Door/Window)

```typescript
interface VanoDimensions {
  offsetAlongWall: Meters     // 0 = inicio del muro, max = longitud del muro
  offsetPerpendicular: Meters  // 0 = línea central, +X = fuera del muro
  width: Meters               // ancho del vano
  height: Meters              // alto del vano
}
```

## Fórmula: Proyección de punto al muro

Dado un punto P en el espacio local del Room, proyectarlo al muro:

```typescript
function projectPointToWall(
  point: Point2D,
  wall: Wall
): { offsetAlong: Meters, offsetPerp: Meters } {
  
  const wallStart = wall.startPoint
  const wallEnd = wall.endPoint
  const wallDir = { x: wallEnd.x - wallStart.x, y: wallEnd.y - wallStart.y }
  const wallLength = Math.sqrt(wallDir.x ** 2 + wallDir.y ** 2)
  
  // Normalizar dirección del muro
  const wallDirNorm = { x: wallDir.x / wallLength, y: wallDir.y / wallLength }
  
  // Vector desde inicio del muro al punto
  const toPoint = { x: point.x - wallStart.x, y: point.y - wallStart.y }
  
  // Proyección paralela (offset a lo largo del muro)
  const offsetAlong = toPoint.x * wallDirNorm.x + toPoint.y * wallDirNorm.y
  
  // Proyección perpendicular (offset desde la línea central)
  // Perpendicular = (-wallDirNorm.y, wallDirNorm.x)
  const perpDir = { x: -wallDirNorm.y, y: wallDirNorm.x }
  const offsetPerp = toPoint.x * perpDir.x + toPoint.y * perpDir.y
  
  return { offsetAlong: meters(offsetAlong), offsetPerp: meters(offsetPerp) }
}
```

## Validación de vano dentro del muro

Un vano es válido si:
```typescript
function isVanoWithinWall(vano: VanoDimensions, wall: Wall): boolean {
  return (
    vano.offsetAlongWall >= 0 &&
    vano.offsetAlongWall + vano.width <= wall.length &&
    Math.abs(vano.offsetPerpendicular) <= wall.thickness / 2
  )
}
```

**Nota:** Según [[matriz-reglas-de-negocio]], si un vano sobresale del muro → warning, no bloqueo.

## Invariantes

- `offsetAlong` siempre está en [0, wall.length]
- `offsetPerp` simetría: ±X son válidos (ambos lados del muro)
- La proyección es **idempotente:** proyectar dos veces da el mismo resultado

---

## Relacionado con

- [[tipos-geométricos]] — usa Point2D, Meters
- [[sistema-coordenadas-6-capas]] — coordenadas locales del Room
- [[Door-especificación]], [[Window-especificación]] — usan estas coordenadas
- [[pseudocodigo-step-ifc.md]] — exportación IFC usa estos offsets

---

*Creada: 2026-09-14*