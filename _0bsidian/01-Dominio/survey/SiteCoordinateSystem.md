---
name: SiteCoordinateSystem
description: Sistema de coordenadas de Sede — origen y rotación que posiciona todos los Recintos.
type: dominio
depends-on: "[[tipos-geometricos]], [[sistema-coordenadas-6-capas]], [[transformaciones-coordenadas]]"
mentioned-in: "Maestro §4.3.1, sistema-coordenadas-y-transformaciones.md §4"
tags: #survey #coordenadas #site
---

> **LEGADO — eliminado en la [[auditoria-post-M2]].** La topografía es por proyecto: ver
> [[Georreferencia-proyecto]] y [[CRS-MAGNA-SIRGAS]]. Esta nota queda como historia del Spike #7.


# SiteCoordinateSystem — Sistema de Coordenadas de Sede

## Resumen
Una Sede (edificio, zona de trabajo) requiere un sistema de coordenadas único que defina dónde está el "origen" (ej. esquina NE del edificio) y hacia dónde apunta el "norte". Todos los Recintos se posicionan dentro de este sistema.

## Propiedades

```typescript
interface SiteCoordinateSystem {
  siteId: SiteId                       // de cuál Sede es este sistema
  
  // Origen (ubicación del punto (0,0,0) en coordenadas de Sede)
  origin: Point3D                      // en metros, sistema global o GPS
  
  // Rotación (hacia dónde apunta el "norte" de la Sede)
  northRotation: Degrees               // rotación desde eje X+ hacia norte
  
  // Metadata
  definedAt: Date
  definedBy: OperatorId               // qué operario lo definió
}
```

## Definición: Cuándo y cómo

**Momento:** Obligatorio antes de trazar el primer Recinto de una Sede (Maestro §4.3.1).

**Proceso (UI/UX):**
1. Operario abre una Sede nueva
2. Sistema pide: "Define el sistema de coordenadas de esta Sede"
3. Operario coloca un punto en el mapa (ej. esquina del edificio) → `origin`
4. Operario orienta un vector hacia el norte (con brújula o línea visual) → `northRotation`
5. Sistema guarda y cierra el diálogo

## Transformación matemática

Ver [[transformaciones-coordenadas]]: la función `levelPointToSitePoint()` usa:

```typescript
function levelPointToSitePoint(
  point: Point3D,
  roomOriginInSite: Point3D,
  coordinateSystem: SiteCoordinateSystem
): Point3D {
  // 1. Trasladar al origen del Room
  // 2. Rotar por northRotation
  // 3. Trasladar por origin de Sede
}
```

## Invariantes

- `origin` es único por Sede (solo un sistema de coordenadas)
- `northRotation` está en [0°, 360°)
- Una vez definido, **no debe cambiar** (cambiar el sistema invalidaría todas las coordenadas de Recintos ya trazados)

## Riesgo aceptado explícito

**En MVP v0.1:** No hay mecanismo de UI para posicionar un Recinto relativo a otro dentro de la misma Sede (parámetro `roomOriginInSite` de `levelPointToSitePoint()` no tiene flujo de entrada). Esto se resuelve en sesión de refinamiento antes de exportación de Sede consolidada.

---

## Relacionado con

- [[sistema-coordenadas-6-capas]] — capa 4 (Level → Site)
- [[transformaciones-coordenadas]] — fórmulas de rotación y traslación
- [[SurveyControlPoint]] — mojones que ayudan a definir el sistema
- [[ExportSiteIfcUseCase]] — requiere SiteCoordinateSystem definido

---

*Creada: 2026-09-14*