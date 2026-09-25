---
name: arquitectura-expo-skia
description: Adaptación de arquitectura TypeScript a Expo + Skia para React Native
type: architecture
depends-on: "[[arquitectura-aplicacion-v1]], [[Canvas2D-interacción]]"
tags: #react-native #expo #skia #architecture
---

# Arquitectura Expo + Skia

## Transformación: Web → Mobile

### Layer Mapping
- Domain: IGUAL (pure TypeScript)
- Infrastructure: SQLite → expo-sqlite
- Application: IGUAL (UseCases, Commands)
- State: Zustand IGUAL
- UI: HTML/Canvas → React Native + Skia

### Expo Stack
- Runtime: Expo (managed app framework)
- Canvas: Skia (2D graphics engine)
- BLE: expo-ble o react-native-ble-plx
- Camera: expo-camera
- FileSystem: expo-file-system
- Storage: expo-sqlite

### New Layer: src/native/
- canvas/ — SkiaCanvasAdapter
- ble/ — HuepaDeviceManager
- camera/ — ExpoPhotoCapture
- filesystem/ — ExpoFileSystem
- permissions/ — PermissionManager

*Creada: 2026-09-16*