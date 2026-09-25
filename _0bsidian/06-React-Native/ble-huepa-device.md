---
name: ble-huepa-device
description: Integración BLE con dispositivo Huepa real en Expo
type: technical
depends-on: "[[CaptureMeasurementUseCase]]"
tags: #ble #huepa #device #hardware
---

# BLE Huepa Device Integration

## Dispositivo Huepa
- Protocolo: BLE GATT
- Medición: distancia láser
- Precisión: ±5mm
- Muestras: 7 @ 100ms intervals
- UUID service: (si disponible)
- UUID characteristic: (si disponible)

## Flujo Captura Medición

1. Scan BLE devices
2. Find Huepa (by name or UUID)
3. Connect
4. Start measurement → read 7 samples
5. Calculate: promedio, desv estándar
6. Disconnect

## Implementation

- expo-ble (si disponible en Expo)
- react-native-ble-plx (alternativa)
- Mock para desarrollo (simula 7 muestras)

## Fallback

Si Huepa no disponible:
- Usar mock que simula mediciones reales (3.45m ± 0.05m)
- Permitir desarrollo sin hardware

*Creada: 2026-09-16*