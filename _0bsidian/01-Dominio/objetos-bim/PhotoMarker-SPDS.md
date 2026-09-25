---
name: PhotoMarker-SPDS
description: Sistema de fotos de campo — marcador en planta, código BIM y geolocalización.
type: dominio
depends-on: "[[CapturePhotoUseCase]], [[Room-especificacion]]"
mentioned-in: "[[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]]"
tags: #objetos-bim #fotos #SPDS #portado-de-levon
---

# PhotoMarker — Sistema de Fotografías de Campo (SPDS)

## Por qué importa

Una foto de obra **sin ubicación es casi inútil** al volver al despacho. "La humedad del rincón" no
se puede situar en el plano tres días después, y menos si el levantamiento tiene cuarenta fotos.

El marcador ancla la foto a un punto concreto de la planta y la hace localizable.

## Modelo

La metadata vive dentro de `audit_photos.metadata_json`, no en una tabla nueva: el marcador es una
**propiedad de la foto**, no una entidad con ciclo de vida propio.

```typescript
interface PhotoMarker {
  position: Point2D     // coordenadas mundo del Recinto
  direction?: number    // rumbo de la cámara en grados desde +X
  visible?: boolean     // oculto ≠ borrado
}

interface PhotoMetadata {
  timestamp: number     // obligatorio
  filename: string      // obligatorio
  bimCode?: string      // FOT001, FOT002... dentro del Recinto
  marker?: PhotoMarker
  geo?: { latitude, longitude, accuracyMeters }
  linkedObjectId?: string
  operator?: string
  notes?: string
}
```

## Decisiones de diseño

### Todos los campos salvo `timestamp` y `filename` son opcionales

Una foto tomada con prisa, sin GPS y sin vincular sigue siendo una foto válida. Exigir metadatos
convertiría la captura en un formulario, y en obra eso significa que no se toman fotos.

### `direction` dibuja el cono de visión

Sin él, un marcador dice **dónde se estaba** pero no **qué se estaba mirando**.

### Ocultar ≠ borrar

En un levantamiento con muchas fotos del mismo rincón, la planta se llena de marcadores
superpuestos. Poder apagar algunos sin perder la foto es lo que mantiene el plano legible.

### El GPS no bloquea la captura

En un sótano no hay fix. Perder la foto por eso sería absurdo: la foto sin coordenadas sigue
teniendo su marcador en la planta, que es la ubicación que de verdad hace falta.

### Los overlays son NO DESTRUCTIVOS

Los datos (fecha, GPS, código BIM, posición) se dibujan **encima** de la imagen en la pantalla, no se
queman en el JPEG. El archivo original se mantiene intacto, que es lo que hace falta si la foto se va
a usar como prueba documental o se va a entregar a un tercero. Por eso el overlay se puede apagar.

Es la misma decisión que tomó LevON en `photo_overlay_stack.dart`.

### `AuditPhoto.metadata` nunca lanza

Un `metadata_json` corrupto (una escritura interrumpida, una fila migrada a mano) dejaría la galería
entera sin abrir por una sola foto mal escrita. Se devuelve lo mínimo indispensable y la foto sigue
siendo visible, que es lo que le importa al operador.

## Invariante del GPS

`ExpoGpsProvider` **nunca devuelve `accuracy <= 0`**. Android e iOS pueden entregar
`accuracy: null` (sin estimación) o 0; aceptarlo tal cual haría estallar el constructor de
[[SurveyControlPoint]] más tarde, lejos de la causa y con un mensaje que no menciona el GPS.

Una precisión peor que el máximo aceptable (±25 m por defecto) también se rechaza: un mojón con
±80 m de error es peor que no tener mojón, porque **parece un dato y no lo es**.

## Flujo de captura anclada

1. Herramienta **Foto** en el editor → el toque fija `pendingPhotoPoint`
2. La vista abre la cámara (el controlador es lógica pura, no conoce `expo-camera`)
3. Se guarda el JPEG en disco y se registra el `AuditPhoto` con su código BIM y su GPS
4. `EditorController.attachPhotoMarker()` escribe el marcador en la metadata
5. El marcador aparece en la planta, con su código BIM como etiqueta

## Código

- `src/domain/objects/audit-photo.ts`
- `src/application/editor/EditorController.ts` (herramienta `photo`, `attachPhotoMarker`)
- `src/ui/canvas/planRenderer.ts` (`drawPhotoMarkers`)
- `src/ui/components/PhotoViewer.tsx`
- `src/native/location/ExpoGpsProvider.ts`

## Tests

- `test/editor/EditorController.test.ts` — bloque "fotos ancladas a la planta"
- `test/native/location/ExpoGpsProvider.test.ts` — 11 tests
