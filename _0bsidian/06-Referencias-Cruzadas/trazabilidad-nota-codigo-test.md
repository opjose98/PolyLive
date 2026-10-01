---
name: trazabilidad-nota-codigo-test
description: Mapa nota ↔ código ↔ test. La bóveda como fuente de verdad, verificable.
type: referencia
depends-on: ""
mentioned-in: "[[MOC-PolyLive]]"
tags: #referencia #trazabilidad #índice
---

# Trazabilidad: nota ↔ código ↔ test

Este mapa existe para que "la bóveda es la fuente de verdad" sea **comprobable** y no un eslogan.
Si una fila no tiene test, es una decisión consciente y está dicho.

## Dominio

| Nota | Código | Test |
|---|---|---|
| [[RevitObjectBase]] | `domain/objects/base.ts` | `test/sqlite/ObjectStore.test.ts` |
| [[Wall-especificacion]] | `domain/objects/wall.ts` | `test/sqlite/ObjectStore.test.ts` |
| [[Door-especificacion]] | `domain/objects/door.ts` | `test/sqlite/ObjectStore.test.ts` |
| [[Window-especificacion]] | `domain/objects/window.ts` | `test/sqlite/ObjectStore.test.ts` |
| [[Column-especificación]] | `domain/objects/column.ts` | `test/sqlite/AdvancedEntities.test.ts` |
| [[Floor-especificacion]] | `domain/objects/floor.ts` | `test/sqlite/AdvancedEntities.test.ts` |
| [[Room-especificacion]] | `domain/objects/room.ts` | `test/application/UseCase.integration.test.ts` |
| **[[Project-especificacion]]** | `domain/objects/project.ts` | `test/projects/ProjectService.test.ts` |
| **[[WallElevation-MEM]]** | `domain/objects/wall-elevation.ts` | `test/elevation/WallElevationService.test.ts` |
| **[[PhotoMarker-SPDS]]** | `domain/objects/audit-photo.ts` | `test/editor/EditorController.test.ts` |
| ~~[[SurveyControlPoint]]~~ | eliminado ([[auditoria-post-M2]]) | — |
| ~~[[SiteCoordinateSystem]]~~ | eliminado ([[auditoria-post-M2]]) | — |
| **[[Georreferencia-proyecto]]** | `domain/geo/georeference.ts` | `test/geo/georeference.test.ts` |
| **[[CRS-MAGNA-SIRGAS]]** | `domain/geo/crs.ts` | `test/geo/georeference.test.ts` |
| **[[Mojones-biblioteca]]** | `domain/geo/benchmark.ts`, `infrastructure/sqlite/GeoStore.ts` | `test/infrastructure/GeoStore.test.ts` |
| **[[GPS-promediado]]** | `domain/geo/gpsAverage.ts`, `native/location/GpsAverager.ts` | `test/geo/georeference.test.ts` |
| **[[Restricciones-verticales]]** | `domain/objects/vertical.ts` | `test/domain/vertical.test.ts` |
| **[[Niveles-y-fases]]** | `domain/objects/marker.ts`, `infrastructure/sqlite/MarkerStore.ts` | `test/application/workspace.test.ts` |

## Geometría

| Nota | Código | Test |
|---|---|---|
| [[CDT-algoritmo]] | `domain/geometry/CDT.ts` | `test/geometry/CDT.test.ts` |
| [[miter-encuentros]] | `domain/geometry/miter.ts` | `test/canvas/MiterHandler.test.ts` |
| [[snap-angular]] | `domain/geometry/snap.ts` | `test/canvas/SnapHandler.test.ts` |
| [[proyecciones-punto-muro]] | `domain/geometry/projections.ts` | `test/editor/EditorController.test.ts` (vía colocación de vanos) |
| [[transformaciones-coordenadas]] | `domain/geometry/coordinates.ts` | `test/canvas/CanvasManager.test.ts` |
| [[tipos-geometricos]] | `domain/geometry/types.ts` | — (solo tipos) |

## Aplicación

| Nota | Código | Test |
|---|---|---|
| [[CommandStack]] | `application/state/CommandStack.ts` | `test/application/CommandStack.test.ts` |
| [[Command-abstracción]] | `application/commands/` | `test/application/Command.test.ts` |
| [[CreateWallUseCase]] | `application/use-cases/CreateWallUseCase.ts` | `test/application/UseCase.integration.test.ts` |
| [[CloseRoomUseCase]] | `application/use-cases/CloseRoomUseCase.ts` | `test/integration/EndToEnd.test.ts` |
| [[CaptureMeasurementUseCase]] | `application/use-cases/CaptureMeasurementUseCase.ts` | `test/field/FieldScenarios.test.ts` |
| [[CapturePhotoUseCase]] | `application/use-cases/CapturePhotoUseCase.ts` | `test/application/CapturePhotoUseCase.test.ts` |
| [[ExportRoomIfcUseCase]] | `application/use-cases/ExportRoomIfcUseCase.ts` | `test/integration/EndToEnd.test.ts` |
| **[[EditorController]]** | `application/editor/EditorController.ts` | `test/editor/EditorController.test.ts` |
| **[[SelectionService]]** | `application/canvas/SelectionService.ts` | `test/canvas/SelectionService.test.ts` |
| **[[ProjectService]]** | `application/projects/ProjectService.ts` | `test/projects/ProjectService.test.ts` |
| **[[WallElevationService]]** | `application/elevation/WallElevationService.ts` | `test/elevation/WallElevationService.test.ts` |

