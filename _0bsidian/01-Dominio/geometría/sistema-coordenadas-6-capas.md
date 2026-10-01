---
name: sistema-coordenadas-6-capas
description: Las 6 capas de transformación de coordenadas — Screen, Canvas, Room local, Level, Site, Geographic.
type: dominio
depends-on: "[[tipos-geometricos]]"
mentioned-in: "Maestro §4.3/4.4/11.3, sistema-coordenadas-y-transformaciones.md"
tags: #geometría #coordenadas #core
---

# Sistema de Coordenadas — 6 Capas

## Visión general

Screen (píxeles físicos del dispositivo)
→ CanvasTransform (zoom, pan)
Canvas (píxeles lógicos del área de dibujo)
→ escala metros↔píxeles
Room local (metros, origen arbitrario del Recinto)
→ offset de posición del Recinto dentro del Piso
Level (metros, relativo al Piso — Z absoluta)
→ SiteCoordinateSystem (origen + rotación de Sede)
Project/Site (metros, relativo al origen de Sede)
→ gpsAnchor (referencia, NO cálculo — Maestro §4.3)
Geographic (lat/lon/alt — solo documental en MVP v0.1)

## 1. SCREEN → CANVAS

**Input:** Coordenada de toque física (`{x, y}` en píxeles del SO)
**Output:** Píxel lógico dentro de `Canvas2D`
**Unidad:** Píxeles (no metros — puramente UI)
**Transformación:** Restar offset del Canvas dentro de la pantalla completa

```typescript
function screenToCanvas(screenPoint: Point2D, canvasLayout: LayoutInfo): Point2D {
  return {
    x: screenPoint.x - canvasLayout.offsetX,
    y: screenPoint.y - canvasLayout.offsetY
  }
}
```

## 2. CANVAS → ROOM LOCAL

**Input:** `Point2D` en píxeles de Canvas
**Output:** `Point2D` en metros, sistema local del Room
**Unidad:** Metros (`Meters`, branded type)
**Nota importante:** Y+ se invierte aquí (Canvas Y+ abajo → Room Y+ arriba)

```typescript
interface CanvasTransform {
  scale: number    // píxeles por metro
  offsetX: number  // píxeles
  offsetY: number  // píxeles
}

function screenToWorld(point: Point2D, t: CanvasTransform): Point2D {
  return {
    x: (point.x - t.offsetX) / t.scale,
    y: (point.y - t.offsetY) / t.scale  // Y se invierte en el renderizado
  }
}
```

## 3. ROOM LOCAL → LEVEL (PISO)

**Input:** `Point3D` en metros, sistema local del Room
**Output:** `Point3D` relativo al Piso
**Nota:** En MVP v0.1, cada Room tiene su propio origen local — no hay posicionamiento relativo entre Rooms de un mismo Piso (riesgo aceptado explícito)

## 4. LEVEL → PROJECT/SITE

**Input:** `Point3D` relativo al Piso
**Output:** `Point3D` relativo al origen de Sede
**Rotación:** Aplicada por `SiteCoordinateSystem.northRotation`

```typescript
function levelPointToSitePoint(
  point: Point3D,
  roomOriginInSite: Point3D,
  coordinateSystem: SiteCoordinateSystem
): Point3D {
  
  // 1. Trasladar al origen relativo del Room
  const translated = {
    x: (point.x as number) + (roomOriginInSite.x as number),
    y: (point.y as number) + (roomOriginInSite.y as number),
    z: (point.z as number) + (roomOriginInSite.z as number)
  }
  
  // 2. Rotar según northRotation
  const angle = degreesToRadians(coordinateSystem.northRotation)
  const rotated = {
    x: translated.x * Math.cos(angle) - translated.y * Math.sin(angle),
    y: translated.x * Math.sin(angle) + translated.y * Math.cos(angle),
    z: translated.z
  }
  
  // 3. Trasladar al origen absoluto de Sede
  return {
    x: meters(rotated.x + (coordinateSystem.origin.x as number)),
    y: meters(rotated.y + (coordinateSystem.origin.y as number)),
    z: meters(rotated.z + (coordinateSystem.origin.z as number))
  }
}
```

## 5. PROJECT/SITE → GEOGRAPHIC

**Input:** `Point3D` relativo a Sede
**Output:** `{lat, lon, alt}` aproximados
**Nota:** Referencia únicamente — NO se usa para cálculos internos

## Invariantes transversales

- Cada transformación es **unidireccional para geometría operable** (Screen → Room local)
- Bidireccional solo para **visualización/referencia** (Room local → Geographic)
- Ninguna capa salta niveles (no se pasa de Canvas directamente a Site, siempre va por Room)

## Relacionado con

- [[tipos-geometricos]] — usa Point2D, Point3D
- [[transformaciones-coordenadas]] — fórmulas exactas de cada transformación
- [[SiteCoordinateSystem]] — define rotación y origen de Sede
- [[Canvas2D-interacción]] — aplica CanvasTransform en tiempo real

---

*Creada: 2026-09-14*