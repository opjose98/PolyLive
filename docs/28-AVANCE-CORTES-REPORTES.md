# 28 — Avance sin duplicados, cortes con rango de vista, suelos aislados y memoria de cantidades

Fecha: 2026-10-25 · Rama `feat/campo-avance-reportes` (desde `audit/estable-campo`) · Equipo de QA: Lenovo TB370FU (dev client por WiFi + puente) · APK de campo: release `.qa` (`com.polylivebim.qa`).

Este documento cierra el pedido del dueño para la salida a campo (siete puntos) y registra la auditoría de lo hecho. Los hallazgos siguen la numeración de la matriz (docs/25 § 6.3): **H-87 a H-94**.

## 1. Pedido y qué se hizo

| # | Pedido | Qué se hizo | Hallazgo |
|---|---|---|---|
| 1 | Cortes: doble toque para verlos; rango de vista y lado configurables por propiedades y en el lienzo (el rango solo con el corte seleccionado) | Doble toque sobre la línea de corte abre su vista. Cada corte tiene **profundidad de vista** (`props.depth`, 3 m por defecto) y **lado** (`props.flip`). Seleccionado, la planta muestra el rango (rectángulo tenue) con un **cuadrado para arrastrar la profundidad**, sus **extremos arrastrables** y un botón **⇅** que invierte el lado; la hoja «Corte» tiene nombre, profundidad, lado y «Ver corte». La vista dibuja lo cortado (rayado) y, hasta la profundidad, **lo visto detrás** (muros con su perfil y vanos, columnas, vigas, cantos de losa) en contorno fino, de atrás hacia adelante | H-89 |
| 2 | En los muros el punto de altura no funciona bien | La herramienta crea la estación **a la altura tocada** si se toca por encima del tope (antes copiaba siempre la altura existente y había que ir al selector de niveles). El vértice seleccionado (estación o extremo) **se arrastra en vertical** para cambiar su altura, enganchando a las líneas de nivel (o al cm); la estación también se mueve a lo largo del muro (el primer movimiento decide el eje). Sigue atado a su nivel con desfase | H-92 |
| 3 | El FAB derecho debe quedar con el ícono de la herramienta mientras se usa | Cerrado y con herramienta activa, el FAB + muestra el ícono de la herramienta y su nombre debajo; tocarlo abre el catálogo para cambiarla; se suelta con la ✕ de la BPC o Atrás | H-93 |
| 4 | Suelos sin muros: seleccionarlos, ver su área, doble toque para aislar, arrastrar vértices y aristas | Un suelo libre seleccionado se resalta y la BPC da área neta, perímetro y espesor (editable). Tiene **manejadores en vértices** (se enganchan a nudos, vértices de recinto y puntos medios) y **en el centro de cada arista** (desplaza la arista en perpendicular: un rectángulo sigue siendo rectángulo); un paso de deshacer por arrastre. **Doble toque aísla** el suelo (libre o de recinto): solo él se ve (lo demás queda de calco), la cámara lo encuadra y la BPC trae Salir, Actividad y corte, Reporte del suelo y Foto | H-88 |
| 5 | Avance optimizado; el pincel pinta atrasado | El pincel y el borrador se dibujan **en el hilo UI** (gesto worklet + Skia): el trazo va pegado al dedo aunque JS esté ocupado. Además la punta del trazo guardado llega hasta donde se soltó (antes se descartaban puntos a menos de ¼ del ancho). Lo pintado se rellena en una sola figura por capa (con zoom ya no salen rayas) | H-87 |
| 5.1 | En planta no se podía hacer el avance de los suelos: que funcione al aislar | Con el suelo aislado se pinta solo sobre él (pincel, borrador, rectángulo, relleno) | H-88 |
| 5.2 | No duplicar áreas de corte: lo hecho con una actividad en un corte no se puede volver a hacer con la misma actividad en otro; otra actividad sí | Regla en el dominio (`cutCoverages`): cada corte cuenta y dibuja solo lo que la actividad no había ejecutado antes. Pintar encima de lo ya hecho **no se guarda** y avisa; si una parte era nueva, se guarda y avisa cuánto se descontó. El borrador de un corte solo quita lo de ese corte | H-87 |
| 5.3 | Doble toque en columnas no entraba; registrar avance en columnas | Doble toque sobre la columna abre sus caras desdobladas; en Avance se pinta sobre ellas (soporte `column:<id>`, perímetro × alto), con «Reporte de la columna» y foto | H-94 |
| 5.4 | Registro fotográfico del avance (ligado a un elemento o libre, con la fecha de corte) y reporte PDF con altimetrías; elegir si se incluyen elementos sin avance | Herramienta **Foto de avance** (FAB del modo Avance, categoría Registro) en planta, alzado y columna, y botón **Foto** del suelo aislado: la foto queda en el corte activo, ligada al elemento tocado (o libre) y a la actividad activa, con su marcador. El PDF trae por corte: planta con los suelos pintados, alzados de cada cara y columna con avance, resumen, detalle, **medidas de lo ejecutado**, **elementos sin avance** (opcional) y **registro fotográfico** con fecha, código y elemento | H-90 |
| 5.5 | Reporte según la vista (todo o el elemento), más filtros y elección de cortes; Excel con el formato de las memorias (en una sola hoja, vertical: título con el corte, medidas y fotos) | El botón Reporte de la BPC abre la hoja con el **alcance de la vista**: planta → todo el espacio; alzado → ese muro (sus dos caras); columna → esa columna; suelo aislado → ese suelo (se puede pasar a «Todo el espacio»). Filtros: **cortes** (uno, varios, todos), **actividades**, elementos sin avance, fotos, dibujos. Salidas: PDF, **memoria en Excel** y CSV. La memoria reproduce la plantilla del contrato (ver § 3) | H-90 |
| 6 | En las vistas altimétricas seleccionar los elementos que se ven para modificarlos o ver sus propiedades | En el alzado de un muro, tocar un muro, columna o viga que lo atraviesa lo selecciona (resaltado) y la BPC ofrece Propiedades (o Dibujo, para una viga), «Su alzado» (muro) y Listo. En el corte y en la columna, lo mismo con lo cortado y lo visto detrás (el más cercano gana) | H-91 |
| 7 | Revisar, probar, auditoría, documentación, git y APK | §§ 4–6 de este documento, matriz docs/25, bóveda, commit en la rama y APK release instalado | — |

