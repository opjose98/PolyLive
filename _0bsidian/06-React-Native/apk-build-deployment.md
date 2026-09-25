---
name: apk-build-deployment
description: Build y deployment de APK a Motorola Edge 50
type: technical
depends-on: "[[arquitectura-expo-skia]]"
tags: #build #apk #deployment #eas
---

# APK Build & Deployment

## Setup EAS

```bash
npm install -g eas-cli
eas login  # with Expo account
eas build:configure --platform android
```

## eas.json

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"  # Google Play
      }
    }
  }
}
```

## Build Local (en tu máquina)

```bash
cd app-bim-typescript
eas build --platform android --local
# Output: app-release.apk (~80 MB)
```

## Deploy a Motorola Edge 50

### Opción A: adb (USB debugging)
```bash
adb devices  # list connected devices
adb install app-release.apk
adb shell pm grant com.polylivebim android.permission.CAMERA
adb shell pm grant com.polylivebim android.permission.BLUETOOTH
```

### Opción B: Manual
1. Transferir APK vía Google Drive
2. Abrir en Motorola Edge 50
3. Instalar (Settings → Apps → Unknown sources)
4. Grant permissions en primer launch

## Verificación

```bash
adb logcat | grep ReactNativeJS  # logs de app
```

*Creada: 2026-09-16*