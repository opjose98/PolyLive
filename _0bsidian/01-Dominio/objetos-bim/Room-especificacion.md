---
name: Room-especificación
description: Recinto/Espacio — contenedor de muros, columnas, puertas, ventanas. Entidad central del Levantamiento.
type: dominio
depends-on: "[[RevitObjectBase]], [[tipos-geométricos]], [[CDT-algoritmo]]"
mentioned-in: "Maestro §6.7 (CORREGIDO §4.1), [[CloseRoomUseCase]], [[sistema-coordenadas-6-capas]]"
tags: #objetos-bim #core #room #contenedor
---

# Room — Especificación de Recinto

## Resumen
Un Recinto es la unidad principal de levantamiento. Contiene todo (muros, columnas, puertas, ventanas) y define el espacio que el operario está midiendo.

## Propiedades

```typescript
class Room extends RevitObjectBase {
  type: 'Room' = 'Room'
  
  // Identidad (INVARIANTE: id === roomId)
  id: RoomId
  roomId: RoomId
  
  // Relación obligatoria con Piso
  levelId: LevelId
  
  // Geometría
  geometry: Point2D[]
  isClosed: boolean
  
  // Estado
  isOpen: boolean
  
  // Propiedades calculadas
  get area(): SquareMeters | null {
    return this.isOpen ? null : calculateAreaFromTriangulation(this.geometry)
  }
  
  // Sistema de coordenadas local
  localOrigin: Point2D
}
```

## Invariantes (CRÍTICAS)

- `id === roomId` **SIEMPRE** (verificada en validación)
- `levelId` es REQUERIDO y válido
- Si `isOpen === false` → `area` está definida (calculada por CDT)
- Si `isOpen === true` → `area` es null (no se calcula hasta cerrar)
- `geometry.length >= 3` (mínimo 3 vértices para un polígono)

## Ciclo de vida

1. Creación: isOpen = true, geometry = [], isClosed = false
2. Trazo: usuario agrega vértices, geometry crece
3. Cierre: usuario cierra el polígono → CDT calcula área → isOpen = false
4. Finalización: se exporta o se abandona

## Comportamiento especial: isClosed vs isOpen

- **`isClosed`:** ¿geométricamente cierra el polígono? (distancia último→primer < 5cm)
- **`isOpen`:** ¿aún se puede editar? (estado de negocio)

Son **independientes:** un Room puede estar `isClosed: true` pero `isOpen: true` (cerrado geométricamente pero aún editable).

## Operaciones

### Agregar vértice

```typescript
function addVertex(room: Room, point: Point2D): void {
  if (!room.isOpen) throw new Error("Room cerrado, no se pueden agregar vértices")
  room.geometry.push(point)
}
```

### Cerrar Recinto

```typescript
async function closeRoom(room: Room): Promise<void> {
  const triangulation = await CDT.triangulate(room.geometry, [/* columnas como huecos */])
  room.area = triangulation.totalArea
  room.isOpen = false
}
```

## Validación

Ver [[RoomValidationService]]:
- `geometry.length >= 3`
- Polígono no auto-intersectante
- Área válida (no degenerada)
- No más de 500 objetos BIM (muros + columnas + puertas + ventanas)

## Exportación IFC

Ver [[pseudocodigo-step-ifc.md]] §5: genera `IfcSpace` (Room en IFC) que contiene:
- Geometry como `IfcPolyline` del contorno
- Material y propiedades (nombre, área)
- Referencias a todos los muros, columnas, vanos que contiene

## Relacionado con

- [[RevitObjectBase]] — clase padre
- [[Wall-especificación]], [[Door-especificación]], [[Window-especificación]], [[Column-especificación]] — contenidas en Room
- [[Floor-especificación]] — materialización implícita
- [[CDT-algoritmo]] — triangulación al cerrar
- [[RoomValidationService]] — validación
- [[CloseRoomUseCase]] — orquesta cierre
- [[Level]], [[Site]] — jerarquía arquitectónica

---

*Creada: 2026-09-14*