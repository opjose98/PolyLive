---
name: estado-y-capitulos
description: La app en 11 capítulos con el estado de cada herramienta (✅ funciona, 🟡 parcial, ⬜ fase, ⚠️ incoherente).
type: índice
depends-on: "[[catalogo-herramientas]], [[modos-de-trabajo]], [[mapa-de-navegacion]]"
mentioned-in: "[[MOC-PolyLive]]"
tags: #índice #estado #herramientas
---

# Estado y capítulos (2026-10-03)

Informe completo, herramienta por herramienta: `docs/18-INFORME-HERRAMIENTAS.md`.

| Cap. | Nombre | Notas clave | Estado |
|---|---|---|---|
| 1 | Entrada y organización | [[Project-especificacion]] · [[ProjectService]] · [[restauracion-en-dispositivo]] | ✅ |
| 2 | Lienzo y navegación | [[capa-viva-y-camara]] · [[sistema-de-diseño]] · [[uso-a-una-mano]] | ✅ (⚠️ toggles sin efecto) |
| 3 | Levantamiento en planta | [[EditorController]] · [[Uniones-de-muros]] · [[Recintos-con-identidad]] · [[Suelo]] | ✅ (T0, F6a) |
| 4 | Niveles y fases | [[Niveles-y-fases]] · [[Restricciones-verticales]] · [[alcance-nivel-fase]] | ✅ |
| 5 | Alzado | [[ElevationEditor]] · [[WallElevation-MEM]] | ✅ |
| 6 | Topografía | [[Georreferencia-proyecto]] · [[Mojones-biblioteca]] · [[TopographyService]] · [[Topografia-de-apoyo]] | ✅ M2 · ✅ M2b (mapa ⬜) |
| 7 | Fotos y auditoría | [[PhotoMarker-SPDS]] · [[CapturePhotoUseCase]] | ✅ |
| 8 | Exportación | [[serializador-IFC-general]] · [[DXF-R2000]] | ✅ IfcSpace por recinto, IfcSlab por suelo, IfcMapConversion |
| 9 | Avance de obra | [[Avance-de-obra]] | ✅ M3 |
| 10 | Revisión | [[Revision]] | ✅ M4 |
| 11 | Herramientas de dibujo | [[catalogo-herramientas]] | ⬜ F6b |

## Siguiente (en orden)

1. Pruebas de campo en teléfono (lista en `docs/20`).
2. F6b: Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Vano, Viga, Cercha, Correa.
3. Mapa de fondo offline (decidir licencia).
4. Bloqueantes de la auditoría (respaldo externo, migraciones, medida cara a cara).
