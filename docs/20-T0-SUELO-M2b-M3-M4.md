# 20 — Topología persistente, Suelo, Topografía de apoyo, Avance y Revisión

Fecha: 2026-10-03. Plan: `docs/19-PLAN-T0-M2b-M3-M4.md`. Ramas apiladas, una por fase:
`feat/t0-topologia-persistente` → `feat/f6a-suelo` → `feat/m2b-topografia` → `feat/m3-avance` → `feat/m4-revision`.

**Verificación:**
- `tsc` limpio.
- jest **926 pasan** + 4 todo (antes 857).
- `expo export --platform android` empaqueta sin errores.
- **Sin prueba en teléfono:** no había dispositivo conectado. Ver la lista de pruebas de campo al final.

---

## T0 — Topología y recintos persistidos

| Antes | Ahora |
|---|---|
| Mover el extremo de un muro dejaba la esquina abierta y el recinto desaparecía | **Uniones**: mover un extremo (o aplicar una medida) mueve los extremos unidos; trasladar un muro estira a sus vecinos y arrastra los encuentros en T. Todo es **un** paso de deshacer y se ve en vivo |
| Recintos derivados en cada recarga, sin id ("Recinto 1, 2…" por área) | **Recintos con identidad** (tabla `zones`): id estable, número R-01, nombre, uso, notas |
| Solo se guardaba el recinto mayor | Todos se guardan; al dividir, el lado con la semilla conserva el id; al unir, gana el más antiguo; uno que deja de cerrarse queda desligado y se recupera al deshacer |
| Área al eje | **Área neta** a cara interior (eje desplazado medio espesor por lado) y perímetro neto; al eje como referencia |
| IFC: un IfcSpace por espacio, al eje | **Un IfcSpace por recinto** en el piso de su nivel, a cara interior, `Name` = R-01, `LongName` = nombre, `Qto_SpaceBaseQuantities` |
| DXF: un contorno | Contorno neto y rótulo por recinto |

**Uso:**
- Con Seleccionar, tocar dentro de un recinto lo selecciona; la BPC muestra área neta y perímetro.
- La pulsación larga o "Recinto" en la BPC abre su hoja: nombre, uso con atajos (Cocina, Baño…), notas y suelo.

**Código:**
- `domain/topology/joints.ts`
- `application/use-cases/ReshapeWallsUseCase.ts`
- `domain/objects/zone.ts`
- `application/topology/reconcileZones.ts`
- `infrastructure/sqlite/ZoneStore.ts`
- `EditorController.syncZones`

## F6a — Suelo

- Herramienta **Suelo** (FAB + → Arquitectónico): tocar un recinto le pone suelo. Hay uno por recinto y su espesor se ajusta en la píldora.
- El suelo **no guarda contorno**: toma el neto de su recinto, así que mover muros mueve su borde.
- En planta se dibuja con trama cruzada.
- La hoja del recinto permite ponerlo, quitarlo y cambiar el espesor.
- IFC: un `IfcSlab` por suelo bajo la cota de su piso, con `Qto_SlabBaseQuantities`.

## M2b — Topografía de apoyo

| Herramienta | Qué hace |
|---|---|
| **Inverso** | Dos toques (se pegan a vértices y mojones): distancia, azimut de cuadrícula (°′″), rumbo, ΔN, ΔE |
| **Área** | Toques que forman un polígono, o un toque dentro de un recinto: área y perímetro en planas reales |
| **Replanteo** | Toca el punto; la hoja guía con GPS en vivo: distancia, "3,20 m al Sur · 1,05 m al Este", flecha con la brújula (corrige la convergencia de meridianos) y aviso de precisión |
| **Cuadrícula de coordenadas** | Filtro de Topografía: líneas de E y N redondos con su valor, oblicuas si el proyecto está girado |
| **Importar CSV** | Puntos de estación total o GNSS (PNEZD o PENZD; `,` `;` o tabulador; coma decimal), como mojones del proyecto |
| **Exportar CSV / KML** | Mojones y vértices en PNEZD; KML con mojones y recintos para Google Earth |
| **IFC georreferenciado** | Si el proyecto está amarrado: `IfcProjectedCRS` + `IfcMapConversion` (origen, giro, escala, cota). Revit lo lee como coordenadas compartidas. Verificado con un test que reproduce el amarre punto por punto |

Importar y exportar están en el drawer ⋮ → Topografía.

**Mapa de fondo:** sigue pendiente; la licencia de teselas offline está sin decidir. El filtro dice "(pendiente de licencia)".

