---
name: pruebas-campo-10
description: 10 casos de prueba en campo real — dispositivo, BLE, captura, exportación.
type: testing
depends-on: "[[CaptureMeasurementUseCase]], [[CapturePhotoUseCase]], [[ExportRoomIfcUseCase]]"
mentioned-in: "Maestro §13"
tags: #testing #field #real-world
---

# Pruebas de Campo (10 Casos)

1. **Trazo de 4 muros en habitación real** — verificar que CDT calcula área correctamente
2. **BLE measurement con Huepa** — capturar 7 muestras, verificar promedio ± tolerance
3. **Foto de muro + link a objeto** — capturar, guardar, vincular sin errores
4. **Exportar IFC desde levantamiento completo** — abrir en Revit/IFC viewer
5. **Undo/redo en campo** — cambiar Wall, undo, verificar
6. **Crash recovery en campo** — force-close app, restart, restore
7. **BLE device desconecta mid-measurement** — graceful error handling
8. **Foto storage full** — app maneja disk space bien
9. **Network (si aplica) — upload IFC** — transmisión sin corrupción
10. **Battery stress test** — 1 hora de mediciones, no crash

---

*Creada: 2026-09-15*