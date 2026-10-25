# 23 — Plan MVP desde la auditoría integral (reformulado)

Fecha: 2026-10-06. Base: `AUDITORIA_INTEGRAL_POLYLIVE.md` (commit auditado `6c3ff6b`, nota integral
3,9/10) contrastada con `main` @ `64b4d41` (después de T0, F6a, M2b, M3, M4 y F6b). Objetivo del
usuario: llevar las notas a **≥ 8,5** y dejar el **MVP listo**, mejorando primero lo existente.

Decisiones (2026-10-06):
- **Upgrade de Expo primero que todo** (51 → 57: RN 0.86, nueva arquitectura, Skia 2, Reanimated 4).
- Errores en campo: **registro local + "Enviar diagnóstico"**, sin servicios externos.
- Medida: **cara interior por defecto**, elegible (exterior / eje), convertida al eje con los espesores
  y con registro de qué medida originó cada longitud.
- Entra al MVP: **refactor estructural** y **horizontal / tableta**. Quedan fuera: láser BLE (falta el
  equipo), plugin de Revit (falta Revit), sincronización.

## 1. Estado de cada hallazgo (actualizado al cierre de B0–B6, rama `feat/mvp-auditoria`)

| Hallazgo (prioridad de la auditoría) | Antes del plan | Hoy (evidencia) |
|---|---|---|
| Uniones persistentes (P0) | ✅ T0 | ✅ |
| Recintos múltiples, área neta (P0) | ✅ T0 | ✅ |
| IfcSpace por recinto a cara interior (P0/R24) | ✅ T0 | ✅ + `Pset_SpaceCommon` con áreas (B6) |
| Toggles sin función / herramientas ⬜ (P0) | ✅ F6b | ✅ |
| Avance y Revisión (R39) | ✅ M3/M4 | ✅ |
| IfcMapConversion, CSV/KML (P1) | ✅ M2b | ✅ también en el IFC del proyecto |
| Medida al eje (P0/R02) | ❌ | ✅ B3: cara interior por defecto, exterior/eje elegibles; `faceMeasure.ts`, test 4 × 5 m |
| Error de cierre / criterio de campo (P0/U17) | ❌ | ✅ B3: diagonal de control, tolerancia 1 cm + 1 mm/m; docs/24 |
| Paquete de proyecto export/import (P0/R01) | ❌ | ✅ B2: `.polylive` (manifiesto + datos + fotos), importación en otro teléfono |
| Backup fuera del dispositivo (P0/R01) | ❌ | ✅ B2: a la carpeta elegida (Drive) + recordatorio "último respaldo" |
| Migraciones de esquema (P0/R06) | ❌ | ✅ B1: `user_version` v1–v3, transaccionales, probadas |
| BLOB de fotos en cada recarga (P0/R07) | ❌ | ✅ B1: los listados no leen la imagen |
| `JSON.parse` sin protección (P0/R13) | ❌ | ✅ B1: `safeJson` en los 6 stores; fila corrupta se salta y se registra |
| Fotos en informes (P0) | 🟡 | ✅ B2: registro fotográfico PDF con sello |
| PDF de plano + cuadro de áreas (P1/R40) | 🟡 | ✅ B2: plano con rótulo y escala gráfica, cuadro de áreas PDF/CSV |
| Crash reporting / logs (P1/R11) | ❌ | ✅ B4: registro local rotativo, manejador global, ErrorBoundary, "Enviar diagnóstico" |
| CI, linter (P1/R12) | ❌ | ✅ B4: GitHub Actions (tsc, ESLint, jest, ifcopenshell + ezdxf) |
| Expo 51 / target SDK (P1/R10/R36) | ❌ | ✅ B0: Expo 57, RN 0.86 nueva arquitectura · 🟡 **falta probar en teléfono** |
| Permisos al arrancar (P1/R31/R32) | ❌ | ✅ B4: por función |
| Identidad de operador / no repudio (P1/R34) | ❌ | ✅ B4: sello SHA-256 por foto, autor y fecha en actas |
| Tema no persistido (P3) | ❌ | ✅ B4: preferencias persistidas |
| EditorController / SurveyScreen monolíticos (P1/R18) | ❌ 2.119 / 1.558 | 🟡 B5: editor en 4 capas (338–1.171 líneas); SurveyScreen 1.462 con menú, fotos y dibujo fuera |
| Registro de tipos de elemento (P1) | ❌ | ❌ pospuesto (no cambia lo que ve el usuario; riesgo alto sin prueba en teléfono) |
| `as unknown as` / `catch {}` vacíos | ❌ 60 / 29 | ✅ 1 / 0 vacíos sin registro (los 7 restantes intencionales y comentados; 3 ahora al diagnóstico) |
| Solo vertical (P1/R30) | ❌ | ✅ B6: gira con el equipo; hojas centradas en tableta; galería por ancho · 🟡 falta probar en teléfono |
| IFC validado externamente (P1/R27) | 🟡 | ✅ en cada CI (espacio y proyecto) |
| `IfcWallStandardCase` (U14) | ❌ | ✅ B6: `IfcWall`; `Pset_DoorCommon`/`WindowCommon` + cantidades |
| Proyecto en un IFC (P1/R45) | ❌ | ✅ B6: menú ☰ → "IFC del proyecto": un IfcProject, cada espacio en su amarre (verificado con ifcopenshell: posición y giro) |

