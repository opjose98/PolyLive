---
name: filesystem-photo-storage
description: Almacenamiento persistente de fotos en disco con expo-file-system
type: technical
depends-on: "[[LinkPhotoToObjectUseCase]]"
tags: #filesystem #storage #expo
---

# FileSystem Photo Storage

## API: expo-file-system

```typescript
import * as FileSystem from 'expo-file-system'

const photoDir = `${FileSystem.documentDirectory}photos/`

// Save photo
const filename = `photo-${Date.now()}.jpg`
const filepath = `${photoDir}${filename}`
await FileSystem.writeAsStringAsync(filepath, base64, {
  encoding: FileSystem.EncodingType.Base64
})

// List photos
const files = await FileSystem.readDirectoryAsync(photoDir)

// Delete photo
await FileSystem.deleteAsync(filepath)
```

## Directory Estructura

DocumentDirectory/  
└── photos/  
├── photo-1694956800000.jpg  
├── photo-1694956810000.jpg  
└── ...

## Integración 
- CapturePhotoUseCase → guarda a FileSystem 
- LinkPhotoToObjectUseCase → vincula uri a objeto 
- ObjectStore → persiste metadata en SQLite 

*Creada: 2026-09-16*