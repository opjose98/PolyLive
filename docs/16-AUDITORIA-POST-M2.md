# 16 — Auditoría de arquitectura y código (post-M2)

> Fecha: 2026-09-30 · Rama `feat/auditoria-m2` (sobre `feat/ui-m2-topografia`).
> Alcance: todo `app-bim-typescript/src` y `test/`, contrastado con la idea original
> ([02-ARCHITECTURE-COMPLETE](02-ARCHITECTURE-COMPLETE.md)) y con las decisiones de UI (docs 14–15).
> Resultado: **−3.826 / +781 líneas**, `src` de 34.363 a 32.507 líneas, 857 pruebas (853 + 4 *todo*) en verde,
> `tsc --noUnusedLocals` sin hallazgos. Probado en el teléfono (moto g86).

## 1. Cómo se revisó

| Nivel | Herramienta |
|---|---|
| Archivos | Grafo de imports desde `App.tsx`: alcanzable por la app / solo por tests / por nadie |
| Símbolos | `tsc --noUnusedLocals --noUnusedParameters`; exports sin ningún uso fuera de su archivo |
| Capas | Búsqueda de imports que violan la matriz de dependencias del doc 02 |
| Funcional | Lectura de los flujos (planta, alzado, modos, topografía, galería, exportar) y de quién llama a qué |
| Combinaciones | Cada modo (Levantamiento, Topografía, Avance, Revisión) × vista (planta, alzado) × gesto (toque, toque largo, doble toque, arrastre, píldoras de la BPC) |
| Rendimiento | Qué se recalcula por render, por toque y por cuadro |
| Dispositivo | Flujo completo en el teléfono tras los cambios |

## 2. La idea original y qué queda de ella

### 2.1 Se conserva (y se respeta)

- **Cinco capas** con el dominio puro: `src/domain` no importa React, Expo, Zustand ni Skia (verificado), y no
  importa ninguna capa exterior. Toda la geometría, las restricciones de nivel (`vertical.ts`) y la topografía
  (`domain/geo`) se prueban en Node.
- **Patrón Command + CommandStack** con deshacer/rehacer para todo lo que modifica objetos BIM. El alzado entra
  en la MISMA pila (`ElevationSnapshotCommand`): un solo historial.
- **Casos de uso** para crear/mover/borrar/editar objetos, fotos, mediciones y exportación.
- **Inversión de dependencias** donde importa: `IObjectStore`, `IValidationService`, `ICDT`, `IIFCSerializer`
  los define Application y los implementa Infrastructure; `AppServices` es la raíz de composición.
- **Unidades con tipo** (`Meters`, `Degrees`…), ids de marca, CDT, miter, snap angular y a nodo.
- **SQLite local** como única fuente de verdad, con respaldo/restauración (variante Expo).

### 2.2 Cambió (decisiones conscientes, documentadas en F0–M2)

