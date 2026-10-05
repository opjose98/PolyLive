---
name: Topografia-de-apoyo
description: Inverso, área real, replanteo GPS, cuadrícula, CSV/KML, IFC georreferenciado (M2b).
type: aplicación
depends-on: "[[TopographyService]], [[Georreferencia-proyecto]], [[CRS-MAGNA-SIRGAS]]"
mentioned-in: "[[estado-y-capitulos]]"
tags: #aplicación #topografía #M2b
---

# Topografía de apoyo (M2b)

Código: `src/application/geo/surveyTools.ts`, `src/ui/workspace/topo/useTopoTools.ts`, `StakeoutSheet.tsx` ·
Tests: `test/geo/surveyTools.test.ts`, `test/ifc/IFCRevitExport.test.ts` (georreferencia).

- Azimuts de cuadrícula (grados, minutos, segundos) y rumbos.
- El replanteo corrige la convergencia de meridianos para la flecha de la brújula.
- `IfcMapConversion` compone el amarre del proyecto con la ubicación del espacio.
- Mapa de fondo pendiente de licencia.
