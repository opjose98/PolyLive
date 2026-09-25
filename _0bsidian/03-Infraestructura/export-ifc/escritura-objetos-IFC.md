---
name: escritura-objetos-IFC
description: writeWall(), writeColumn(), writeDoor(), writeWindow() con IfcOpeningElement.
type: infraestructura
depends-on: "[[serializador-IFC-general]], [[Wall-especificación]], [[Door-especificación]]"
mentioned-in: "pseudocodigo-step-ifc.md §4"
tags: #ifc #serialización #objetos
---

# Escritura de Objetos a IFC

## writeWall(wall: Wall, spaceId: string): string
Genera líneas STEP para un IfcWall con nombre y geometría.

Entrada: Wall object
Salida: STEP lines (#N=IfcWall(...))

## writeColumn(column: Column, spaceId: string): string
Genera IfcColumn con IfcCylinderGeometry (o IfcBoundingBox).

Entrada: Column object
Salida: STEP lines (#N=IfcColumn(...))

## writeDoor(door: Door, wallId: string, parentWallGuid: string): string
Genera IfcOpeningElement dentro del IfcWall, más IfcDoor vinculado.

Entrada: Door object
Salida: STEP lines (#N=IfcOpeningElement(...), #M=IfcDoor(...))

## writeWindow(window: Window, wallId: string, parentWallGuid: string): string
Similar a writeDoor pero para ventanas (IfcWindow).

## writeRoom(room: Room): string
Genera IfcSpace con geometría como IfcPolyline.

Entrada: Room object con geometry validado
Salida: STEP lines (#N=IfcSpace(...))

---

*Creada: 2026-09-14*