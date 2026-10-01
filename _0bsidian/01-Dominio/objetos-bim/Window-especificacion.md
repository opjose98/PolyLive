---
name: Window-especificación
description: Ventana — vano en muro, similar a Door pero propósito diferente.
type: dominio
depends-on: "[[RevitObjectBase]], [[Wall-especificacion]], [[proyecciones-punto-muro]]"
mentioned-in: "Maestro §6.3"
tags: #objetos-bim #vano #window
---
# Window — Especificación de Ventana

## Resumen
Una ventana es un vano en un muro, estructuralmente similar a una puerta pero con propósito diferente (ventilación, iluminación).

## Propiedades

```typescript
class Window extends RevitObjectBase {
  type: 'Window' = 'Window'
  
  // Relación con muro padre
  parentWallId: WallId                 // REQUERIDO
  
  // Posición (igual a Door)
  offsetAlongWall: Meters
  offsetPerpendicular: Meters
  
  // Dimensiones
  width: Meters
  height: Meters
  
  // Propiedades específicas de ventana
  windowType?: string                  // ej. "fixed", "casement", "sliding"
  frameType?: string                   // ej. "aluminum", "PVC", "wood"
  glazing?: string                     // ej. "single", "double", "triple"
}
```

## Diferencias con Door

- **Structure:** idéntica
- **Semantics:** Window es ventana (no acceso), Door es acceso
- **Exportación IFC:** ambas usan `IfcOpeningElement`, pero con diferentes propiedades de Material y Type

## Invariantes

Idénticas a [[Door-especificacion]]

## Validación

Idéntica a [[Door-especificacion]] — ver [[DoorWindowValidationService]]

## Exportación IFC

Similar a [[Door-especificacion]], pero con atributos de vidriería.

---

## Relacionado con

- [[Door-especificacion]] — gemela estructural
- Resto igual a Door

---

*Creada: 2026-09-14*