## 2. Decisiones de diseño

- **Sin cambios de modelo de datos.** La profundidad y el lado del corte son propiedades del elemento de dibujo (`props.depth`, `props.flip`); la etiqueta de la foto de avance va en la metadata JSON de la foto (`progress: { cutId, targetKey?, activityId? }`); el encabezado del contrato y los ítems de la memoria se guardan en el archivo de preferencias del teléfono, por proyecto (no viajan en el `.polylive`; si hace falta compartirlos, pasarlos a una tabla).
- **Lado de vista de un corte (H-89).** Se definió uno solo: se mira hacia la **izquierda de A→B tal como se ve en la planta** (Y hacia abajo; con A→B hacia la derecha se mira hacia arriba) y en la vista A queda a la izquierda. Antes las flechas apuntaban al lado contrario del que se dibujaba; los cortes viejos se ven igual que antes, solo cambian sus flechas.
- **Cortes de avance (H-87).** Lo reportado en un corte nunca cambia por lo que se haga en otro posterior. Para corregir un corte ya reportado se activa ese corte y se borra ahí.
- **Memoria de cantidades sin librería de Excel.** Un `.xlsx` se escribe con `fflate` (ya estaba): una hoja, estilos deduplicados, celdas combinadas, fórmulas con su valor y dibujos anclados (`infrastructure/export/xlsx/xlsxWriter.ts`). Los dibujos del reporte (SVG) se rasterizan a PNG con Skia fuera de pantalla y las fotos se reducen a 1280 px (JPEG 80 %).

## 3. Memoria de cantidades (Excel)

Plantilla tomada de `NARG29-BRIS-PTO-MEJORAMIENTO-v4.4.xlsx` (hojas de memoria, formato GES-FO-118) **solo como forma**: fuentes Times New Roman 12 (título 16), grises `D8D8D8`, marco grueso en B y S, anchos de columna A–S, celdas combinadas, encabezado del contrato (filas 2–13), bloque de ítem (CAPÍTULO/ÍTEM · DESCRIPCIÓN · UNIDAD · FORMA DE PAGO), tabla (ESQUEMA DE UBICACIÓN EN PLANOS Y REGISTRO FOTOGRÁFICO · LOCALIZACIÓN · DIMENSIONES ANCHO/ALTO/LONGITUD · No. ELEMENTOS · CANTIDAD PARCIAL · CANTIDAD TOTAL), observaciones, TOTAL y firmas. Ningún dato de la plantilla pasa a la app.

En una sola hoja vertical: encabezado una vez; luego **un bloque por actividad** (un ítem del presupuesto) con, por cada corte, un **título «CORTE …»** (fila gris M–S), **una fila por parte ejecutada** con sus medidas (suelo: ancho × longitud; muro o columna: alto × longitud) y fórmulas (`R = P×N` u `P×O`, `S = Q×R`, `TOTAL = SUMA`), y en el esquema (B–L) los **dibujos del elemento con esa actividad pintada y las fotos del corte**, dos por banda, con su pie en M–S. Una parte irregular (muchas piezas) sale como una fila equivalente con el área exacta.

Validación: test (`test/report/memoria.test.ts`) + `scripts/validate_exports.py` (openpyxl, opcional) + la memoria generada **en la tableta** abierta y exportada a PDF con Excel (estructura igual a la plantilla, 8 imágenes rasterizadas en el teléfono).

## 4. Auditoría del cambio

