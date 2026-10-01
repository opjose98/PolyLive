---
name: CapturePhotoUseCase
description: UseCase para capturar foto y guardar en filesystem con rollback en SQLite.
type: aplicación
depends-on: "[[Room-especificacion]], [[PhotoRepository]]"
mentioned-in: "Maestro §12, arquitectura-aplicacion-v1.md §6"
tags: #usecase #photo #audit
---

# CapturePhotoUseCase

## Resumen
Captura una foto del dispositivo, la guarda en filesystem y la registra en SQLite. Si SQLite falla, hace rollback del archivo.

## Interfaz

```typescript
interface CapturePhotoUseCase {
  execute(input: CapturePhotoInput): Promise<CapturePhotoOutput>
}

interface CapturePhotoInput {
  roomId: RoomId
  photoBlob: Blob                   // imagen JPEG del dispositivo
}

interface CapturePhotoOutput {
  photoId: AuditPhotoId
  filePath: string
  fileSize: number
}
```

## Flujo con transacción

```typescript
async execute(input: CapturePhotoInput): Promise<CapturePhotoOutput> {
  // 1. Generar filename único
  const timestamp = Date.now()
  const filename = `room-${input.roomId}-${timestamp}.jpg`
  const filePath = path.join(this.photoRepository.basePath, `room-${input.roomId}`, filename)
  
  try {
    // 2. Escribir archivo
    await fs.writeFile(filePath, input.photoBlob)
    const fileSize = input.photoBlob.size
    
    // 3. Crear registro en SQLite
    const photo = {
      id: generateId(),
      room_id: input.roomId,
      file_path: filePath,
      foto: input.photoBlob,  // BLOB
      metadata_json: JSON.stringify({ timestamp, filename }),
      is_deleted: false,
      created_at: new Date()
    }
    
    const photoId = await this.objectStore.createAuditPhoto(photo)
    
    return { photoId, filePath, fileSize }
  } catch (error) {
    // Rollback: eliminar archivo si SQLite falló
    try {
      await fs.unlink(filePath)
    } catch (e) {
      // Log pero no fallar
    }
    throw new Error("No se pudo capturar foto: " + error.message)
  }
}
```

---

*Creada: 2026-09-14*