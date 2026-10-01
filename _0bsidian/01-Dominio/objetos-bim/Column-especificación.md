---
name: Column-especificación
description: Columna — elemento estructural cilíndrico o cuadrado, independiente de muros.
type: dominio
depends-on: "[[RevitObjectBase]], [[tipos-geometricos]]"
mentioned-in: "Maestro §6.4, [[CDT-algoritmo]] (huecos)"
tags: #objetos-bim #column #estructural
---

# Column — Especificación de Columna

## Resumen
Una columna es un elemento vertical, típicamente cilíndrico o prismático, que puede estar embebida en un muro o libre en el espacio.

## Propiedades

```typescript
class Column extends RevitObjectBase {
  type: 'Column' = 'Column'
  
  // Posición en el plano (Room local)
  position: Point2D                    // centro de la columna
  
  // Dimensiones
  diameter: Meters                     // si es cilíndrica (o equivalente para cuadrada)
  height: Meters                       // altura
  
  // Embebimiento (opcional)
  embeddedInWallId?: WallId            // si está embebida en un muro (null = libre)
  
  // Material
  material?: string                    // ej. "hormigón", "acero"
}
```

## Casos especiales

### Columna embebida
Si `embeddedInWallId` está definido:
- La columna está dentro del muro (no hay validación de distancia — permite cualquier posición)
- En exportación IFC, se genera como `IfcColumn` separada (no restringida al Wall)
- En triangulación CDT, el hueco de la columna se resta del polígono del Recinto

### Columna libre
Si `embeddedInWallId` es null:
- La columna está libre en el espacio del Recinto
- Se valida que está dentro del Recinto (warning si está fuera — ver [[matriz-reglas-de-negocio]])

## Validación

No hay validación de "no puede cruzar otro objeto" — las columnas pueden tocarse o superponerse (decisión de diseño, ver [[matriz-reglas-de-negocio]]).

## Triangulación y huecos

En [[CDT-algoritmo]], si una columna está dentro del Recinto:
1. Se genera un hueco circular (aproximado) alrededor de `position` con radio `diameter/2`
2. Se resta del polígono exterior durante triangulación (Fase 3)
3. Resultado: triángulos respetan la presencia de la columna

## Exportación IFC

Ver [[pseudocodigo-step-ifc.md]] §4.3: genera `IfcColumn` con `IfcCylinderGeometry` o `IfcBoundingBox`.

---

## Relacionado con

- [[RevitObjectBase]] — clase padre
- [[Wall-especificacion]] — puede estar embebida
- [[CDT-algoritmo]] — columnas son huecos en triangulación
- [[Room-especificacion]] — contiene columnas
- [[matriz-reglas-de-negocio]] — validación permisiva (no hay restricciones de cruce)

---

*Creada: 2026-09-14*