---
name: Door-especificación
description: Puerta — vano en muro, con dimensiones y propiedades de acceso.
type: dominio
depends-on: "[[RevitObjectBase]], [[Wall-especificacion]], [[proyecciones-punto-muro]]"
mentioned-in: "Maestro §6.3, [[matriz-reglas-de-negocio]]"
tags: #objetos-bim #vano #door
---

# Door — Especificación de Puerta

## Resumen
Una puerta es un vano (abertura) en un muro, definida por su posición y dimensiones.

## Propiedades

```typescript
class Door extends RevitObjectBase {
  type: 'Door' = 'Door'
  
  // Relación con muro padre
  parentWallId: WallId                 // REQUERIDO — la puerta siempre pertenece a un muro
  
  // Posición en el muro (ver [[proyecciones-punto-muro]])
  offsetAlongWall: Meters              // distancia desde el inicio del muro
  offsetPerpendicular: Meters          // distancia perpendicular (< espesor del muro / 2)
  
  // Dimensiones
  width: Meters                        // ancho de la abertura
  height: Meters                       // alto de la abertura
  
  // Propiedades
  doorType?: string                    // ej. "swing", "sliding", "bifold"
  material?: string                    // ej. "madera", "vidrio"
}
```

## Invariantes

- `parentWallId` es REQUERIDO y siempre válido (referencia a [[Wall-especificacion]] existente)
- `offsetAlongWall >= 0 && offsetAlongWall + width <= wall.length` (restricción suave — warning si se viola)
- `offsetPerpendicular` debe estar dentro del espesor del muro (restricción suave)
- `width > 0 && height > 0`

## Validación

Ver [[DoorWindowValidationService]]:
- Si sobresale del muro: **warning, no bloqueo** (ver [[matriz-reglas-de-negocio]])
- Relación con Wall padre: **si el Wall se borra, la Door se borra en cascada** (soft-delete)

## Exportación IFC

Ver [[pseudocodigo-step-ifc.md]] §4.2: genera `IfcOpeningElement` dentro del `IfcWall` padre, con dimensiones exactas.

---

## Relacionado con

- [[RevitObjectBase]] — clase padre
- [[Wall-especificacion]] — muro padre (requerido)
- [[Window-especificacion]] — similar, pero ventana
- [[proyecciones-punto-muro]] — cálculo de offsetAlongWall y offsetPerpendicular
- [[DoorWindowValidationService]] — validación
- [[Room-especificacion]] — contiene muro que contiene puerta (jerarquía)

---

*Creada: 2026-09-14*