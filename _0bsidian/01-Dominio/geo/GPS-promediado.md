---
name: GPS-promediado
description: Promedio ponderado de lecturas GPS con el celular quieto N segundos; dispersión y aviso de precisión.
type: dominio
depends-on: "[[gpsAnchor-referencia]]"
mentioned-in: "[[Mojones-biblioteca]], [[Georreferencia-proyecto]], [[TopographyService]]"
tags: #dominio #topografía #gps #M2
---

# GPS promediado

Código: `src/domain/geo/gpsAverage.ts` (puro), `src/native/location/GpsAverager.ts` (expo-location),
`src/ui/workspace/topo/GpsCaptureSheet.tsx` (anillo de progreso).

- Lecturas cada 1 s (`BestForNavigation`) durante los segundos del proyecto (30 por defecto, 5–600, drawer ⋮).
- Peso 1/precisión²; se informa la **dispersión real** observada además de la precisión declarada.
- Por encima de **5 m**: aviso "impreciso para amarrar".
- Se puede terminar antes o cancelar.
- `GpsCoordinates` (una lectura suelta del proveedor) vive en el mismo archivo: precisión **siempre > 0**.

Un GPS de celular da 3–15 m: sirve para ubicar, no para replantear. El amarre recomendado es por mojones.
