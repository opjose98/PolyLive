---
name: permissions-ios-android
description: Solicitud y gestión de permisos en iOS y Android
type: technical
depends-on: "[[CapturePhotoUseCase]], [[ble-huepa-device]]"
tags: #permissions #ios #android #security
---

# Permissions (iOS + Android)

## app.json Configuration

```json
{
  "plugins": [
    ["expo-camera", {
      "cameraPermission": "Capturar fotos de levantamiento"
    }],
    ["expo-location", {
      "locationAlwaysAndWhenInUsePermission": "Geolocalización para levantamiento"
    }],
    ["expo-file-system"]
  ],
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "Capturar fotos",
      "NSBluetoothPeripheralUsageDescription": "Conectar a Huepa BLE",
      "NSLocationWhenInUseUsageDescription": "GPS para levantamiento"
    }
  },
  "android": {
    "permissions": [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT"
    ]
  }
}
```

## Runtime Permissions (Code)

```typescript
// Camera
const { status } = await Camera.requestCameraPermissionsAsync()
if (status !== 'granted') {
  // Mostrar error
}

// Location
const { status } = await Location.requestForegroundPermissionsAsync()

// Bluetooth (Android 12+)
if (Platform.OS === 'android') {
  const { status } = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
  )
}
```

*Creada: 2026-09-16*