| Capa | Archivo | Qué |
|---|---|---|
| Dominio | `domain/progress/progress.ts` | soporte `column`, `cutCoverages` (cortes sin duplicados), `markGain`, `coverageRects`, `quantityParts`, `columnSupport`, `orderedCuts`, `targetOfKey` |
| | `domain/drafting/drafting.ts` | `sectionView` (lado y profundidad), `sectionHandles`, `SECTION_DEFAULT_DEPTH` |
| | `domain/section/sectionCut.ts` | `sectionBeyond` (lo visto detrás del plano) |
| | `domain/objects/vertical.ts` | `extentWithTop`, `extentWithBase` |
| | `domain/objects/audit-photo.ts` | `PhotoProgressTag` |
| Aplicación | `application/progress/ProgressController.ts` | punta del pincel, rechazo/aviso de lo ya ejecutado, `strokeSeq`, `layersFor`, `parts` |
| | `application/progress/progressReport.ts` | `buildReport` (cortes, alcance, actividades, sin avance, fotos), `reportHtmlBlocks`, `reportCsvBlocks` |
| | `application/progress/progressMemoria.ts` | memoria de cantidades sobre la plantilla |
| | `application/progress/progressPhotos.ts` | fotos de avance para el reporte |
| | `application/section/projection.ts` | corte con profundidad, `projectionElementAt`, `columnUnfolded` |
| | `application/drafting/DraftingController.ts` | manejadores del corte (extremos, profundidad, ⇅) |
| | `application/elevation/ElevationEditor.ts` | vértices del perfil en dos ejes, estación a la altura tocada, `elementAt` |
| | `application/canvas/SelectionService.ts`, `editor/EditorGestures.ts`, `editor/EditorCore.ts` | manejadores y arrastre de vértices y aristas de suelo, `zoomToPoints` |
| | `application/workspace/catalog.ts`, `fabMachine.ts` | Foto de avance, ícono de la herramienta activa |
| Infraestructura | `infrastructure/export/xlsx/xlsxWriter.ts` | escritor .xlsx |
| Nativo | `native/export/raster.ts`, `native/prefs/prefsFile.ts`, `native/canvas/SkiaCanvasAdapter.ts` | SVG→PNG y JPEG reducido; preferencias de la memoria; `fillRects` |
| UI | `ui/canvas/liveStroke.ts`, `PlanCanvas.tsx`, `ElevationCanvas.tsx` | pincel en el hilo UI; manejadores extra (corte) |
| | `ui/screens/SurveyScreen.tsx`, `ElevationView.tsx`, `ProjectionView.tsx` | doble toque, aislar, fotos de avance, selección en altimetría, reportes por vista |
| | `ui/workspace/progress/*` | hoja de reporte nueva, `useProgressReport`, soportes de columna |
| | `ui/canvas/planRenderer.ts`, `elevationRenderer.ts`, `draftShapes.ts` | suelo seleccionado, lo visto detrás, elemento seleccionado, rango de vista |

Verificación: `tsc` limpio · ESLint 0 errores · Jest **87 suites, 1064 tests** (21 nuevos: cortes sin duplicados, partes de la memoria, markGain, columnas, punta del pincel, estación a la altura tocada, arrastre vertical con enganche a niveles, elemento que atraviesa el muro, vértices y aristas de suelo, manejadores y lado del corte, lo visto detrás, FAB, xlsx y memoria).

## 5. QA en la tableta (2026-10-25)

Dev client por WiFi (`192.168.40.5:8081`: el túnel `adb reverse` corta el bundle de 12 MB) y puente de control con acciones de QA nuevas (`ui mode | fab | isolate | paint | quantities | export…`, solo en `__DEV__`), sobre el proyecto de prueba **QA2 Estructuras** (se le agregaron una columna, el suelo libre «Anden QA» y el «Corte QA»). Las sedes reales no se tocaron.

| Prueba | Resultado |
|---|---|
| Mampostería en el corte QA 1 sobre muro (con su vano), suelo y columna | ✅ 2,44 / 6,00 / 1,20 m² |
| Corte QA 2: repintar lo mismo con Mampostería | ✅ no se guarda |
| Ampliar el rectángulo 1 m | ✅ cuenta 2,00 m² (solo lo nuevo); acumulado 4,44 |
| Pañete encima | ✅ cuenta; descuenta 0,37 m² de Pañete de un corte viejo |
| FAB con Pincel / Borrador | ✅ ícono y nombre |
| Suelo aislado | ✅ solo el suelo, área 12,00 m², acciones; color del avance sin rayas |
| Columna desdoblada con avance | ✅ |
| Corte con 3 m de vista | ✅ lo cortado rayado y el muro del fondo con su vano |
| PDF y memoria Excel generados en la tableta | ✅ (18 páginas; Excel con 8 imágenes, abre en Excel) |

**Queda para la prueba a mano** (la tableta no acepta toques por `adb`): sensación del pincel con el dedo, doble toques, arrastre de vértices y aristas del suelo, de los manejadores del corte y del punto de altura, toque sobre elementos en el alzado y el corte, cámara de la foto de avance, compartir PDF/Excel.

## 6. Pendiente y riesgos

- Si se empieza otro trazo antes de ~50 ms de soltar el anterior, ese trazo no se ve en vivo (sí se guarda) — `ui/canvas/liveStroke.ts`.
- El encabezado de la memoria vive en el teléfono (no en el paquete del proyecto).
- El PDF de un proyecto con muchos cortes y fotos crece rápido (las fotos van reducidas).
