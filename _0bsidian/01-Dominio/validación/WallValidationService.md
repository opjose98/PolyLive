---
name: WallValidationService
description: Servicio de validación de muros — detecta cruces no-esperados, ángulos agudos, etc.
type: dominio
depends-on: "[[Wall-especificacion]], [[miter-encuentros]], [[matriz-reglas-de-negocio]]"
mentioned-in: "Maestro §5.5, arquitectura-carpetas-v1.md §1.1"
tags: #validación #core #wall
---

# WallValidationService

## Resumen
Antes de persistir un muro nuevo o modificado, se valida que:
1. No cruza otro muro de forma no-esperada (fuera de esquina/T-joint limpia)
2. No tiene ángulos extremadamente agudos
3. Tiene propiedades válidas (thickness > 0, etc.)

## Validaciones

### 1. Cruce no-esperado con otro muro

```typescript
function validateWallCrosses(newWall: Wall, existingWalls: Wall[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  for (const existing of existingWalls) {
    const intersection = findIntersection(newWall, existing)
    
    if (intersection) {
      // ¿Es un encuentro esperado (esquina o T-joint)?
      if (!isMiterEncounter(intersection, newWall, existing)) {
        warnings.push({
          type: 'wall_cross_unexpected',
          severity: 'error',  // BLOQUEA
          message: `Muro cruza ${existing.id} sin ser encuentro limpio`
        })
      }
    }
  }
  
  return warnings
}
```

**Resultado:** Error bloqueante si el cruce no es esperado.

### 2. Ángulos agudos

```typescript
function validateWallAngle(wall: Wall, existingWalls: Wall[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  for (const existing of existingWalls) {
    const miter = calculateMiter(wall, existing)
    if (miter && miter.angle < degrees(10)) {
      warnings.push({
        type: 'acute_angle',
        severity: 'warning',  // SOLO WARNING
        message: `Ángulo muy agudo: ${miter.angle}°`
      })
    }
  }
  
  return warnings
}
```

**Resultado:** Solo warning, permitido continuar.

### 3. Propiedades básicas

```typescript
function validateWallProperties(wall: Wall): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  if (wall.thickness <= 0) {
    warnings.push({ type: 'invalid_thickness', severity: 'error', message: 'Espesor debe ser > 0' })
  }
  if (wall.height <= 0) {
    warnings.push({ type: 'invalid_height', severity: 'error', message: 'Alto debe ser > 0' })
  }
  if (wall.startPoint === wall.endPoint) {
    warnings.push({ type: 'degenerate_wall', severity: 'error', message: 'Muro sin longitud' })
  }
  
  return warnings
}
```

## Interfaz pública

```typescript
class WallValidationService {
  validate(newWall: Wall, context: ValidationContext): ValidationResult {
    const warnings: ValidationWarning[] = []
    
    warnings.push(...validateWallProperties(newWall))
    warnings.push(...validateWallAngle(newWall, context.existingWalls))
    warnings.push(...validateWallCrosses(newWall, context.existingWalls))
    
    const hasErrors = warnings.some(w => w.severity === 'error')
    
    return {
      valid: !hasErrors,
      warnings
    }
  }
}
```

---

## Relacionado con

- [[Wall-especificacion]] — valida esta clase
- [[miter-encuentros]] — determina si un cruce es "esperado"
- [[matriz-reglas-de-negocio]] — define qué es error vs warning
- [[arquitectura-carpetas-v1.md]] — ubicación del servicio en capas

---

*Creada: 2026-09-14*