## 2. Plan agrupado y factorizado (orden de ejecución)

Una rama y un PR por bloque. Cada bloque: `tsc` limpio, tests verdes, prueba en teléfono y doc.

### B0 — Plataforma (P1, adelantado por decisión)
Expo 57 + RN 0.86 (nueva arquitectura) + Skia 2 + Reanimated 4 + gesture-handler, expo-sqlite,
expo-file-system, cámara, ubicación. Target API de Google Play. Permisos del manifiesto limpios.
Dev client nuevo y prueba completa del lienzo en teléfono.

### B1 — Persistencia segura (P0: R06, R07, R13, R15, R17)
- `user_version` + migraciones ordenadas, idempotentes y probadas (las tablas actuales = v1).
- Lectura tolerante por fila (`safeJson`): una fila corrupta se salta y se informa, no bloquea.
- Fotos: el listado no lee la imagen; las imágenes pasan a archivos (migración que las saca del BLOB).
- Backup al arrancar solo si cambió algo y sin `integrity_check` completo cada vez.

### B2 — El dato sale del teléfono (P0: R01, R08; P1: R40)
- **Paquete de proyecto** `.polylive` (zip versionado: manifiesto + datos + fotos): exportar a una
  carpeta del usuario (Drive) e importar en otro teléfono.
- **Respaldo externo**: copia del paquete a la carpeta elegida, manual y recordatorio.
- **Registro fotográfico** PDF (foto, código, fecha, autor, ubicación en planta) y exportación de fotos.
- **Plano PDF** con rótulo, escala y **cuadro de áreas** (más CSV de áreas).

### B3 — Medida confiable (P0: R02, U17)
- Medida cara interior (por defecto) / exterior / eje → longitud de eje con los espesores de los muros
  de cada extremo; propaga por uniones; queda registrada (medida → muro).
- Diagonal de control y **error de cierre** del recinto.
- **Criterio de aceptación de campo** escrito y prueba automática (recinto 4 × 5 m medido cara a cara
  cierra con error < 1 cm; área neta ± 0,5 %).

### B4 — Producción mínima (P1: R11, R12, R31, R34, R35)
- Registro local rotativo + manejador global de errores + "Enviar diagnóstico".
- CI de GitHub: `tsc`, `jest`, ESLint, validación IFC con ifcopenshell.
- Permisos por función (no al arrancar). Identidad mínima de operador: sello (hash) de cada foto y
  acta con autor y fecha. Persistir tema y preferencias.
- OTA: canal explícito.

### B5 — Estructura (P1: R18, registro de tipos)
- Dividir `EditorController` por herramienta (muros, vanos, suelo, medida, fotos, vista) y
  `SurveyScreen` por modo.
- Registro de tipos de elemento (descriptor: persistencia, render, IFC, DXF, propiedades).
- Bajar `as unknown as` y `catch {}` vacíos; quitar comentarios-changelog.

### B6 — Obra (P1: R30) y BIM (P1: R45, U14, P2 Psets)
- Horizontal y layout de tableta.
- IFC del proyecto completo en un archivo; `IfcWall` en lugar de `IfcWallStandardCase`;
  `Pset_SpaceCommon`, `Pset_DoorCommon`, `Pset_WindowCommon`.

## 3. Lo que este plan no puede subir a 8,5 (honestidad)
Competitividad, Potencial comercial y Producción dependen también de cosas que no son código:
publicar en Google Play, usuarios reales, láser y plugin de Revit probados con equipo y licencia.
El plan las sube, pero no promete 8,5 en ellas sin esas condiciones. La re-auditoría al cierre
(B6) dirá las notas reales con evidencia.

## 4. Re-auditoría al cierre (2026-10-06) — notas con evidencia

