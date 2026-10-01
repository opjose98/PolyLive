---
name: estado-y-capitulos
description: La app en 11 capítulos con el estado de cada herramienta (✅ funciona, 🟡 parcial, ⬜ fase, ⚠️ incoherente).
type: índice
depends-on: "[[catalogo-herramientas]], [[modos-de-trabajo]], [[mapa-de-navegacion]]"
mentioned-in: "[[MOC-PolyLive]]"
tags: #índice #estado #herramientas
---

# Estado y capítulos (2026-10-01)

Informe completo, herramienta por herramienta: `docs/18-INFORME-HERRAMIENTAS.md`.

| Cap. | Nombre | Notas clave | Estado |
|---|---|---|---|
| 1 | Entrada y organización | [[Project-especificacion]] · [[ProjectService]] · [[restauracion-en-dispositivo]] | ✅ |
| 2 | Lienzo y navegación | [[capa-viva-y-camara]] · [[sistema-de-diseño]] · [[uso-a-una-mano]] | ✅ (⚠️ toggles sin efecto) |
| 3 | Levantamiento en planta | [[EditorController]] · [[convenciones-de-dibujo]] · [[Wall-especificacion]] | ✅ |
| 4 | Niveles y fases | [[Niveles-y-fases]] · [[Restricciones-verticales]] · [[alcance-nivel-fase]] | ✅ |
| 5 | Alzado | [[ElevationEditor]] · [[WallElevation-MEM]] | ✅ |
| 6 | Topografía | [[Georreferencia-proyecto]] · [[Mojones-biblioteca]] · [[TopographyService]] | ✅ M2 · ⬜ M2b |
| 7 | Fotos y auditoría | [[PhotoMarker-SPDS]] · [[CapturePhotoUseCase]] | ✅ |
| 8 | Exportación | [[serializador-IFC-general]] · [[DXF-R2000]] | ✅ (sin IfcMapConversion) |
| 9 | Avance de obra | — | ⬜ F6a Suelo → M3 |
| 10 | Revisión | — | ⬜ M4 |
| 11 | Herramientas de dibujo | [[catalogo-herramientas]] | ⬜ F6b |

## Siguiente (en orden)

1. Corregir los ⚠️: snaps de vértice y punto medio; deshabilitar lo que no tiene función.
2. Guardar el tema entre sesiones.
3. M2b — IFC georreferenciado primero; decidir licencia del mapa offline.
4. F6a Suelo → M3 Avance → M4 Revisión → F6b.