**Código:**
- `application/geo/surveyTools.ts` (puro, con tests)
- `ui/workspace/topo/useTopoTools.ts`
- `StakeoutSheet.tsx`
- `native/location/watchPosition.ts`

## M3 — Avance de obra

- **Soportes:**
  - Suelos, en planta: requieren la herramienta Suelo.
  - Las dos caras de cada muro, en alzado (doble toque al muro): perfil real, sin vanos.
- **Herramientas:**
  - Pincel y Borrador, con ancho en la píldora.
  - Relleno: un toque = todo el soporte.
  - Rectángulo.
  - Un dedo pinta y dos mueven.
- **Catálogo editable por proyecto:** nace con Mampostería, Pañete, Estuco, Pintura, Enchape, Piso y Cielo raso. Se puede renombrar, cambiar de color, agregar y quitar; lo pintado se conserva.
- **Cortes por fecha** (fecha y nombre editables). Los cortes anteriores se ven tenues (filtro "Cortes anteriores").
- **Cuantificación por malla de 5 cm** recortada al soporte:
  - dos pasadas no cuentan doble;
  - el borrador resta;
  - el acumulado de un corte no cambia por lo que se haga después.
- **Reporte:**
  - En la app: cantidades en el corte y acumuladas.
  - **CSV.**
  - **PDF** con la planta coloreada, resumen por actividad y detalle por soporte con % de avance. Se guarda en una carpeta o se comparte.
- **Deshacer y rehacer propios del Avance** (BPC). No se mezclan con la historia del levantamiento.

**Código:**
- `domain/progress/progress.ts`
- `application/progress/ProgressController.ts`
- `progressReport.ts`
- `application/report/planSvg.ts`
- `ui/workspace/progress/*`

## M4 — Revisión

- **Marcas:** trazo libre, flecha, rectángulo, nube y texto, en planta y en alzado. Cinco colores (rojo corregir, naranja verificar, azul información, verde aprobado, morado).
- **Observación numerada:** al soltar la marca se abre su hoja, con:
  - comentario;
  - color;
  - autor y fecha;
  - estado abierta o resuelta (con quién y cuándo);
  - **foto** tomada en el momento (queda también en la galería del espacio).
- **Filtros:** "Comentarios abiertos" y "Resueltos".
- **"Observaciones" en la BPC:**
  - lista con estado;
  - **acta en PDF**: planta y cada cara de muro con sus marcas numeradas, más la tabla;
  - compartir;
  - CSV.
- Deshacer y rehacer propios. Borrar pide confirmación y se puede deshacer. Los números no se reutilizan.

**Código:**
- `domain/review/review.ts`
- `application/review/*`
- `infrastructure/sqlite/ReviewStore.ts`
- `ui/workspace/review/*`
- `ui/canvas/sketch.ts` (trazos compartidos con M3)

---

## Infraestructura nueva

- **Dependencias:** `expo-print` (PDF), `expo-sharing` (compartir) y `expo-document-picker` (CSV). Las tres funcionan en Expo Go.
- `native/export/saveToUserFolder.ts` guarda también binarios (PDF).
- `ui/canvas/sketch.ts`: capa viva de trazos en la planta y el alzado. Pintar no re-renderiza la pantalla.
- **Tablas nuevas, todas aditivas** (`CREATE TABLE IF NOT EXISTS`): `zones`, `progress_activities`, `progress_cuts`, `progress_marks` y `review_items`.

## Riesgos aceptados (de la auditoría, sin corregir por decisión)

- Nombre, uso y notas de recintos, y catálogo de avance: son metadatos y no entran al historial de deshacer.
- La medida sigue aplicándose al eje. Ahora arrastra las uniones, pero la semántica cara a cara queda pendiente.
- Sin migraciones versionadas: todo lo nuevo es aditivo.
- El replanteo con GPS de celular es aproximado (3–15 m). La hoja lo dice.

## Pruebas de campo pendientes (teléfono)

1. Uniones: arrastrar una esquina, trasladar un muro con un tabique en T, deshacer.
2. Dividir un recinto con un muro y deshacer: el nombre se conserva.
3. Suelo en cada recinto; mover un muro y ver que el suelo lo sigue.
4. Inverso, Área y cuadrícula sobre un proyecto amarrado; replanteo al aire libre.
5. Importar un CSV real de estación total.
6. Abrir en Revit un IFC georreferenciado (coordenadas compartidas) y uno con varios recintos (Rooms).
7. Pintar avance con el dedo en planta y en una cara (fluidez); generar y compartir el PDF.
8. Marcas de revisión con foto; acta PDF.
