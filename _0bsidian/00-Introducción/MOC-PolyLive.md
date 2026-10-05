---
name: MOC-PolyLive
description: Índice maestro de la bóveda. Punto de entrada a toda la arquitectura de PolyLive.
type: índice
depends-on: ""
mentioned-in: ""
tags: #MOC #índice #entrada
---

# PolyLive — Mapa de contenido

**PolyLive** es una app de levantamiento arquitectónico y BIM ligero para campo: React Native +
Expo + Skia, offline-first, con persistencia SQLite local.

Esta bóveda es la **fuente de verdad** de su arquitectura. El mapa que hace comprobable esa
afirmación es [[trazabilidad-nota-codigo-test]].

---

## Empezar por aquí

| Si quieres... | Lee |
|---|---|
| ver qué herramientas hay y en qué estado | **[[estado-y-capitulos]]** |
| entender los modos (Levantamiento, Topografía…) | [[modos-de-trabajo]] |
| saber dónde está cada funcionalidad en la app | [[mapa-de-navegacion]] |
| verificar que la bóveda corresponde al código | [[trazabilidad-nota-codigo-test]] |
| entender qué se arregló en la unificación con LevON | [[bugs-corregidos-unificacion]] |
| tocar la interfaz | [[sistema-de-diseño]] |

---

## 01 — Dominio

### Objetos BIM
[[RevitObjectBase]] · [[Wall-especificacion]] · [[Door-especificacion]] · [[Window-especificacion]]
· [[Column-especificación]] · [[Floor-especificacion]] · [[Room-especificacion]]

**Portados de LevON:** [[Project-especificacion]] · [[WallElevation-MEM]] · [[PhotoMarker-SPDS]]

### Geometría
[[tipos-geometricos]] · [[CDT-algoritmo]] · [[CDT-casos-prueba]] · [[miter-encuentros]] ·
[[snap-angular]] · [[proyecciones-punto-muro]] · [[transformaciones-coordenadas]] ·
[[sistema-coordenadas-6-capas]]

### Topografía (M2)
[[Georreferencia-proyecto]] · [[CRS-MAGNA-SIRGAS]] · [[Mojones-biblioteca]] · [[GPS-promediado]] ·
[[gpsAnchor-referencia]]
*Legado eliminado:* [[SiteCoordinateSystem]] · [[SurveyControlPoint]]

### Topología, suelo y obra (T0–M4)
[[Uniones-de-muros]] · [[Recintos-con-identidad]] · [[Suelo]] · [[Avance-de-obra]] · [[Revision]] ·
[[Topografia-de-apoyo]]

### Niveles, fases y restricciones
[[Niveles-y-fases]] · [[Restricciones-verticales]]

### Validación
[[matriz-reglas-de-negocio]] · [[WallValidationService]] · [[RoomValidationService]] ·
[[DoorWindowValidationService]] · [[ExportValidationService]] · [[ValidationWarning-tipos]]

---

## 02 — Aplicación

### Comandos y estado
[[Command-abstracción]] · [[CommandStack]] · [[lista-18-comandos]] · [[CreateWallCommand]] ·
[[CloseRoomCommand]] · [[DeleteObjectCommand]] · [[MoveWallCommand]] ·
[[UpdateWallThicknessCommand]]

### Máquina de estados
[[SurveyLifecycle]] · [[SurveyInteractionMode]] · [[transiciones-máquina]]

### Casos de uso
[[CreateWallUseCase]] · [[CreateColumnUseCase]] · [[CreateDoorUseCase]] · [[CreateWindowUseCase]] ·
[[CloseRoomUseCase]] · [[MoveObjectUseCase]] · [[DeleteObjectUseCase]] ·
[[UpdateObjectPropertyUseCase]] · [[CaptureMeasurementUseCase]] · [[CapturePhotoUseCase]] ·
[[LinkPhotoToObjectUseCase]] · [[ExportRoomIfcUseCase]]

