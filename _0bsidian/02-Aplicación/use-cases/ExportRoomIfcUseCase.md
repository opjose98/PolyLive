---
name: ExportRoomIfcUseCase
description: UseCase para exportar un Recinto a IFC — orquesta validación, generación en worker, y guardado.
type: aplicación
depends-on: "[[Room-especificacion]], [[IFCSerializer]], [[ExportValidationService]]"
mentioned-in: "Maestro §9, arquitectura-aplicacion-v1.md §7"
tags: #usecase #export #ifc
---

# ExportRoomIfcUseCase

## Resumen
Exporta un Recinto (cerrado) a archivo IFC:
1. Valida que el Recinto está listo (cerrado, sin errores críticos)
2. Recolecta todos los objetos (Wall, Door, Column, Floor, etc.)
3. Envía a worker (o hilo) para generar IFC
4. Guarda el archivo

## Interfaz

```typescript
interface ExportRoomIfcUseCase {
  execute(input: ExportRoomIfcInput): Promise<ExportRoomIfcOutput>
}

interface ExportRoomIfcInput {
  roomId: RoomId
  filePath: string                  // dónde guardar el .ifc
}

interface ExportRoomIfcOutput {
  ifcFile: string
  warnings: ValidationWarning[]
  exportTime: number               // ms
}
```

## Flujo

```typescript
async execute(input: ExportRoomIfcInput): Promise<ExportRoomIfcOutput> {
  const startTime = Date.now()
  
  // 1. Validar
  const room = await this.objectStore.readObject(input.roomId)
  const validationResult = this.exportValidationService.validateRoomExport(room)
  if (!validationResult.valid) throw new ValidationError(...)
  
  // 2. Recolectar objetos
  const allObjects = await this.objectStore.listObjects(input.roomId)
  const walls = allObjects.filter(o => o instanceof Wall)
  const doors = allObjects.filter(o => o instanceof Door)
  const columns = allObjects.filter(o => o instanceof Column)
  const floor = allObjects.find(o => o instanceof Floor)
  
  // 3. Generar IFC en worker
  const ifcContent = await this.ifcSerializer.serialize({
    room,
    walls,
    doors,
    columns,
    floor,
    siteCoordinateSystem: this.siteCoordinateSystem
  })
  
  // 4. Guardar
  await fs.writeFile(input.filePath, ifcContent, 'utf8')
  
  const exportTime = Date.now() - startTime
  
  return {
    ifcFile: input.filePath,
    warnings: validationResult.warnings,
    exportTime
  }
}
```

## Vanos sin carpintería (H-70)

Los huecos de la herramienta «Vano» viven en el alzado de su muro, no como Door/Window. `exportActions.ts`
(`elevationOpenings`) los reúne junto con los antepechos y llegan como `bareOpenings`; `IFCSerializer.ts`
escribe cada uno como `IfcOpeningElement` + `IfcRelVoidsElement` sin `IfcRelFillsElement`, y descuenta su área
en `NetSideArea` del muro. Test: `test/ifc/IFCRevitExport.test.ts` («un vano sin carpintería recorta su muro…»).

---

*Creada: 2026-09-14*