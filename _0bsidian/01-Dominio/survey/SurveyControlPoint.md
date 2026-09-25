---
name: SurveyControlPoint
description: Mojones/benchmarks topográficos — puntos de control para posicionamiento de múltiples Recintos.
type: dominio
depends-on: "[[tipos-geométricos]], [[sistema-coordenadas-6-capas]]"
mentioned-in: "Maestro §4.3.2, estrategia-testing-y-fixtures.md"
tags: #survey #topografía #control-point
---

# SurveyControlPoint — Punto de Control Topográfico

## Resumen
Un punto de control es un mojón físico (ej. esquina de edificio, marca en el terreno) que se usa como referencia para posicionar múltiples Recintos dentro de una Sede. A diferencia de los objetos BIM (Wall, Door, etc.), un ControlPoint pertenece a la **Sede completa**, no a un Recinto individual.

## Propiedades

```typescript
interface SurveyControlPoint {
  id: SurveyControlPointId
  siteId: SiteId                       // pertenece a Sede, no a Room
  
  // Posición en coordenadas de Sede (ver sistema-coordenadas-6-capas)
  localCoordinates: Point3D            // en sistema Site (metros)
  gpsCoordinates: {
    latitude: number                   // grados decimales
    longitude: number
    altitude: Meters
    accuracy: Meters                   // precisión del GPS (ej. ±5m)
  }
  
  // Metadata
  name?: string                        // ej. "Esquina NE edificio", "Marca roja terraza"
  notes?: string
  capturedAt: Date
}
```

## Propósito

### En MVP v0.1: Referencia documentaria
- El operario captura puntos de control en campo (con GPS del dispositivo)
- Se exportan a un CSV o archivo aparte
- **NO se usan para cálculos internos** (riesgo aceptado explícito en este MVP)

### En futuras versiones: Posicionamiento de Recintos
- Dos operarios miden el mismo ControlPoint desde Recintos diferentes
- Sistema alinea los Recintos automáticamente usando la triangulación de ControlPoints
- Esto resuelve el problema: "¿cómo posiciono Room-A relativo a Room-B dentro de la misma Sede?"

## Invariantes

- `siteId` es REQUERIDO (pertenece a Sede, no a Room)
- Solo un ControlPoint por mojón físico (no duplicar la misma esquina)
- `gpsCoordinates.accuracy` siempre > 0 (nunca asumir precisión perfecta)

## Exportación

En pseudocodigo-step-ifc.md §4.3, se exporta como:
- `IfcSurveyPoint` dentro del archivo IFC (referencia documental)
- O CSV aparte con todas las coordenadas (formato: name, x_site, y_site, lat, lon, alt, accuracy)

---

## Relacionado con

- [[sistema-coordenadas-6-capas]] — usa coordenadas Site + Geographic
- [[SiteCoordinateSystem]] — los ControlPoints ayudan a definir el sistema
- [[Room-especificación]] — múltiples Rooms se alinean con ControlPoints
- [[estrategia-testing-y-fixtures.md]] — fixture `site-with-control-points.json`

---

*Creada: 2026-09-14*