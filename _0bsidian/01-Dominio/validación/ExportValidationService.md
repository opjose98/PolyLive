---
name: ExportValidationService
description: Validación previa a exportación — verifica SiteCoordinateSystem, Room abierto, etc.
type: dominio
depends-on: "[[Room-especificacion]], [[SiteCoordinateSystem]], [[matriz-reglas-de-negocio]]"
mentioned-in: "Maestro §9.5, pseudocodigo-step-ifc.md §9"
tags: #validación #export #ifc
---

# ExportValidationService

## Resumen
Antes de exportar IFC, verifica que:
1. Room está cerrado (o emite warning si no)
2. SiteCoordinateSystem está definido (si es exportación de Sede)
3. Archivos pueden escribirse

## Validaciones

### 1. Room cerrado

```typescript
function validateRoomClosed(room: Room): ValidationWarning[] {
  if (room.isOpen) {
    return [{
      type: 'room_open_export',
      severity: 'warning',
      message: 'Room aún está abierto — la exportación incluirá un polígono incompleto'
    }]
  }
  return []
}
```

**Resultado:** Warning persistente en UI, pero permite exportar.

### 2. SiteCoordinateSystem definido (para Sede consolidada)

```typescript
function validateSiteCoordinateSystem(
  exportScope: 'room' | 'site',
  siteCoordinateSystem: SiteCoordinateSystem | null
): ValidationWarning[] {
  
  if (exportScope === 'site' && !siteCoordinateSystem) {
    return [{
      type: 'site_coordinate_system_missing',
      severity: 'warning',
      message: 'SiteCoordinateSystem no definido — la Sede exportada estará sin posicionamiento relativo'
    }]
  }
  
  return []
}
```

**Resultado:** Warning, permite exportar (pero posicionamiento será {0,0}).

### 3. Permisos de filesystem

```typescript
function validateFilesystemAccess(exportPath: string): ValidationWarning[] {
  try {
    fs.accessSync(exportPath, fs.constants.W_OK)
    return []
  } catch (e) {
    return [{
      type: 'filesystem_access_denied',
      severity: 'error',
      message: `No se puede escribir en ${exportPath}`
    }]
  }
}
```

## Interfaz pública

```typescript
class ExportValidationService {
  validateRoomExport(room: Room): ValidationResult {
    const warnings: ValidationWarning[] = []
    
    warnings.push(...validateRoomClosed(room))
    
    const hasErrors = warnings.some(w => w.severity === 'error')
    return { valid: !hasErrors, warnings }
  }
  
  validateSiteExport(rooms: Room[], siteCoordinateSystem: SiteCoordinateSystem | null): ValidationResult {
    const warnings: ValidationWarning[] = []
    
    for (const room of rooms) {
      warnings.push(...validateRoomClosed(room))
    }
    warnings.push(...validateSiteCoordinateSystem('site', siteCoordinateSystem))
    
    const hasErrors = warnings.some(w => w.severity === 'error')
    return { valid: !hasErrors, warnings }
  }
}
```

---

## Relacionado con

- [[Room-especificacion]] — valida state
- [[SiteCoordinateSystem]] — verificación de existencia
- [[pseudocodigo-step-ifc.md]] — exportador que usa este servicio
- [[ExportRoomIfcUseCase]], [[ExportSiteIfcUseCase]] — orquestadores

---

*Creada: 2026-09-14*