### Editor y servicios
[[EditorController]] · [[ElevationEditor]] · [[SelectionService]] · [[ProjectService]] ·
[[WallElevationService]] · [[TopographyService]]

### Espacio de trabajo
[[modos-de-trabajo]] · [[catalogo-herramientas]] · [[alcance-nivel-fase]]

---

## 03 — Infraestructura

### Exportación
[[serializador-IFC-general]] · [[escritura-objetos-IFC]] · [[generación-GUID-IFC]] ·
[[IFC-Compatibility-Gate]] · [[ExportRoomIfcUseCase-detalles]] · **[[DXF-R2000]]**

### Copias de seguridad
[[backup-integridad]] · **[[restauracion-en-dispositivo]]**

---

## 04 — UI / UX

[[Canvas2D-interacción]] · **[[capa-viva-y-camara]]** · [[gestión-estado-Zustand]] · [[presupuesto-frame]] ·
**[[mapa-de-navegacion]]** · **[[sistema-de-diseño]]** · **[[convenciones-de-dibujo]]** · [[uso-a-una-mano]]

---

## 05 — Testing

[[estrategia-unit-testing]] · [[tests-comandos]] · [[tests-geometría-core]] ·
[[estrategia-integration-testing]] · [[flujos-integracion-documentados]] ·
[[matriz-casos-criticos]] · [[pruebas-campo-10]] · [[formato-fixture]] · [[lista-14-fixtures]] ·
[[escenarios-recuperacion]] · [[plan-validacion-final]]

---

## 06 — React Native

[[arquitectura-expo-skia]] · [[canvas-2d-skia-mapping]] · [[ble-huepa-device]] ·
[[camera-photo-capture]] · [[filesystem-photo-storage]] · [[permissions-ios-android]] ·
[[native-modules-index]] · [[apk-build-deployment]]

---

## 06 — Referencias cruzadas

**[[trazabilidad-nota-codigo-test]]** · **[[bugs-corregidos-unificacion]]** · **[[auditoria-post-M2]]**

---

## Sobre la unificación con LevON

`_LevON/` contiene una app **Flutter/Dart** independiente (v0.10.1-alpha) con funcionalidades que
PolyLive no tenía. No se pueden fusionar binariamente: son dos stacks distintos.

La decisión fue **portar LevON → TypeScript/RN**, coherente con esta bóveda, que documenta la
arquitectura RN/Expo/Skia. `_LevON/` queda como **referencia de lectura**, no se compila ni se
despliega.

Lo portado:

| De LevON | A PolyLive |
|---|---|
| `Project` + multi-espacio + `BimCodeGenerator` | [[Project-especificacion]] · [[ProjectService]] |
| Motor de Elevación de Muros (MEM/WEP) | [[WallElevation-MEM]] · [[WallElevationService]] |
| `SelectionService` (hit-testing) | [[SelectionService]] |
| `EditorController` | [[EditorController]] |
| `DxfExporter` | [[DXF-R2000]] |
| SPDS (fotos de campo con marcador) | [[PhotoMarker-SPDS]] |
| `levon_tokens.dart` | [[sistema-de-diseño]] (hoy: tema por modo) |
| Painters de planta y elevación | `ui/canvas/planRenderer.ts`, `ui/canvas/elevationRenderer.ts` |

Lo **no** portado, y por qué:

- **Consolidar `Door`/`Window` dentro de `WallOpening`** — rompería el exportador IFC, el
  CommandStack, la validación y sus tests. Se mantienen los dos modelos con correspondencia
  explícita: ver [[WallElevation-MEM]].
- **Archivos `.levon` (ZIP con JSON)** — PolyLive persiste en SQLite. Un segundo formato de
  persistencia sería una segunda fuente de verdad.
- **Riverpod / GoRouter** — equivalentes de Flutter; aquí cubren Zustand y la navegación propia (sin React Navigation desde F5).
- **Export PDF** — LevON lo declaraba pero no lo implementó. No hay nada que portar.
