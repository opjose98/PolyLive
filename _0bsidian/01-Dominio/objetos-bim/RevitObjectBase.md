---
name: RevitObjectBase
description: Clase base para todos los objetos BIM — Wall, Door, Window, Column, Floor, Room.
type: dominio
depends-on: "[[tipos-geométricos]]"
mentioned-in: "Maestro §6"
tags: #objetos-bim #core #base
---

# RevitObjectBase — Clase Base de Objetos BIM

## Resumen
Todas los objetos en un Recinto (muros, puertas, columnas, etc.) heredan de `RevitObjectBase`, que define las propiedades comunes: identidad, timestamps, y referencias al Recinto.

## Definición

```typescript
abstract class RevitObjectBase {
  // Identidad
  id: RevitObjectId                    // único dentro del Recinto
  type: 'Wall' | 'Door' | 'Window' | 'Column' | 'Floor' | 'Room'
  roomId: RoomId                       // REQUERIDO — todo objeto BIM pertenece a un Recinto
  
  // Propiedades generales
  properties: ObjectProperties         // propiedades específicas del tipo
  geometry_json: string                // serialización de puntos/forma
  
  // Auditoría
  created_at: Date
  updated_at: Date
  is_deleted: boolean                  // soft-delete (no se borra físicamente)
  
  // Fotos vinculadas
  linkedPhotos: AuditPhotoId[]
}

interface ObjectProperties {
  name?: string
  material?: string
  notes?: string
  [key: string]: any  // propiedades específicas del tipo
}
```

## Invariantes

- `id` es siempre único dentro del Recinto y no cambia
- `roomId` es REQUERIDO — nunca null
- `is_deleted: true` significa soft-delete — el objeto sigue en SQLite pero se excluye de exportaciones
- `created_at <= updated_at` siempre

## Operaciones CRUD

```typescript
interface IObjectStore {
  createObject(obj: RevitObjectBase): Promise<RevitObjectId>
  readObject(id: RevitObjectId): Promise<RevitObjectBase | null>
  updateObject(id: RevitObjectId, updates: Partial<RevitObjectBase>): Promise<void>
  deleteObject(id: RevitObjectId): Promise<void>  // soft-delete
  listObjects(roomId: RoomId): Promise<RevitObjectBase[]>
}
```

## Relacionado con

- [[Wall-especificación]] — hereda de RevitObjectBase
- [[Door-especificación]], [[Window-especificación]], [[Column-especificación]] — heredan
- [[Floor-especificación]], [[Room-especificación]] — casos especiales que heredan
- [[SQLiteObjectStore]] — implementación de IObjectStore

---

*Creada: 2026-09-14*