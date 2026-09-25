---
name: native-modules-index
description: Índice de módulos Expo + React Native usados en Spike #8
type: reference
depends-on: "[[arquitectura-expo-skia]]"
tags: #expo #modules #dependencies
---

# Native Modules Index

## Expo Modules

- **expo-camera** — Camera access
- **expo-file-system** — FileSystem read/write
- **expo-skia** — 2D graphics (Canvas)
- **expo-sqlite** — SQLite database
- **expo-ble** o **react-native-ble-plx** — Bluetooth

## React Native Core

- react-native
- @react-navigation/native — Navigation
- zustand — State management (sin cambios)

## Dev Dependencies

- expo-dev-client (optional, para custom dev builds)
- eas-cli (Expo Application Services, para build)

## Installation

```bash
expo install expo-camera expo-file-system expo-skia expo-sqlite
npm install react-native-ble-plx  # o expo-ble
```

*Creada: 2026-09-16*