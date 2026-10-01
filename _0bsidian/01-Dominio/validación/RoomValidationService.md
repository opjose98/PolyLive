---
name: RoomValidationService
description: Validación de Recintos — área, límite de objetos, polígono válido.
type: dominio
depends-on: "[[Room-especificacion]], [[CDT-algoritmo]], [[matriz-reglas-de-negocio]]"
mentioned-in: "Maestro §5.7, [[CloseRoomUseCase]]"
tags: #validación #core #room
---

# RoomValidationService

## Resumen
Valida que un Recinto es válido antes de cerrar o exportar:
1. Geometría válida (no auto-intersectante)
2. Área calculada correctamente
3. No excede límite de 500 objetos

## Validaciones

### 1. Geometría válida

```typescript
function validateGeometry(room: Room): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  // Mínimo 3 vértices
  if (room.geometry.length < 3) {
    warnings.push({
      type: 'insufficient_vertices',
      severity: 'error',
      message: `Recinto debe tener >= 3 vértices (tiene ${room.geometry.length})`
    })
  }
  
  // No auto-intersectante
  if (isPolygonSelfIntersecting(room.geometry)) {
    warnings.push({
      type: 'self_intersecting_polygon',
      severity: 'error',
      message: 'Polígono se cruza a sí mismo (forma de mariposa)'
    })
  }
  
  return warnings
}

function isPolygonSelfIntersecting(vertices: Point2D[]): boolean {
  // Verificar si algún par de aristas se cruzan
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue  // no revisar primer→último
      if (segmentsIntersect(
        vertices[i], vertices[(i + 1) % vertices.length],
        vertices[j], vertices[(j + 1) % vertices.length]
      )) {
        return true
      }
    }
  }
  return false
}
```

### 2. Área calculada

```typescript
function validateArea(room: Room, triangulation: TriangulationResult): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  if (!triangulation.valid) {
    warnings.push({
      type: 'triangulation_failed',
      severity: 'error',
      message: 'Triangulación falló — geometría inválida'
    })
  }
  
  if (triangulation.degenerateCount > 0) {
    warnings.push({
      type: 'degenerate_triangles',
      severity: 'warning',
      message: `${triangulation.degenerateCount} triángulos degenerados (área muy pequeña)`
    })
  }
  
  return warnings
}
```

### 3. Límite de objetos

```typescript
function validateObjectCount(room: Room, objectCount: number): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  if (objectCount >= 500) {
    warnings.push({
      type: 'object_limit_exceeded',
      severity: 'error',
      message: `Recinto alcanzó límite de 500 objetos`
    })
  } else if (objectCount >= 400) {
    warnings.push({
      type: 'object_limit_warning',
      severity: 'warning',
      message: `Recinto cerca del límite: ${objectCount}/500 objetos`
    })
  }
  
  return warnings
}
```

## Interfaz pública

```typescript
class RoomValidationService {
  validate(room: Room, triangulation: TriangulationResult, objectCount: number): ValidationResult {
    const warnings: ValidationWarning[] = []
    
    warnings.push(...validateGeometry(room))
    warnings.push(...validateArea(room, triangulation))
    warnings.push(...validateObjectCount(room, objectCount))
    
    const hasErrors = warnings.some(w => w.severity === 'error')
    return { valid: !hasErrors, warnings }
  }
}
```

---

## Relacionado con

- [[Room-especificacion]] — valida esta clase
- [[CDT-algoritmo]] — triangulación que produce área
- [[CloseRoomUseCase]] — orquesta esta validación
- [[matriz-reglas-de-negocio]] — define límites y criterios

---

*Creada: 2026-09-14*