Criterio: misma escala de la auditoría. Una nota sube solo con evidencia en el repositorio (código,
test o CI). Lo que depende del teléfono queda **condicionado** a la prueba en el dev build de Expo 57
(build `86a493d0`); si esa prueba falla, la nota vuelve a la columna "sin teléfono".

| Dimensión | Auditoría | Hoy | Evidencia / qué falta |
|---|---:|---:|---|
| Arquitectura | 6,0 | 8,5 | capas intactas; editor en 4 capas; casos de uso por entregable · falta registro de tipos |
| Código | 6,0 | 8,5 | tsc estricto, ESLint 0 errores, casts 65 → 1, errores al diagnóstico |
| Frameworks | 6,0 | 9,0 | Expo 57 / RN nueva arquitectura / Skia 2 / Reanimated 4 · condicionado al teléfono |
| Persistencia | 4,5 | 8,5 | migraciones versionadas, lectura tolerante, fotos fuera de los listados, paquete |
| Offline-first | 6,0 | 9,0 | todo local + paquete y respaldo externo sin red |
| Testing | 6,0 | 8,5 | 964 tests, CI con validación externa IFC/DXF · sin tests de UI renderizada |
| Seguridad / evidencia | 4,0 | 7,5 | sello SHA-256, permisos por función · sin cifrado en reposo ni firma con clave |
| Geometría / medida | 4,5 | 8,5 | cara a cara → eje, cierre con tolerancia, criterio de campo con test |
| Topología | 4,0 | 8,5 | uniones persistentes, recintos con identidad, áreas netas |
| UX/UI | 5,5 | 8,5 | horizontal/tableta, sin herramientas falsas, errores visibles · condicionado al teléfono |
| Uso en obra | 3,0 | 8,0 | medida confiable, respaldo, una mano, horizontal · falta láser BLE |
| Flujo campo-oficina | 2,0 | 8,0 | paquete ida y vuelta, PDF, CSV, IFC/DXF · sin sincronización |
| IFC | 4,5 | 8,5 | IFC4 estándar, Psets/Qto, proyecto federado, MapConversion, validado en CI |
| Revit | 3,5 | 7,0 | IFC del proyecto en coordenadas compartidas · plugin sin probar (falta Revit) |
| Interoperabilidad / multiformato | 3,0 / 2,0 | 8,0 | IFC, DXF, PDF, CSV, KML, paquete · sin BCF |
| MVP | 3,5 | 8,5 | los 10 bloqueantes P0 cerrados · condicionado a la prueba en teléfono |
| Producción | 1,5 | 6,5 | CI, diagnóstico, OTA por canal · sin Play Store, sin usuarios reales |
| Competitividad / potencial comercial | 2,5 / 4,5 | 6,0 / 6,5 | no se sube sin publicar y sin usuarios (ver §3) |

Lectura honesta: **las dimensiones técnicas y de MVP llegan a ≥ 8,5** con evidencia; Revit,
Producción y las comerciales no llegan y no pueden llegar solo con código (Play Store, Revit,
láser y usuarios reales). Pendiente para cerrar: la prueba completa en teléfono con el dev build
de Expo 57 (checklist de docs/21 + horizontal), y el merge del PR del MVP.


## 5. Ronda final de calidad (2026-10-08)

Después de la prueba en tableta (docs/25) y antes de fusionar a `main`:

- **Código muerto** (knip con la entrada real de Expo): ~190 exportaciones internas, 28 declaraciones
  muertas y 2 dependencias nativas (`expo-status-bar`, `react-native-screens`) eliminadas. `knip.json`
  queda en el repo para repetirlo.
- **Campos que no guardaban** (H-02): `CommitTextInput` confirma al ocultar el teclado con Atrás y al
  cerrar la hoja; lo usan todos los campos numéricos y las ventanas de niveles/fases/restricciones.
- **Deshacer** revierte también el nombre (claves de `properties` fusionadas) — H-23, con test.
- **BIM en el IFC**: área lateral neta del muro (descuenta sus vanos), volúmenes, `Reference` en los
  Pset comunes, cantidades y material de columnas, Pset/Qto de vigas y barras; aviso de espacios sin
  ubicar en el IFC del proyecto. Validado con ifcopenshell; test `IFCQuantities`.
- **Skia 2**: sin API obsoleta de `SkPath` (PathBuilder); fuera `SafeAreaView` obsoleto.
- **UI**: pantallas del menú por encima del cromo y dueñas de Atrás, área neta en tarjetas y en
  Exportar, carpeta de exportación recordada, fechas locales, alto contraste legible, selección BIM
  sobre cotas, arrastre de columnas por su cuerpo, cada espacio abre en Levantamiento.