## Infraestructura

| Nota | Código | Test |
|---|---|---|
| [[serializador-IFC-general]] | `infrastructure/export/ifc/IFCSerializer.ts` | `test/ifc/IFCSerializer.test.ts` |
| [[IFC-Compatibility-Gate]] | `infrastructure/export/ifc/compatibility-gate.ts` | `test/infrastructure/IFCSerializerAdapter.test.ts` |
| **[[DXF-R2000]]** | `infrastructure/export/dxf/DXFSerializer.ts` | `test/export/DXFSerializer.test.ts` |
| [[backup-integridad]] | `native/backup/ExpoBackupDatabaseUseCase.ts` | `test/native/backup/ExpoBackupDatabaseUseCase.test.ts` |
| **[[restauracion-en-dispositivo]]** | `native/backup/ExpoRestoreDatabaseUseCase.ts` | `test/native/backup/ExpoRestoreDatabaseUseCase.test.ts` |
| [[gpsAnchor-referencia]] | `native/location/ExpoGpsProvider.ts` | `test/native/location/ExpoGpsProvider.test.ts` |
| [[ble-huepa-device]] | `native/ble/HuepaDeviceManager.ts` | `test/native/ble/HuepaDeviceManager.test.ts` |

## UI / UX

| Nota | Código | Test |
|---|---|---|
| [[Canvas2D-interacción]] | `ui/canvas/planRenderer.ts` | `test/ui/planRenderer.test.ts` |
| [[canvas-2d-skia-mapping]] | `native/canvas/SkiaCanvasAdapter.ts` | `test/native/canvas/SkiaCanvasAdapter.test.ts` |
| [[gestión-estado-Zustand]] | `state/appStore.ts` | `test/canvas/appStore.test.ts` |
| **[[mapa-de-navegacion]]** | `ui/App.tsx`, `ui/screens/` | — (ver nota abajo) |
| **[[sistema-de-diseño]]** | `ui/theme/tokens.ts`, `ui/components/fields.tsx` | — (ver nota abajo) |

### Por qué los componentes React no tienen tests

El proyecto **no tiene** `@testing-library/react-native` ni `react-test-renderer` instalados, y
añadirlos es una decisión de dependencias que no se ha tomado.

La estrategia adoptada en su lugar es **sacar la lógica de los componentes**:

- qué hace un toque según la herramienta → [[EditorController]] (56 tests)
- qué objeto hay bajo el dedo → [[SelectionService]] (24 tests)
- qué se dibuja exactamente → `planRenderer` / `elevationRenderer`, funciones puras sobre
  `ICanvasRenderer`, verificadas con un renderer que registra llamadas (27 tests)

Los componentes que quedan son **vistas delgadas**: suscriben un estado y lo pintan. Es el hueco
conocido que queda, y está acotado a propósito.

## Estado de la suite

```
50 suites · 764 tests · 4 todo · 0 fallos
src/  ~25 000 líneas
test/ ~14 800 líneas
```

Los 4 `it.todo` restantes están todos en `test/field/FieldScenarios.test.ts` y son **legítimos**:
tres requieren un dispositivo físico (importar el IFC a Revit, force-close real, prueba de batería
de una hora) y uno requiere una capa de red que no existe.

> Había un quinto, obsoleto: afirmaba que `shared/errors/AppError.ts` "no existe todavía en src/".
> Sí existía. Se convirtió en un test real en `test/integration/CrashRecovery.test.ts`. Ver
> [[bugs-corregidos-unificacion]] sobre otros comentarios que describían gaps ya cerrados.

## Espacio de trabajo, alzado y lienzo (F0–PR #11)

| Nota | Código | Test |
|---|---|---|
| [[EditorController]] | `application/editor/EditorController.ts` | `test/editor/EditorController.test.ts` |
| [[ElevationEditor]] | `application/elevation/ElevationEditor.ts` | `test/elevation/` |
| [[TopographyService]] | `application/geo/TopographyService.ts`, `application/geo/coordinateText.ts` | `test/geo/TopographyService.test.ts`, `test/geo/coordinateText.test.ts` |
| [[modos-de-trabajo]] · [[catalogo-herramientas]] | `application/workspace/catalog.ts` | `test/application/workspace.test.ts` |
| [[alcance-nivel-fase]] | `application/workspace/levelScope.ts` | `test/application/levelScope.test.ts` |
| [[capa-viva-y-camara]] | `ui/canvas/PlanCanvas.tsx`, `ui/canvas/liveOverlay.ts`, `ui/canvas/ElevationCanvas.tsx` | teléfono (no hay tests de render) |
| [[convenciones-de-dibujo]] | `ui/canvas/planRenderer.ts`, `ui/canvas/wallGeometry.ts` | `test/ui/planRenderer.test.ts`, `test/ui/wallGeometry.test.ts` |
| [[sistema-de-diseño]] | `ui/design/theme.ts` | teléfono |
| [[uso-a-una-mano]] | `ui/workspace/ThumbUndo.tsx` | teléfono |

