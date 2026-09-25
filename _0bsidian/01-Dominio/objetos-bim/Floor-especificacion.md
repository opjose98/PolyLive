---
name: Floor-especificación
description: Piso/Losa — plano horizontal de cierre del Recinto, materialización implícita al cerrar.
type: dominio
depends-on: "[[RevitObjectBase]], [[Room-especificación]]"
mentioned-in: "Maestro §6.5, §6.6, [[CloseRoomUseCase]]"
tags: #objetos-bim #floor #superficie
---

# Floor — Especificación de Piso/Losa

## Resumen
Un piso es una superficie horizontal (plano Z constante) que cierra el Recinto. **Se materializa automáticamente** cuando el usuario cierra un Recinto, a menos que ya exista uno explícito.

## Propiedades

```typescript
class Floor extends RevitObjectBase {
  type: 'Floor' = 'Floor'
  
  // No tiene geometría propia — la hereda del Room
  // La geometría es el contorno del Room proyectado al nivel Z
  
  // Propiedades
  material?: string                    // ej. "cerámica", "madera", "hormigón"
  thickness?: Meters                   // espesor de la losa (informativo)
  isImplicit: boolean                  // true si se generó automáticamente, false si es explícito
}
```

## Generación automática

Cuando se cierra un Recinto (ver [[CloseRoomUseCase]]):

```typescript
if (room.isOpen === false && !existsExplicitFloor(room)) {
  const implicitFloor = new Floor({
    id: generateId(),
    roomId: room.id,
    isImplicit: true,
    material: "default"
  })
  await objectStore.createObject(implicitFloor)
}
```

**Resultado:** el Recinto siempre tiene un Floor, explícito o implícito.

## Invariantes

- Solo un Floor por Recinto
- `isImplicit: true` si se generó automáticamente
- `isImplicit: false` si el usuario lo creó explícitamente

## Validación

No hay validación — un Floor nunca falla.

## Exportación IFC

Ver [[pseudocodigo-step-ifc.md]] §4.4: genera `IfcSlab` (tipo FLOOR) con geometría de extrusión (contorno del Room + espesor).

---

## Relacionado con

- [[RevitObjectBase]] — clase padre
- [[Room-especificación]] — contiene Floor (1:1)
- [[CloseRoomUseCase]] — materializa Floor implícito

---

*Creada: 2026-09-14*