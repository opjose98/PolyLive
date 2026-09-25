---
name: Wall-especificación
description: Muro — propiedades, geometría, validación. Objeto BIM fundamental.
type: dominio
depends-on: "[[RevitObjectBase]], [[tipos-geométricos]]"
mentioned-in: "Maestro §6.2, [[miter-encuentros]], [[proyecciones-punto-muro]]"
tags: #objetos-bim #core #wall
---

# Wall — Especificación de Muro

## Resumen
Un muro es una línea recta en el espacio, definida por dos puntos (inicio y fin), con propiedades como espesor, alto y material.

## Propiedades

```typescript
class Wall extends RevitObjectBase {
  type: 'Wall' = 'Wall'
  
  // Geometría — 2D en el plano del Recinto
  startPoint: Point2D
  endPoint: Point2D
  
  // Dimensiones
  thickness: Meters                    // espesor del muro (ej. 0.15m = 15cm)
  height: Meters                       // altura del muro (ej. 3.0m)
  
  // Material
  material?: string                    // ej. "ladrillo", "hormigón", "madera"
  
  // Propiedades calculadas (no persistidas, calculadas on-demand)
  get length(): Meters {
    const dx = this.endPoint.x - this.startPoint.x
    const dy = this.endPoint.y - this.startPoint.y
    return meters(Math.sqrt(dx * dx + dy * dy))
  }
  
  // Referencias
  linkedPhotos: AuditPhotoId[]
}
```

## Invariantes

- `startPoint !== endPoint` (muro no degenerado)
- `thickness > 0`
- `height > 0`
- `length === distance(startPoint, endPoint)` siempre
- Nunca tiene `parentWallId` (los muros son independientes en su estructura; pueden cruzar otros muros, pero no "pertenecen" a ellos como las puertas)

## Validación

Ver [[WallValidationService]]:
- No debe cruzar otro Wall de forma no-esperada (excepto esquina/T-joint limpia)
- Puede contener columnas embebidas ([[Column-especificación]])

## Vanos dependientes

Un muro puede tener puertas y ventanas como "hijos":

```typescript
interface WallWithVanos {
  wall: Wall
  doors: Door[]
  windows: Window[]
}
```

Los vanos se posicionan usando [[proyecciones-punto-muro]] (offset a lo largo + offset perpendicular).

## Exportación IFC

Ver [[pseudocodigo-step-ifc.md]] §4.1: `writeWall()` genera `IfcWall` con:
- `IfcWallStandardCase` si es recto (típico)
- Geometría como `IfcPolyline` o `IfcExtrudedAreaSolid`
- Material asignado si existe

---

## Relacionado con

- [[RevitObjectBase]] — clase padre
- [[Door-especificación]], [[Window-especificación]] — vanos dependientes
- [[Column-especificación]] — puede estar embebida (sin validación)
- [[WallValidationService]] — validación de muros
- [[miter-encuentros]] — cálculo de encuentros limpios
- [[proyecciones-punto-muro]] — posicionamiento de vanos
- [[Room-especificación]] — contiene muros

---

*Creada: 2026-09-14*