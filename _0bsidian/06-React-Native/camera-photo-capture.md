---
name: camera-photo-capture
description: Captura de fotos con cámara nativa en Expo
type: technical
depends-on: "[[CapturePhotoUseCase]]"
tags: #camera #photo #expo
---

# Camera Photo Capture (Expo)

## API: expo-camera

```typescript
import { CameraView } from 'expo-camera'

// Request permission
const { status } = await Camera.requestCameraPermissionsAsync()

// Capture photo
const photo = await cameraRef.current?.takePictureAsync({
  quality: 0.8,
  base64: true,
  exif: true
})
// Result: { uri, base64, width, height, exif }
```

## Flujo Captura

1. User abre modo cámara
2. Preview en pantalla
3. Tap para capturar
4. Foto guardada a base64
5. Link a objeto BIM
6. Guardada en FileSystem

## Permisos

- iOS: NSCameraUsageDescription (Info.plist)
- Android: android.permission.CAMERA (AndroidManifest.xml)

*Creada: 2026-09-16*