Estado: 974 tests, `tsc` y ESLint sin errores, knip limpio, IFC/DXF validados. Pendiente: la prueba en
la tableta con la build de desarrollo con rotación (los hallazgos «Verificar en equipo» de docs/25) y
dos decisiones de producto (H-15 encadenar muros, H-18 cota alineada u ortogonal).


## 6. Plan — Importar levantamientos de Revit por IFC (2026-10-22, sin código aún)

Decidido con el dueño: **IFC a objetos editables (B), parser STEP en el teléfono (TypeScript),
GlobalId de Revit preservado, por fases.** El código empieza cuando cierre la sesión de revisión
que trabaja hoy sobre `audit/estable-campo`; irá en su propia rama (`feat/importar-ifc`, desde
`main`) y en un worktree aparte.

### 6.1 Vía de entrada (alcance evaluado)

| Vía | Decisión |
|---|---|
| IFC nativo de Revit → archivo al teléfono → PolyLive | **Elegida.** openBIM, sin instalar nada en Revit, sirve para otros autores. |
| Configuración de exportación IFC guardada en Revit («PolyLive») | **Sí, sin código**: fija IFC2x3 CV 2.0 (o IFC4 Design Transfer View), espacios, cantidades base, coordenadas compartidas. Se documenta en la fase 1. |
| Script Dynamo / pyRevit | Solo si hace falta automatizar la exportación; nunca formato propio. |
| Add-in C# (API de Revit) que escriba `.polylive` | **Descartado por ahora**: proyecto .NET por versión de Revit y atado al esquema interno. Se reconsidera solo si el IFC pierde datos imprescindibles con archivos reales. |
| Conversión en la nube (Autodesk APS) | Descartado: exige internet y cuenta; en obra no hay. |
| web-ifc (WASM) | Descartado: Hermes no ejecuta WebAssembly. |

IFC4 **Reference View** no sirve: exporta geometría teselada, sin eje ni capas, y no hay espesor
fiable del muro.

### 6.2 Modelo de datos (sin migración propia; requiere la de §7)

- Cada objeto importado guarda en `properties_json`: `ifcGuid` (GlobalId de Revit), `origin: 'ifc'`
  y el nombre o tipo de Revit. `ObjectProperties` es abierto: no cambia el esquema SQLite.
- Lo creado en PolyLive no lleva `origin` (o `'polylive'`); su GUID sigue saliendo de su id
  (`guid-generator.ts`), como hoy.
- Niveles: cada `IfcBuildingStorey` → nivel del espacio (por espacio, ver §7), con su cota.
  Cada espacio importado recibe **todos** los niveles del IFC, no solo el suyo: un muro con base en
  N1 y tope en N2 (o una culata atada a la cubierta) debe encontrar su nivel de tope en su espacio.
  Se fusionan con los niveles que ya tenga el espacio por nombre y cota (no se duplican).
- **Alzado de los muros (culatas, trapecios)**: cada muro importado lleva su `WallVertical`
  (`domain/objects/vertical.ts`), una restricción por extremo atada a los niveles importados, y su
  `wall_elevations.levels_json` (`leftHeight`/`rightHeight`/`leftBase`/`rightBase`). Así se ve y se
  corrige en la vista altimétrica y con el selector de nivel, como un muro creado en la app.
- Espacios: cada planta importada → un espacio (`project_spaces`), y cada `IfcSpace` → `Room`.

### 6.3 Fases

**Fase 1 — Importar y ver en el teléfono** (casi todo archivos nuevos)
- `infrastructure/import/ifc/`: lector STEP (espejo de `step-writer.ts`), resolución de
  referencias `#n`, unidades (`IfcSIUnit`, prefijos) y `IfcLocalPlacement` encadenado a 2D de planta.
- Mapeo: `IfcBuildingStorey` → nivel · `IfcWall`/`IfcWallStandardCase` → `Wall` (eje por la
  representación `Axis`, espesor por `IfcMaterialLayerSetUsage`; si no hay, desde el perfil
  extruido). Restricciones verticales: del Pset de Revit (Restricción de base/superior, desfases,
  altura desconectada — exige marcar «Exportar conjuntos de propiedades de Revit» en el perfil de
  exportación); si no vienen, base = piso contenedor y alturas por extremo leídas de la geometría
  (perfil editado como `IfcExtrudedAreaSolid` en el plano del muro, o recorte
  `IfcBooleanClippingResult` cuando el muro está unido a una cubierta) · `IfcDoor`/`IfcWindow` → vanos en su muro (vía `IfcRelVoidsElement` +
  `IfcRelFillsElement`) · `IfcSpace` → `Room` · `IfcSlab` y columnas: fuera de la fase 1.
