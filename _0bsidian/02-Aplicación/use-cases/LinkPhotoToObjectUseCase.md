---
name: LinkPhotoToObjectUseCase
description: UseCase para vincular una foto a un objeto BIM (Wall, Column, Door, etc.).
type: aplicación
depends-on: "[[RevitObjectBase]], [[CapturePhotoUseCase]]"
mentioned-in: "Maestro §12, arquitectura-aplicacion-v1.md §6"
tags: #usecase #photo #link
---

# LinkPhotoToObjectUseCase

## Resumen
Vincula una foto capturada a un objeto BIM para auditoría/referencia.

## Interfaz

```typescript
interface LinkPhotoToObjectUseCase {
  execute(input: LinkPhotoToObjectInput): Promise<LinkPhotoToObjectOutput>
}

interface LinkPhotoToObjectInput {
  photoId: AuditPhotoId
  objectId: RevitObjectId
}

interface LinkPhotoToObjectOutput {
  success: boolean
}
```

## Flujo

```typescript
async execute(input: LinkPhotoToObjectInput): Promise<LinkPhotoToObjectOutput> {
  // 1. Verificar foto y objeto existen
  const photo = await this.objectStore.readAuditPhoto(input.photoId)
  const object = await this.objectStore.readObject(input.objectId)
  
  if (!photo || !object) throw new Error("Foto u objeto no existe")
  
  // 2. Agregar photoId a linkedPhotos del objeto
  if (!object.linkedPhotos) object.linkedPhotos = []
  object.linkedPhotos.push(input.photoId)
  
  // 3. Persistir
  await this.objectStore.updateObject(input.objectId, object)
  
  return { success: true }
}
```

---

*Creada: 2026-09-14*