| Original (doc 02) | Hoy | Por qué |
|---|---|---|
| React Navigation (8 pantallas en stack, pestañas) | Una pantalla de trabajo; menú ☰ con pantallas encima; alzado como capa de la planta | Flujo del mockup; el estado de la planta no se pierde |
| Zustand con 4 slices (survey, ble, ui, control-points) | `workspaceStore` (cromo) + controladores puros (`EditorController`, `ElevationEditor`) | El estado del modelo vive en controladores con tests; el store global se volvió de solo escritura (ver §4.1) |
| Cerrar el recinto a mano (`CloseRoomUseCase` + CDT) | Recintos **detectados** en cada recarga (`DetectRooms`) y sincronizados al objeto Room | Flujo de campo: los muros se trazan sueltos (LevON) |
| Borradores del trazo (`polygon_drafts`) | Cada muro se guarda al trazarlo | Ya no hay trazo a medias que recuperar |
| Topografía por **sede** (Spike #7) | Georreferencia por **proyecto** + mojones con biblioteca (M2) | Decisión del usuario (30 preguntas) |
| BLE Huepa como entrada principal de medidas | Medición manual; el BLE queda en `native/ble` sin interfaz | Requiere Expo Dev Client; pospuesto |
| Navy + amarillo (LevON) | Ámbar, Roboto, 3 temas de lienzo | Mockup |

## 3. Hallazgos y lo que se hizo

### 3.1 Bugs e incoherencias funcionales (corregidos)

| # | Hallazgo | Efecto | Corrección |
|---|---|---|---|
| B1 | En **Topografía, Avance y Revisión** el toque largo abría el panel de propiedades con edición y **Eliminar**, y las píldoras de la BPC cambiaban espesores y anchos | Se podía editar el modelo desde modos que no lo editan (contradice la regla de los modos) | Panel, píldoras y acción "Propiedades" solo en Levantamiento; salir del modo cierra el panel; sin handles fuera de Levantamiento |
| B2 | Lo mismo en el **alzado** (píldoras de vano, hoja de detalles) | Ídem | `editable` en `ElevationView` |
| B3 | La **galería** listaba todos los archivos de foto del teléfono | Fotos de otros proyectos y espacios mezcladas | Solo las registradas en el espacio |
| B4 | `onOpenPhotos(objectId)` estaba declarado en la planta pero **App nunca lo pasaba** | "Ver fotos" del panel de propiedades no aparecía nunca | Conectado: galería filtrada por objeto |
| B5 | Los **marcadores de foto** se dibujaban pero no respondían al toque | Información sin acceso | Tocar un marcador abre su foto en el visor |
| B6 | Herramienta **Foto** habilitada en el FAB del alzado con el binding de planta | El botón no hacía nada | Deshabilitada en alzado (como las demás sin dominio) |
| B7 | Promesas disparadas sin manejar error (`setScope → reload`, recarga al volver del alzado, niveles/fases, carga del alzado, mojones, exportar) | "Possible unhandled promise rejection" (se vio en el teléfono al entrar a Topografía) | `EditorController.refresh()`, `ElevationEditor.load` atrapa, `.catch` con aviso en cada acción |
| B8 | Segundos del GPS se guardaban **en cada tecla** (y recargaban la topografía) | Escrituras de más; valores intermedios inválidos | Se guarda al salir del campo; valor inválido se revierte |
| B9 | Mojón tocado antes del amarre se rotulaba "solo local" aunque el proyecto ya estuviera amarrado | Estado confuso | "calculado por el amarre" |

### 3.2 Redundancias **innecesarias** (eliminadas)

| Qué | Por qué sobraba |
|---|---|
| Topografía por sede: `survey.ts`, 2 casos de uso, 3 comandos (incl. `SimpleCommand`), métodos y filas en `ObjectStore`, tablas `sites` y `survey_control_points` | Reemplazada por `domain/geo` (M2) |
| Borradores: `Save/RecoverRoomDraftUseCase`, `polygon_drafts`, métodos del store | Los muros se guardan uno a uno |
| `state/appStore.ts` (4 slices) | **Solo se escribía**: la planta lo actualizaba en cada render y nadie lo leía |
| `Backup/RestoreDatabaseUseCase` de Node (`fs`) | Duplicaban las variantes Expo, que son las que usa la app; ni siquiera podían importarse en el teléfono |
| `ExportRoomIfcToFile` / `ExportRoomDxfToFile` | Sin uso: la app exporta por `exportActions` + SAF |
| Barriles muertos (`commands/index`, `state/index`, `topology/index`, `native/index`) | Nadie los importaba |
| `ui/theme/tokens.ts` (sistema navy re-apuntado) | **Dos sistemas de diseño**; 9 pantallas migradas a `ui/design` (colores, espacios, radios, `type`, `sizes`) |
| Edición de niveles/fases **en memoria** (`add/remove/rename/setRangeItemValue` del store y `rangeModel`) | Duplicaba la validación de `MarkerStore`; la app ya solo usaba la base de datos |
| En `SurveyScreen`: todo el pegamento BLE sin interfaz, `showLabels`, 18 estilos y un componente sin uso | Código muerto heredado de la UI anterior |
| En `EditorController`: `pan`, `getDefaults`, `TOOLS`, `applySnaps`, `gridEnabled` | Sin llamadores |
| Ayudantes de geometría sin uso (`rotatePoint3D_Z`, `distancePointToLine`, `pointsEqual`, `polygonArea` de CDT), constantes de altura sin aplicar, `commandStack` sin uso en `WallElevationService`, 25 imports sin uso | — |

### 3.3 Redundancias **necesarias** (se mantienen, a propósito)

| Qué | Por qué se queda |
|---|---|
| `EditorController` y `ElevationEditor` | Dos vistas del mismo muro con gestos distintos; comparten `CommandStack` y servicios |
| Validación en `MarkerStore` **y** orden en `rangeModel` | Una valida datos (cotas únicas, base); la otra solo ordena y conserva la selección de los deslizadores |
| `GpsCoordinates` y `GpsFix` | Lectura suelta del proveedor vs. muestra para promediar (con marca de tiempo y altura opcional) |
| `toLocal` en el borde (IFC, DXF, topografía) | El modelo es Y-abajo (pantalla); el intercambio Y-arriba. Convertir en un solo sitio evita espejos |
| `IFC para Revit` (☰) y `IFC y DXF del recinto` | Mismo exportador; uno es atajo, el otro la pantalla con DXF. Ver §5 |
| Recinto derivado escrito fuera del `CommandStack` | Es dato derivado de los muros: deshacer un muro lo recalcula; si entrara en la pila, cada recarga sería un paso de deshacer |

### 3.4 Arquitectura y coherencia

- **Capas**: dominio limpio. Desvíos conocidos y aceptados: los servicios de aplicación nuevos
  (`ProjectService`, `TopographyService`, `WallElevationService`) reciben stores **concretos** en vez de puertos;
  `GalleryScreen` y la planta leen `services.store` directamente. Funciona porque los tests usan SQLite real en
  Node; se recomienda un puerto cuando haga falta un doble de prueba (§5).
- **Infraestructura → Application** (`IFCSerializerAdapter`, `CDTAdapter`, `ValidationService` implementan
  interfaces de `use-cases/types`): es la inversión correcta, no una violación.
- **Pantalla de trabajo**: `SurveyScreen` bajó de 1.416 a ~1.080 líneas. Se extrajo:
  - `useProjectLevels` (MarkerStore → selectores → alcance del editor) y
  - `application/workspace/levelScope.ts` (función pura, con tests nuevos).
  Topografía ya vivía en `useTopography`. El patrón queda: **cada modo/capacidad = hook + lógica pura con tests;
  la pantalla compone**.

### 3.5 Rendimiento

| Punto | Antes | Ahora |
|---|---|---|
| `scopedObjects` / `walls` (qué objetos ve el nivel y la fase activos) | Se recalculaban en **cada** consulta, resolviendo restricciones y perfiles de cada muro. La pantalla los pide varias veces por render, y cada toque busca nodos | Caché por identidad (`objects`, alcance de nivel, alcance de fase): un cálculo por cambio real |
| Rótulos de coordenadas | proj4 (lat/long) por vértice en **cada render**, incluso con N/E | N/E con Helmert puro; proj4 solo en lat/long. Vértices y mojones memorizados aparte de la sonda: tocar un punto no recalcula los demás |
| Lienzo | — | Bien resuelto: la escena se graba en coordenadas de mundo y solo se regraba al cambiar la escala; la cámara va en el hilo UI |

### 3.6 Herramientas (estado por modo)

| Modo / vista | Funcionan | Visibles, deshabilitadas (fase) |
|---|---|---|
| Levantamiento · planta | Muro, Columna (2), Puerta, Ventana, Medición, Foto | Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Suelo, Viga (F6) |
| Levantamiento · alzado | Vano, Puerta, Ventana | Foto (B6), Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Viga, Cercha, Correa |
| Topografía | Mojón, Punto GPS, Coordenada | Inverso, Área, Replanteo (M2b) |
| Avance / Revisión | — | Pincel, Borrador, Relleno, Rectángulo / Trazo, Flecha, Rectángulo, Texto, Nube (M3/M4) |

La "Medición láser" funciona en manual ("Ingresar medida"); la ráfaga BLE no tiene interfaz (§2.2).

## 4. Filosofía de diseño (lo que la auditoría confirma)

1. **El modelo es local y único**; lo demás se calcula (coordenadas reales, recintos, alzados, exportaciones).
2. **Lógica pura con tests, vista delgada**: controladores y funciones en `application/`, hooks que conectan,
   pantallas que componen. Donde esto se cumple (topografía, niveles, FAB, rango, BPC) los bugs son raros; los
   encontrados aquí estaban en el pegamento de las pantallas (B1–B7).
3. **Una sola fuente por cosa**: datos en SQLite, cromo en `workspaceStore`, estilos en `ui/design`. La auditoría
   eliminó tres segundas fuentes (appStore, theme/tokens, edición de niveles en memoria).
4. **Solo Levantamiento edita el modelo**; los otros modos agregan su propia capa. Ahora lo garantizan la planta
   y el alzado en todos los gestos.

## 5. Pendiente y opciones (no hechas en esta auditoría)

| Prioridad | Recomendación |
|---|---|
| Alta | **IFC georreferenciado** (IfcMapConversion + IfcProjectedCRS) desde `Georeference`: ya está todo para hacerlo; es lo que más aporta a Revit (M2b) |
| Alta | Decidir la **licencia del mapa offline** (IGAC abierto vs. proveedor con clave) antes de M2b |
| Media | Seguir adelgazando `SurveyScreen`: `useConstraintEdit` (selector base/tope) y la construcción de la BPC, que hoy está **duplicada** entre planta y alzado (píldoras y acciones) → un `useBpcModel` compartido |
| Media | Dividir `EditorController` (1.600 líneas): alcance (ya con caché), cámara/encuadre, creación, medición/fotos |
| Media | `PhotoService` en Application para que la galería y la planta no lean `services.store` directo |
| Media | `CloseRoomUseCase` (+ CDT) no lo usa la app: **reutilizarlo en F6a Suelo** (polígono validado y triangulado) o borrarlo con sus pruebas |
| Baja | Migración que borre las tablas huérfanas (`sites`, `survey_control_points`, `polygon_drafts`) en bases ya instaladas |
| Baja | Unificar los dos accesos IFC del ☰ en uno ("Exportar…") si la pantalla de exportar gana la opción Revit |
| Baja | BLE Huepa: o se retoma con Dev Client (interfaz en la BPC de Medir) o se archiva `native/ble` |
| Baja | Mojón tocado antes del amarre: opción "Fijar coordenadas" para volverlo punto de control |
| Doc | El doc 02 describe la navegación y el estado originales; leer junto con este informe y los docs 14–15 |

## 6. Verificación

- `tsc --noEmit` y `tsc --noUnusedLocals` limpios; `jest`: 57 suites, 853 pruebas + 4 *todo*.
  Las pruebas borradas eran las del código borrado; se agregaron `levelScope.test.ts` y se reescribieron las del
  selector de rango sobre `withItems` (el camino real: base de datos → selector).
- Teléfono: operador → proyectos y espacios (pantallas migradas al sistema ámbar) → planta → ☰ sin
  "Topografía" → galería del espacio (solo sus fotos) → Revisión: toque largo selecciona y la BPC informa, sin
  panel, píldoras ni handles → Topografía: rótulos N/E, sonda, aguja del norte, sin avisos de promesas.
