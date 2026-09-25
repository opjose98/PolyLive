---
name: gestión-estado-Zustand
description: AppState y slices (survey, ble, ui, control-points) con Zustand.
type: ui
depends-on: "[[SurveyLifecycle]], [[Room-especificación]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md"
tags: #estado #zustand #react
---

# Gestión de Estado — Zustand

## AppState (raíz)

Slices:

### survey slice
- currentRoomId: RoomId | null
- currentSurveyState: SurveyState (idle, creating, editing, recovering, exporting)
- currentInteractionMode: InteractionMode (draw, move, measure, audit)
- commandStack: CommandStack

### ble slice
- bleEnabled: boolean
- bleDevice: BLEDevice | null
- lastMeasurement: Measurement | null

### ui slice
- canvasTransform: CanvasTransform
- propertyPanelOpen: boolean
- selectedObjectId: RevitObjectId | null
- snapAngularEnabled: boolean
- snapAngularTolerance: Degrees

### control-points slice
- controlPoints: SurveyControlPoint[]
- siteCoordinateSystem: SiteCoordinateSystem | null

## Acceso

```typescript
const room = useAppStore(state => state.currentRoom)
const setRoom = useAppStore(state => state.setSurveyRoom)
```

---

*Creada: 2026-09-14*