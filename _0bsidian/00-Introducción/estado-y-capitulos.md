---
name: estado-y-capitulos
description: La app en 11 capítulos con el estado de cada herramienta (✅ funciona, 🟡 parcial, ⬜ fase, ⚠️ incoherente).
type: índice
depends-on: "[[catalogo-herramientas]], [[modos-de-trabajo]], [[mapa-de-navegacion]]"
mentioned-in: "[[MOC-PolyLive]]"
tags: #índice #estado #herramientas
---

# Estado y capítulos (2026-10-22)

Estado verificado en la tableta Lenovo TB370FU (Expo 57): matriz `docs/25-MATRIZ-PRUEBAS-CAMPO.md` (ronda 1 y § 6
ronda 2) e informe `docs/26-INFORME-ESTABLE-CAMPO.md`. Inventario original herramienta por herramienta:
`docs/18-INFORME-HERRAMIENTAS.md`.

| Cap. | Nombre | Notas clave | Estado |
|---|---|---|---|
| 1 | Entrada y organización | [[Project-especificacion]] · [[ProjectService]] · [[restauracion-en-dispositivo]] | ✅ operador, proyectos con disciplina, editar/eliminar, paquete `.polylive` ida y vuelta |
| 2 | Lienzo y navegación | [[capa-viva-y-camara]] · [[sistema-de-diseño]] · [[uso-a-una-mano]] | ✅ 3 temas · 🟡 gestos de dos dedos y giro horizontal sin probar en equipo |
| 3 | Levantamiento en planta | [[EditorController]] · [[Uniones-de-muros]] · [[Recintos-con-identidad]] · [[Suelo]] | ✅ muros, recintos, puertas, ventanas, columnas, suelo, medida cara a cara |
| 4 | Niveles y fases | [[Niveles-y-fases]] · [[Restricciones-verticales]] · [[alcance-nivel-fase]] | ✅ |
| 5 | Alzado | [[ElevationEditor]] · [[WallElevation-MEM]] | ✅ encuadre al abrir, huecos, cercha/viga/correa (H-25 corregido), foto y marcas en la cara |
| 6 | Topografía | [[Georreferencia-proyecto]] · [[Mojones-biblioteca]] · [[TopographyService]] · [[Topografia-de-apoyo]] | ✅ amarre por origen, GPS y mojones (RMSE) · ⬜ mapa de fondo (licencia) · GPS al aire libre sin probar |
| 7 | Fotos y auditoría | [[PhotoMarker-SPDS]] · [[CapturePhotoUseCase]] | ✅ cámara integrada, permisos al usarla, sello SHA-256, registro fotográfico PDF |
| 8 | Exportación | [[serializador-IFC-general]] · [[DXF-R2000]] | ✅ IFC espacio/proyecto, DXF, CSV, plano PDF · 🟡 los PDF no dibujan vanos (H-54) |
| 9 | Avance de obra | [[Avance-de-obra]] | ✅ cortes, actividades editables, pincel en suelo y cara, reporte CSV/PDF |
| 10 | Revisión | [[Revision]] | ✅ marcas en planta y alzado, acta PDF/CSV |
| 11 | Herramientas de dibujo | [[catalogo-herramientas]] | ✅ F6b (cota, texto, etiqueta, coordenada, línea, polígono, vano, viga, cercha, correa) |

Transversal: [[registro-de-diagnostico]] (todo fallo visible queda en "Enviar diagnóstico").

## Siguiente (en orden)

1. Prueba de campo del dueño con la lista de verificación de `docs/26` § 7 (láser, GPS al aire libre, dos dedos, giro).
2. Decisiones de producto: H-15 encadenar muros, H-18 cota alineada u ortogonal, H-45 código BIM repetido al importar,
   H-54 vanos en los PDF.
3. Hallazgos P3 abiertos de `docs/25` § 6.3.
4. Importar levantamientos de Revit por IFC (plan en `docs/23` § 6).
5. Mapa de fondo offline (decidir licencia).