- **Límite conocido — culata con cumbrera**: la app modela el alzado como trapecio (altura por
  extremo). Una culata triangular o pentagonal (pico a media longitud) no cabe en un muro: se parte
  en dos muros en la cumbrera y se avisa en el resumen. Las mitades guardan `ifcSourceGuid` (solo
  trazabilidad), **no** `ifcGuid`: al exportar usan el GUID derivado de su id, porque dos elementos
  con el mismo GlobalId hacen inválido el IFC. Si es frecuente en tus levantamientos, se reabre extender `VerticalLevels` a un perfil
  con vértices intermedios (cambio de modelo: se acuerda antes).
- Lo que no se reconozca se cuenta y se informa («n elementos ignorados por tipo»); nunca se aborta
  el archivo entero por un elemento.
- Caso de uso `ImportIfcUseCase` en `application/` (el dominio no ve el parser); entrada por el
  selector de archivos existente (`native/files`), con confirmación (resumen por tipo y nivel)
  antes de escribir, en una transacción.
- Georreferencia: si trae `IfcMapConversion`, se ofrece usarla; si no, coordenadas locales.
- Tests jest con IFC de muestra reales (incluida al menos una culata y muros en dos niveles) del dueño (anonimizados) en `test/fixtures/ifc/`, más un
  ida y vuelta: IFC exportado por PolyLive → importado → mismas geometrías (tolerancia en mm).

**Fase 2 — Editar y levantar sobre lo importado**
- Lo importado se edita con las herramientas actuales. Marca visual discreta de «importado» con los
  tokens de `src/ui/design` (sin colores nuevos). Al editarlo conserva `ifcGuid`.

**Fase 3 — Exportar solo lo creado en PolyLive** (toca código compartido: después de integrar la
sesión de revisión)
- Filtro por `origin` en los casos de uso de exportación IFC/DXF; los objetos importados se omiten.
- **Decidido (2026-10-22)**: un vano creado en PolyLive sobre un muro importado se exporta **junto
  con su muro anfitrión** (el muro sale con su `ifcGuid` de Revit si lo tiene —una mitad de culata
  partida, con el GUID de su id, ver 6.3—, para que no quede un vano huérfano
  y Revit lo reconozca al comparar). El resto de lo importado se sigue omitiendo.
- Validación con `scripts/validate_exports.py` como hoy.

**Más adelante (fuera de alcance):** informe de diferencias diseño ↔ levantado por `ifcGuid`, BCF
para devolver observaciones a Revit, y el IFC como capa de referencia de solo lectura.

### 6.4 Antes de empezar

1. Uno o dos IFC reales de levantamientos (IFC2x3 CV 2.0), con al menos un muro compuesto, una
   puerta y un espacio.
2. La sesión de revisión integrada en `main`.
3. La migración de niveles/fases/GPS por espacio (§7) hecha antes de la fase 1.


## 7. Pendiente — Creación de proyecto y de espacio (pedido 2026-10-22, para la próxima ronda)

Sin código aún; se hace cuando se integre la sesión de revisión, en su propia rama.

- **Crear proyecto**: quitar el selector «Disciplina» (Arquitectura / Estructuras / Instalaciones)
  del diálogo (`ui/screens/ProjectsScreen.tsx`). El campo `discipline` del modelo se conserva con
  su valor por defecto (`DEFAULT_DISCIPLINE`): no cambia el esquema ni rompe paquetes `.polylive`.
- **Crear espacio**: la primera pantalla tras «+ Nuevo espacio»
  (`ui/screens/ProjectWorkspaceScreen.tsx`) deja configurar lo que se sabe de antemano: GPS /
  georreferencia, niveles, fases, actividades de avance y demás opciones; todo se puede saltar y
  editar después. Reutiliza las hojas que ya existen (Topografía, niveles/fases, Avance), sin
  componentes nuevos.
- **Decidido (2026-10-22): niveles, fases y GPS son POR ESPACIO.** Hoy son del proyecto
  (`project_markers`, `project_georeference`), así que es un **cambio de modelo de datos**: hace falta
  una migración que copie lo actual a cada espacio existente, ajustar `MarkerStore`/`GeoStore`, el
  IFC (un `IfcBuildingStorey`/`IfcMapConversion` por espacio), el paquete `.polylive` (paquetes v1
  se leen copiando lo del proyecto a sus espacios) y el importador IFC (§6.2: los niveles importados
  van al espacio, no al proyecto). Al crear un espacio se ofrece copiar la configuración de otro
  espacio del proyecto, para no reescribirla.
