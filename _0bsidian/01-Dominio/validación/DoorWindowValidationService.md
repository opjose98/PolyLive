---
name: DoorWindowValidationService
description: Validación de puertas y ventanas — verificar que no sobresalen del muro padre.
type: dominio
depends-on: "[[Door-especificacion]], [[Window-especificacion]], [[Wall-especificacion]], [[proyecciones-punto-muro]]"
mentioned-in: "Maestro §5.4, [[matriz-reglas-de-negocio]]"
tags: #validación #vano #door #window
---

# DoorWindowValidationService

## Resumen
Valida que puertas y ventanas:
1. Pertenecen a un muro válido (no huérfanas)
2. No sobresalen del muro (warning, no bloqueo)
3. Dimensiones válidas

## Validaciones

### 1. Muro padre válido

```typescript
function validateParentWall(vano: Door | Window, walls: Wall[]): ValidationWarning[] {
  const parent = walls.find(w => w.id === vano.parentWallId)
  
  if (!parent) {
    return [{
      type: 'orphan_vano',
      severity: 'error',
      message: `Vano huérfano: muro padre ${vano.parentWallId} no existe`
    }]
  }
  
  return []
}
```

### 2. Dentro de los límites del muro

```typescript
function validateWithinWallBounds(vano: Door | Window, wall: Wall): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  const endOffset = vano.offsetAlongWall + vano.width
  
  if (vano.offsetAlongWall < 0 || endOffset > (wall.length as number)) {
    warnings.push({
      type: 'vano_outside_wall',
      severity: 'warning',  // SOLO WARNING
      message: `Vano sobresale del muro (offset: ${vano.offsetAlongWall}, fin: ${endOffset}, largo: ${wall.length})`
    })
  }
  
  const perpBound = (wall.thickness as number) / 2
  if (Math.abs(vano.offsetPerpendicular as number) > perpBound) {
    warnings.push({
      type: 'vano_perpendicular_outside',
      severity: 'warning',
      message: `Offset perpendicular fuera del espesor del muro`
    })
  }
  
  return warnings
}
```

### 3. Dimensiones válidas

```typescript
function validateVanoDimensions(vano: Door | Window): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  
  if (vano.width <= 0) {
    warnings.push({ type: 'invalid_width', severity: 'error', message: 'Ancho debe ser > 0' })
  }
  if (vano.height <= 0) {
    warnings.push({ type: 'invalid_height', severity: 'error', message: 'Alto debe ser > 0' })
  }
  
  return warnings
}
```

## Interfaz pública

```typescript
class DoorWindowValidationService {
  validateDoor(door: Door, context: ValidationContext): ValidationResult {
    const warnings: ValidationWarning[] = []
    
    warnings.push(...validateVanoDimensions(door))
    warnings.push(...validateParentWall(door, context.walls))
    
    const parent = context.walls.find(w => w.id === door.parentWallId)
    if (parent) {
      warnings.push(...validateWithinWallBounds(door, parent))
    }
    
    const hasErrors = warnings.some(w => w.severity === 'error')
    return { valid: !hasErrors, warnings }
  }
  
  validateWindow(window: Window, context: ValidationContext): ValidationResult {
    // Idéntico a validateDoor
    return this.validateDoor(window as any, context)
  }
}
```

---

## Relacionado con

- [[Door-especificacion]], [[Window-especificacion]] — valida estas clases
- [[Wall-especificacion]] — muro padre
- [[proyecciones-punto-muro]] — cálculo de offsets
- [[matriz-reglas-de-negocio]] — defining error vs warning

---

*Creada: 2026-09-14*