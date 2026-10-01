---
name: gpsAnchor-referencia
description: Captura de GPS — ubicación aproximada de Sede/Bloque/Recinto, solo referencial en MVP v0.1.
type: dominio
depends-on: "[[tipos-geometricos]], [[sistema-coordenadas-6-capas]]"
mentioned-in: "Maestro §4.3, sistema-coordenadas-y-transformaciones.md §5"
tags: #survey #gps #referencia
---

# gpsAnchor — Referencia Geográfica

## Resumen
Un `gpsAnchor` es una captura de GPS (lat/lon/alt) que se guarda junto a una Sede, Bloque o Recinto, **solo para referencia documental**. En MVP v0.1, **no se usa para cálculos internos** — la geometría de los objetos BIM es siempre relativa a coordenadas locales.

## Propiedades

```typescript
interface GpsAnchor {
  latitude: number                     // grados decimales (ej. 2.4356)
  longitude: number                    // grados decimales (ej. -75.5234)
  altitude: Meters                     // metros sobre el nivel del mar
  accuracy: Meters                     // precisión del GPS (ej. ±5m, ±10m)
  timestamp: Date                      // cuándo se capturó
  source: 'device_gps' | 'manual'     // de dónde viene
}
```

## Cuándo se captura

- **Automáticamente:** Al abrir una Sede nueva, se captura el GPS del dispositivo
- **Manualmente:** Operario puede ajustar si el GPS fue inexacto
- **Nunca para cálculos:** Solo se usa para vista Topográfica y exportación de referencia

## Invariantes

- `accuracy > 0` siempre (nunca asumir precisión perfecta)
- La presentación de `latitude`/`longitude` nunca debe ser más precisa que `accuracy` (ej. si accuracy=±10m, no mostrar 6 decimales de lat/lon)
- No se actualiza con el movimiento del dispositivo — es un snapshot del momento en que se abrió la Sede

## Diferencia con SiteCoordinateSystem

| Aspecto | gpsAnchor | SiteCoordinateSystem |
|---|---|---|
| Propósito | Referencia documental (¿dónde estamos en el mundo?) | Definición operativa (¿cómo posicionamos Recintos?) |
| Precision | Típicamente ±5m a ±10m | Arbitraria (local, sin vinculación GPS) |
| Permanencia | Se puede actualizar | Inmutable una vez definido |
| Uso en cálculos | NO (referencia solamente) | SÍ (transformación de coordenadas) |

## Exportación

- **IFC:** No se incluye en el archivo (no es un objeto BIM)
- **CSV de referencia:** Se incluye como columnas adicionales (lat, lon, alt, accuracy)
- **Vista Topográfica:** Se usa para mostrar brújula y posición aproximada en mapa

---

## Relacionado con

- [[SurveyControlPoint]] — mojones de control usan GPS también
- [[sistema-coordenadas-6-capas]] — capa 5 (Geographic)
- [[SiteCoordinateSystem]] — sistema operativo, independiente de GPS

---

*Creada: 2026-09-14*