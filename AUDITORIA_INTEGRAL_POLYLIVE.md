# AUDITORÍA TÉCNICA INTEGRAL — LevON / PolyLive BIM

> **Objeto auditado:** el producto que el encargo llama **LevON** y que en el repositorio se llama **PolyLive BIM**: `app-bim-typescript/` (Expo SDK 51 · React Native 0.74 · TypeScript). `_LevON/` es el proyecto Flutter del que se portó el motor 2D. Es solo referencia y no se compila.
> **Commit auditado:** `6c3ff6b`, `main`, 2026-10-03.
> **Método:** inspección estática del repositorio, ejecución de `jest` y `tsc --noEmit` y lectura de `docs/` y de la bóveda `_0bsidian/`. **No se modificó ningún archivo del proyecto.**
> **Notación de evidencia:** `src/…` es `app-bim-typescript/src/…`; `archivo:línea` es la posición en el commit auditado.
> **Estados:** EXISTE · PARCIAL · SIMULADA · FRÁGIL · NO VERIFICADA · AUSENTE.

## Hechos medidos (base de toda la auditoría)

| Métrica | Valor | Fuente |
|---|---:|---|
| Código fuente TS/TSX | 33.305 líneas en 178 archivos | `wc -l src/**` |
| Dominio / Aplicación / Infraestructura / Native / UI | 4.879 / 7.421 / 4.240 / 2.057 / 14.176 líneas | por capa |
| Tests | 15.794 líneas, 57 suites, **857 pasan + 4 todo, 0 fallan** | `npx jest` (17,9 s) |
| Chequeo de tipos | `tsc --noEmit` limpio, `strict: true` | `tsconfig.json:10` |
| Archivo más grande | `EditorController.ts`, 1.621 líneas | |
| Pantalla más grande | `SurveyScreen.tsx`, 1.093 líneas | |
| Escapes de tipo | 53 `any`, 42 `as unknown as` | grep |
| `catch {}` vacíos | 21 | grep |
| CI/CD | **AUSENTE** (no hay `.github/`) | |
| Linter/formateador | **AUSENTE** (sin eslint ni prettier) | |
| Crash reporting / telemetría | **AUSENTE** | grep Sentry/Crashlytics/Bugsnag |
| Commits | 31, del 2026-09-15 al 2026-10-01 | `git log` |
| Herramientas del FAB | 12 ✅ · 1 🟡 · **39 ⬜** deshabilitadas | `docs/18` §11 |
| Toggles visibles sin efecto (⚠️) | 5 de esquina + 5 de filtros/capas | `docs/18` §3 |
| Importadores de cualquier formato | **0** | grep |
| Exportadores | IFC4 (STEP) y DXF R2000, **por espacio**, solo texto | `src/ui/workspace/exportActions.ts` |

---

# CAPÍTULO 1 — RESUMEN EJECUTIVO

## 1.1 Qué es la aplicación actualmente
Es una app Android (Expo/React Native) **local-only** para levantar en planta: muros, columnas, puertas y ventanas sobre un lienzo Skia, todo dentro de "espacios" agrupados en proyectos. También ofrece:
- Alzado por muro con vanos.
- Niveles y fases con restricciones de base y tope "tipo Revit".
- Georreferenciación MAGNA-SIRGAS: amarre por origen, GPS o mojones por mínimos cuadrados.
- Fotos ancladas al plano.
- Exportación **IFC4** y **DXF R2000** de un espacio a la vez.

No tiene servidor, cuentas, sincronización ni importación.

## 1.2 Qué intenta resolver
Capturar en obra la geometría existente de una edificación y llevarla a Revit/AutoCAD sin redibujarla. Después, según el plan, sumar avance de obra (M3), revisión con marcas (M4) y topografía de apoyo (M2b).

## 1.3 Estado real
- **Funciona de punta a punta en un teléfono** el flujo "dibujar → ajustar → exportar IFC/DXF a una carpeta". Se verificó en dispositivo en sesiones previas (`docs/17`).
- **No funciona** nada de lo que necesita un flujo campo↔oficina:
  - No hay forma de sacar el proyecto del teléfono, salvo esos dos archivos por espacio.
  - Las fotos no salen del dispositivo.
  - Las copias de seguridad viven dentro del sandbox de la app.
  - No existe camino de regreso (importación).
- Dos de los cuatro modos (Avance y Revisión) están completamente vacíos (⬜).

## 1.4 Nivel de madurez
**ALPHA.**
- El núcleo de dominio está probado: 857 tests de lógica pura.
- La UI está pulida en el lienzo.
- Faltan los requisitos mínimos de un producto de campo: protección ante pérdida del dispositivo, salida de evidencias y medición confiable.

## 1.5 Fortalezas principales
1. **Capas bien separadas.** Dominio, Aplicación, Infraestructura, Native y UI, con controladores puros (`EditorController`, `ElevationEditor`) testeables sin React.
2. **Modelo vertical serio**, con niveles, fases y restricciones de base/tope por extremo (`src/domain/objects/vertical.ts`). Es raro en apps móviles.
3. **Georreferenciación técnicamente correcta**: proj4 offline, EPSG colombianos y ajuste por mínimos cuadrados con residuales.
4. **IFC4 escrito a mano y cuidado.** GUIDs estables derivados del id (`guid-generator.ts`), un piso por nivel, vanos con `IfcRelVoidsElement`/`IfcRelFillsElement`, Qto y Pset estándar.
5. **Suite de tests amplia y verde** (857), con escenarios de campo, casos críticos y recuperación ante caídas sobre SQLite real de Node.

## 1.6 Debilidades principales
1. **Topología no persistente.** Los muros son segmentos independientes y las esquinas no existen como dato. Mover un extremo o aplicar una medida desconecta la esquina vecina (`EditorController.ts:893-909`, `:1413-1446`).
2. **La medición se aplica al eje del muro** (`applyMeasurementToWall`, `EditorController.ts:1427`). Un láser mide de cara a cara, así que hay un **error sistemático del orden de un espesor de muro**.
3. **Solo el recinto de mayor área de cada espacio se persiste y se exporta** (`syncRoomGeometry`, `EditorController.ts:1343`, `rooms[0]`). Además, su área es **al eje**, no neta.
4. **Datos atrapados en el dispositivo.**
   - Sin exportación ni importación de proyecto.
   - Backups en `documentDirectory` (`ExpoBackupDatabaseUseCase.ts:55`).
   - Fotos como BLOB en SQLite, sin forma de exportarlas.
5. **Sin versionado de esquema.** `migrate()` solo ejecuta `CREATE TABLE IF NOT EXISTS` (`database.ts:81`, `ExpoSQLiteDatabase.ts:50`).

## 1.7 Riesgos críticos
- **Pérdida total de datos ante robo, rotura o desinstalación.**
- **Planos "medidos" con error sistemático** que el usuario cree exactos.
- **Agotamiento de memoria** al cargar todos los BLOB de fotos en cada edición (`EditorController.ts:1552` → `ObjectStore.ts:389`, `SELECT *`).
- **Bloqueo de publicación en Google Play.** Expo 51 apunta a API 34 y la política vigente exige un target más reciente (verificar fecha exacta).
- **Primera migración de esquema sin mecanismo.**

## 1.8 Potencial
**Medio-alto** como nicho: levantamiento de existentes con salida a Revit con niveles y restricciones en contexto colombiano (MAGNA-SIRGAS). La combinación de alzado por muro, restricciones verticales e IFC con GUID estable es poco común en móvil. El potencial está **condicionado** a convertir la geometría en un modelo topológico real y a resolver el ciclo de datos.

## 1.9 Veredicto inicial
Es **más que un prototipo que aparenta** (el dominio es real y está probado) y **menos que un MVP**. Hoy es una buena herramienta de dibujo aproximado con exportación BIM honesta. **No es todavía una herramienta de medición confiable ni una herramienta de campo segura.**

## 1.10 Calificación inicial
**3,9 / 10 integral** (39/100), con nota técnica pura **5,0/10**. Detalle en el capítulo 42 y en la tabla final.

---

# CAPÍTULO 2 — INVENTARIO TÉCNICO COMPLETO

| Rubro | Elemento | Versión | Uso real | Estado |
|---|---|---|---|---|
| Lenguaje | TypeScript | ~5.3.3 | Todo el código, `strict` | EXISTE |
| Runtime | React Native | 0.74.5 (arquitectura antigua) | App | EXISTE |
| SDK | Expo | ~51.0.0 | Build, módulos nativos | EXISTE (envejecido) |
| Render 2D | @shopify/react-native-skia | 1.2.3 | Planta, alzado, capa viva | EXISTE (versión antigua) |
| Gestos/animación | gesture-handler 2.16 / reanimated 3.10 | | Cámara en hilo UI, FAB, hojas | EXISTE |
| Estado UI | zustand | ^5.0.5 | `workspaceStore.ts` (287 l.) | EXISTE |
| Estado de modelo | Controladores propios | — | `EditorController`, `ElevationEditor` | EXISTE |
| BD | expo-sqlite | ~14 | `ExpoSQLiteDatabase.ts` (WAL, busy_timeout) | EXISTE |
| BD tests | sqlite3 (Node) | ^6 | `database.ts`: la suite no prueba expo-sqlite | EXISTE (brecha) |
| Proyecciones | proj4 | ^2.22 | MAGNA-SIRGAS, EPSG 3114–3118, 9377, 4686 | EXISTE |
| Cámara | expo-camera | ~15 | `ExpoPhotoCapture.ts` (calidad 0,8) | EXISTE |
| GPS | expo-location | ~17 | `ExpoGpsProvider`, `GpsAverager` | EXISTE |
| BLE | react-native-ble-plx | ^3.2 | `HuepaDeviceManager.ts` (359 l.) | PARCIAL (sin UI, requiere Dev Client) |
| Archivos | expo-file-system + SAF | ~17 | `saveToUserFolder.ts` (solo texto) | EXISTE |
| OTA | expo-updates | ~0.25 | URL configurada en `app.json` | EXISTE (sin canal ni política) |
| Hápticos y fuentes | expo-haptics, Roboto | | Feedback | EXISTE |
| IFC | Escritor STEP propio | IFC4 | `step-writer.ts`, `IFCSerializer.ts` | EXISTE |
| DXF | Escritor propio | AC1015 (R2000) | `DXFSerializer.ts` (715 l.) | EXISTE |
| Geometría | CDT propio, spatial hash, polígonos, miter | — | `src/domain/geometry/*` | EXISTE (CDT sin uso en la app) |
| Topología | `TopologyGraph` (caras planares) | — | Detección de recintos | EXISTE (derivada, no persistida) |
| Servicios externos | — | — | Ninguno, salvo el endpoint OTA | AUSENTE |
| APIs propias / backend | — | — | — | AUSENTE |
| Importadores | — | — | — | AUSENTE |
| PDF / CSV / JSON / KML | — | — | — | AUSENTE |
| Componentes BIM | Wall, Door, Window, Column, Floor, Room + marcadores de nivel/fase | — | STI en `revit_objects` | EXISTE |
| Plataformas | Android (objetivo); `ios` configurado en `app.json` | — | Solo probado en Android | iOS NO VERIFICADA |

---

# CAPÍTULO 3 — ARQUITECTURA GENERAL

## 3.1 Arquitectura lógica

```
UI (screens, workspace, canvas Skia)  ──► state/workspaceStore (zustand: cromo, tema, filtros)
        │ suscribe
        ▼
Application: EditorController / ElevationEditor (controladores puros con patch/subscribe)
             UseCases (Create*/Move/Update/Delete/Detect/Export) + Commands + CommandStack
             Services: ProjectService, TopographyService, WallElevationService, SelectionService
        ▼
Domain: objects (RevitObjectBase + 6 tipos), geometry, topology, geo
        ▲
Infrastructure: sqlite stores (ObjectStore, ProjectStore, MarkerStore, GeoStore), export IFC/DXF, validación
Native: adaptadores Expo (sqlite, cámara, GPS, BLE, archivos, permisos, backup)
```

## 3.2 Arquitectura física
Un único proceso en el dispositivo. Una base SQLite (`polylive.db`, WAL). Los archivos exportados van a una carpeta que elige el usuario (SAF). **No hay ningún componente fuera del teléfono.**

## 3.3 Evaluación

| Aspecto | Juicio | Evidencia |
|---|---|---|
| Separación de capas | **Buena.** El dominio no importa React ni Expo; Native implementa interfaces de Infra (`IDatabase`). | `database.ts:22`, `ExpoSQLiteDatabase.ts:28` |
| Responsabilidades | **Mala en el controlador.** `EditorController` (1.621 l.) reúne herramientas, gestos, arrastre, medición, fotos, recintos, niveles, sincronización del Room y notificaciones. | `EditorController.ts` |
| Pantallas | `SurveyScreen` (1.093 l.) orquesta demasiado: exportación, BLE, hojas y diálogos. | |
| Flujo de datos | Unidireccional: acción → UseCase → SQLite → `reload()` relee **todo** el espacio → `patch`. Simple y correcto, pero O(n) por edición y sin diffs. | `EditorController.ts:569-598` |
| Acoplamiento | Bajo entre capas y alto dentro de Application (el controlador conoce todos los use cases). | `AppServices.ts` |
| Cohesión | Alta en dominio y exportadores; baja en controlador y pantallas. | |
| Testabilidad | **Alta en lógica pura**, nula en UI y en el adaptador real de SQLite. | `test/__mocks__/expo-sqlite.ts` |
| Escalabilidad | Limitada. El modelo es "espacio-céntrico" (todo cuelga de `room_id`); no hay noción de modelo de edificio ni de topología persistente. | `schema.ts:20-31` |
| Persistencia | Single-table inheritance con JSON. Flexible, pero sin esquema versionado y sin FK reales. | `schema.ts` |

## 3.4 Conclusión
| Nivel | ¿Adecuada? |
|---|---|
| Prototipo | Sí, de sobra |
| **MVP** | **Sí, con correcciones puntuales:** topología, export/import de proyecto, migraciones |
| Producción | No: sin migraciones, telemetría, CI ni sincronización |
| Escalable | No en su forma actual: el modelo espacio-céntrico y la topología derivada no escalan a edificios ni a colaboración |

---

# CAPÍTULO 4 — CALIDAD DEL CÓDIGO

| Dimensión | Nota /10 | Hallazgo concreto |
|---|---:|---|
| Legibilidad | 7 | Nombres en español coherentes con el dominio; funciones cortas en dominio. |
| Coherencia | 6 | Dos controladores con convenciones parecidas; persisten `Room` contenedor = `Room` espacio (ver capítulo 6). |
| Complejidad | 5 | `EditorController` 1.621 l., `SurveyScreen` 1.093, `ObjectStore` 834, `planRenderer` 760. |
| Duplicación | 6 | Dos implementaciones de `IDatabase` casi idénticas (aceptable); `CloseRoomUseCase` + `CDT.ts` (628 l.) **sin uso en la app** (`docs/16`). |
| Nomenclatura | 6 | `RevitObjectBase`, `revit_objects`: el dominio se nombra por un producto comercial y no por el concepto (elemento constructivo). |
| Abstracciones | 7 | `IDatabase`, `IObjectStore`, `ICommand`, puertos de GPS y cámara: correctas. |
| Patrones | 6 | Command + CommandStack. Los `Create*Command` persisten en el UseCase y su `execute()` está vacío; el redo depende de `restoreObject` (`base.ts:144-159`). Funciona, pero es una asimetría frágil. |
| Anti-patterns | — | God object (controlador); "comentarios-changelog": decenas de bloques `BUG CORREGIDO`/`GAP CERRADO` narran historia que pertenece a git (`ExpoSQLiteDatabase.ts:77-89`, `ObjectStore.ts:370-373`, `guid-generator.ts:10-13`). |
| Manejo de errores | 5 | `AppError` con `userMessage` existe, pero hay 21 `catch {}` vacíos y solo `console.warn` como registro. |
| Validaciones | 5 | `ValidationService` y validación en `MarkerStore`. `JSON.parse` sin protección en `ObjectStore.ts:126,575,626`: una fila corrupta impide abrir el espacio entero. |
| Tipado | 6 | `strict` y tipos marcados (`Meters`, `RoomId`), pero 42 `as unknown as` anulan la marca, p. ej. `ExportRoomIfcUseCase.ts:55` (RoomId→RevitObjectId). |
| IDs | 4 | `generateId()` = timestamp base36 + contador de sesión + 4 caracteres de `Math.random` (`base.ts:169-175`). **No es UUID**: con varios dispositivos aparecen colisiones posibles. |
| Código muerto/experimental | 6 | `CloseRoomUseCase`, `CDT`, arcos/polilíneas en `Wall.shape` sin herramienta que los cree, BLE sin UI. |
| Deuda | — | Ver capítulos 20 y 40. |

**Nota de código: 6,0/10.** Código limpio y probado en el núcleo, con dos monolitos y una disciplina de tipos que se rompe en los bordes.

---

# CAPÍTULO 5 — FRAMEWORKS Y STACK

| Tecnología | Por qué existe | ¿Buena elección? | ¿Bien usada? | Sobre/sub-ingeniería | Riesgo | Nota /10 |
|---|---|---|---|---|---|---:|
| Expo SDK 51 | Build y módulos nativos sin Android Studio | Sí para un equipo de 1 | Sí | — | **Alto**: SDK de 2024; target API 34 frente a la política de Play; upgrade acumulado de 4+ SDK | 6 |
| React Native 0.74 | UI multiplataforma | Sí | Sí | — | Medio: arquitectura antigua, pronto sin soporte | 6 |
| Skia 1.2.3 | Lienzo vectorial de alto rendimiento | **Muy buena** | Bien: Picture + capa viva + cámara en hilo UI | — | Medio: versión antigua; la API cambió en 1.3+ | 8 |
| Reanimated + gesture-handler | 60 fps en gestos | Sí | Sí (`PlanCanvas.tsx`) | — | Bajo | 8 |
| zustand | Estado de cromo | Sí, ligero | Correcto: solo cromo; el modelo vive en controladores | — | Bajo | 8 |
| expo-sqlite | Persistencia local | Sí | WAL y transacciones bien; **sin migraciones** | Subingeniería en el esquema | Alto | 6 |
| sqlite3 (tests) | Correr la suite en Node | Pragmático | Los tests no ejercitan el adaptador real | — | Medio | 5 |
| proj4 | Proyecciones | **Correcta**: estándar y offline | Sí | — | Bajo | 9 |
| IFC propio (STEP) | Exportar sin dependencias pesadas | Válido para exportar; insuficiente para importar o validar | Bien escrito | Riesgo de reinventar (web-ifc/IfcOpenShell existen) | Medio | 6 |
| DXF propio | Exportar a CAD | Válido | Correcto (handles, tablas, capas) | — | Bajo | 7 |
| ble-plx | Láser Huepa | Correcta | **No integrada a la UI** | — | Medio | 4 |
| expo-updates | OTA | Útil | Sin canales ni política: puede empujar código a campo sin control | — | Medio | 5 |

**Nota de frameworks: 6,0/10.** Buenas elecciones con versiones envejecidas y sin plan de actualización.

---

# CAPÍTULO 6 — MODELO DE DATOS

## 6.1 Entidades

| Entidad | Tabla | Identidad | Relaciones | Observaciones |
|---|---|---|---|---|
| Wall/Door/Window/Column/Floor/Room | `revit_objects` (STI) | `id` TEXT | `room_id`; `parentWallId` en `properties_json` | Nivel y fase viven en `properties_json` (`LEVEL_PROP`, `PHASE_PROP`): no indexables |
| Measurement | `measurements` | `id` | `room_id`, `wall_id` | `values_json` y promedio |
| AuditPhoto | `audit_photos` | `id` | `room_id`, `linked_object_id` | **BLOB de imagen dentro de la BD** |
| Operator | `operators` | `id` | — | Solo `name`, sin autenticación |
| Project | `projects` | `id` + `bim_code` | — | Unicidad de código en la app, no en la BD |
| ProjectSpace | `project_spaces` | (project_id, room_id) | proyecto ↔ espacio | |
| WallElevation | `wall_elevations` | `wall_id` | `room_id` | Vanos y niveles en coordenadas locales del muro |
| Marker (nivel/fase) | `project_markers` | `id` | `project_id` | Base indeleble |
| Georeference | `project_georeference` | `project_id` | — | `data_json` completo |
| Benchmark | `benchmarks` + `project_benchmarks` | `id` | N:M con proyectos | Biblioteca común |

## 6.2 Hallazgos

| # | Hallazgo | Severidad | Evidencia |
|---|---|---|---|
| D1 | **Ninguna tabla declara `REFERENCES`.** `PRAGMA foreign_keys = ON` no tiene efecto y la integridad referencial depende solo del código. | Alta | `schema.ts` completo |
| D2 | **Sin versionado de esquema** (`user_version` ausente). Cualquier cambio de columna exige escribir migraciones a mano sin infraestructura. | **Crítica** | `database.ts:81`, `ExpoSQLiteDatabase.ts:50` |
| D3 | **"Room" se usa con dos sentidos**: contenedor del levantamiento (`room_id` de todo) y espacio arquitectónico (IfcSpace). Invariante `id === roomId` (`room.ts`). | Alta | `room.ts`, `schema.ts:24` |
| D4 | Topología (uniones de muros) **no persistida**: se deriva en cada `reload()`. | **Crítica** | `EditorController.ts:569-585` |
| D5 | Nivel y fase en JSON, sin columna ni índice. Una consulta "todo lo del nivel P1" exige leer y parsear todo. | Media | `marker.ts` (LEVEL_PROP) |
| D6 | Fechas como TEXT `datetime('now')` (UTC), mezcladas con `toISOString()`. Coherente pero sin zona explícita. | Baja | `ObjectStore.ts:437` |
| D7 | Soft-delete en todo. Bien para undo y auditoría; **sin purga**, la BD sólo crece (agravado por los BLOB). | Media | `schema.ts` |
| D8 | IDs no UUID (capítulo 4). | Media (alta si hay sync) | `base.ts:169` |
| D9 | Sin `version`/`etag` por fila ni registro de cambios: imposible sincronizar o resolver conflictos. | Alta para el futuro | — |
| D10 | Metadatos BIM pobres: sin clasificación (Uniclass/OmniClass/MasterFormat), tipos de elemento ni catálogo de materiales (texto libre). | Alta para BIM | `wall.ts` (`material?: string`) |

**Nota del modelo de datos: 4,5/10.**

---

# CAPÍTULO 7 — PERSISTENCIA Y GESTIÓN DE PROYECTOS

| Capacidad | Estado | Evidencia / comentario |
|---|---|---|
| Guardado | **EXISTE.** Cada muro se persiste al trazarlo; no hay "guardar". | `docs/16`; Create*UseCase |
| Autosave | EXISTE de facto (escritura inmediata) | — |
| Transacciones | EXISTE: `withTransactionAsync` con rollback (bug histórico corregido) | `ExpoSQLiteDatabase.ts:73-96` |
| WAL y busy_timeout | EXISTE | `ExpoSQLiteDatabase.ts:39-41` |
| Recuperación tras cierre forzado | EXISTE para lo persistido; **el historial de deshacer se pierde** (en memoria, 100 comandos) | `CommandStack.ts:21` |
| Backup | PARCIAL: rotacional (5) al arrancar, con `wal_checkpoint` e `integrity_check`, **pero en `documentDirectory`**: muere con el teléfono o al desinstalar | `ExpoBackupDatabaseUseCase.ts:10-13,55-57` |
| Restore | EXISTE solo desde esas copias locales; exige reiniciar la app | `App.tsx` (handleRestored) |
| Exportar o importar el proyecto completo | **AUSENTE** | grep |
| Mover un proyecto a otro dispositivo | **AUSENTE** | — |
| Versionado de proyecto | AUSENTE | — |
| Corrupción | FRÁGIL: `JSON.parse` sin `try` en la lectura de filas, así que una fila mala bloquea el espacio | `ObjectStore.ts:626` |
| Proyectos grandes | NO VERIFICADA. Cada edición relee todos los objetos **y todas las fotos con sus BLOB**. | `EditorController.ts:571,588,1552`; `ObjectStore.ts:389` |
| Crecimiento de la BD | Fotos de ~1–4 MB (calidad 0,8) dentro de SQLite × 5 copias de backup: **50 fotos ≈ 100–200 MB × 6 copias** (estimación por orden de magnitud) | `ExpoPhotoCapture.ts:43`, `schema.ts:63-74` |
| Adopción de huérfanos | EXISTE: buena protección en la actualización a proyectos | `App.tsx` / `ProjectService.adoptOrphanRooms` |

**Diagnóstico:** la persistencia es **correcta en lo transaccional y deficiente en lo operativo**. Protege contra un cierre forzado, pero no contra perder el dispositivo, que es el riesgo dominante en obra.
**Nota: 4,5/10.**

---

# CAPÍTULO 8 — GESTIÓN DEL ESTADO

| Capa | Mecanismo | Evaluación |
|---|---|---|
| Modelo | `EditorController` / `ElevationEditor`: estado inmutable con `patch` + suscripción | Bueno: puro y testeado (`test/editor`, `test/elevation`) |
| Capa viva | `liveOverlay.ts`: arrastre, borrador y snap; solo el lienzo se suscribe | Muy bueno: eliminó re-renders a 20 Hz (`docs/17`) |
| Cámara | Shared values en el hilo UI; se confirma al soltar | Muy bueno |
| Cromo | zustand `workspaceStore` (panel único, filtros, tema) | Bueno; **el tema no se persiste** |
| Persistente | SQLite: fuente de verdad. `reload()` tras cada comando | Correcto, sin cachés que desincronizar |
| Undo/redo | `CommandStack` único planta+alzado, 100 entradas, en memoria | Funcional; se pierde al reiniciar; los Create* dependen de `restoreObject` |

**Race conditions:**
- `busy` se activa por operación, pero no hay cola. Dos gestos rápidos (soltar un arrastre y tocar deshacer) pueden lanzar `reload()` concurrentes sobre el mismo estado; el último `patch` gana. **FRÁGIL / NO VERIFICADA** en dispositivo.
- `syncRoomGeometry` escribe dentro de `reload()`, que es una lectura con efecto de escritura (`EditorController.ts:585`). Mezclar lectura y escritura así es fuente típica de bucles y carreras.

**Nota: 6,5/10.**

---

# CAPÍTULO 9 — UI / UX

| Aspecto | Estado | Comentario crítico |
|---|---|---|
| Lienzo | EXISTE, pulido | Pan, pinch y rotación con snaps, ejes, norte; convenciones ISO 128 (poché, medio tono, cotas) |
| Tema | EXISTE | 4 modos × claro/oscuro/alto contraste; **no se persiste**; `app.json` fija `userInterfaceStyle: light` |
| Navegación | EXISTE | Sin tabs; ☰ app, ⋮ proyecto, FAB de modo |
| Feedback | EXISTE | Toasts, háptica, píldoras arrastrables |
| **Herramientas fantasma** | **Problema serio** | 39 herramientas ⬜ visibles y deshabilitadas, más **10 toggles ⚠️ que cambian de estado y no hacen nada** (snap vértice/punto medio, escala acotada/anotativa, capas…). Esto erosiona la confianza del usuario. |
| Modos | PARCIAL | 2 de 4 modos (Avance, Revisión) sin ninguna herramienta funcional |
| Orientación | **Solo vertical** (`app.json: orientation: portrait`) | Mala para tableta en obra |
| Una mano | EXISTE | Deshacer junto al pulgar, pulsación larga = rehacer |
| Accesibilidad | NO VERIFICADA | No hay evidencia de `accessibilityLabel` sistemáticos ni pruebas con lector de pantalla |
| Carga | PARCIAL | Toast "Generando IFC…"; sin progreso real |
| Permisos | Malo | Se piden **todos** (cámara, ubicación, BLE) al arrancar (`PermissionsManager.ts:190`) |
| Errores | PARCIAL | Mensajes de usuario en `AppError`; muchos silencios (`catch {}`) |

**Nota UX/UI: 5,5/10.** Excelente en el lienzo; penalizada por la interfaz que promete funciones que no existen, la falta de horizontal y los modos vacíos.

---

# CAPÍTULO 10 — INTERACCIÓN DE DIBUJO Y MEDICIÓN

| Función | Estado | Precisión / riesgo |
|---|---|---|
| Puntos | AUSENTE como entidad (no hay herramienta Punto/Coordenada; ⬜ F6b) | — |
| Líneas | AUSENTE (⬜) | — |
| Muros | EXISTE: arrastre libre o punto a punto, snap a nodo y ángulo, longitud y ángulo en vivo | Precisión de dedo (cm a dm según zoom) |
| Columnas, puertas, ventanas | EXISTE | Puertas y ventanas alojadas en muro |
| Selección | EXISTE (tolerancia en px) | `SelectionService.ts` |
| Edición de extremos y centro | EXISTE, **rompe uniones** | `EditorController.ts:893-909`: solo mueve el muro seleccionado |
| Snap a nodo / ángulo | EXISTE | `SnapHandler.ts` |
| Snap vértice / punto medio | **SIMULADA** (toggle sin efecto) | `docs/18` §3 |
| Zoom / pan / rotación | EXISTE | Cámara en hilo UI |
| Coordenadas | EXISTE: locales desde 0,0,0; topográficas por transformación | `georeference.ts` |
| Unidades | Solo metros | Sin configuración (aceptable para Colombia) |
| Escala | Visual; "acotado/anotativa" SIMULADA | — |
| **Medición** | PARCIAL: manual ("ingresar medida"); láser BLE sin UI | `docs/18` §4 |
| **Aplicar medida** | **Conceptualmente incorrecta**: fija la longitud **del eje**, moviendo solo el extremo final (`EditorController.ts:1427-1430`). Un láser mide de **cara interior a cara interior**, así que el error es de 1 espesor (≈ 0,10–0,25 m). Además desconecta el muro vecino. | **Crítica** |
| Cotas | Visuales (render); no hay entidad de cota (⬜) | — |
| Cierre y error de cierre | AUSENTE: no hay diagonales, triangulación de control ni reporte de error de cierre | — |

**Diagnóstico:** el dibujo es fluido y agradable; **la medición no es apta para uso profesional**. No existe ninguna cadena de medidas que garantice que el plano cierre con las medidas tomadas.

---

# CAPÍTULO 11 — MOTOR GEOMÉTRICO

| Tema | Estado | Evidencia |
|---|---|---|
| Polígonos (área, centroide, orientación) | EXISTE, probado | `polygon-utils.ts`, `test/geometry/polygons.test.ts` |
| Validación de polígonos | EXISTE | `polygon-validator.ts` |
| CDT (triangulación restringida) | EXISTE, 628 l., probado, **sin uso en la app** | `CDT.ts`, `docs/16` |
| Spatial hash | EXISTE | `spatial-hash.ts` |
| Miter de esquinas | EXISTE (solo visual) | `miter.ts`, `MiterHandler.ts` |
| Arcos / polilíneas en muros | PARCIAL: el dominio los soporta; **ninguna herramienta los crea**; IFC/DXF los exportan rectos (start→end) | `wall.ts`, `IFCSerializer.ts:200-222` |
| Tolerancias | Fijas: 5 cm de fusión de nodos; EPSILON en CDT; 1e-9 en igualdad de recinto | `TopologyGraph.ts:46` |
| Intersecciones en T | EXISTE (edge splitting en extremos) | `TopologyGraph.ts:69-72,289-306` |
| **Intersecciones en X** (cruce sin extremo) | **AUSENTE**: solo se parte una arista cuando un **extremo** cae sobre ella | `TopologyGraph.ts:289` |
| Áreas | **Al eje** (polígono de nodos de eje) | `DetectRoomsUseCase.ts`, sin offset por espesor |
| Área neta / bruta | AUSENTE: no se distingue | — |
| Geometría degenerada | PARCIAL: muro de longitud 0 rechazado; micro-arrastres ignorados | `wall.ts`, `EditorController.ts:882` |
| Auto-generación de recintos | EXISTE (caras planares, límite 200 aristas) | `TopologyGraph.ts:43` |

**Veredicto:** el motor es **matemáticamente correcto para casos simples y cuidadosos**, pero **no es robusto en general**:
- No resuelve cruces.
- No mantiene uniones.
- Calcula áreas en una convención (eje) que ningún entregable usa sin aclararlo.

**Nota de geometría: 4,5/10.**

---

# CAPÍTULO 12 — MOTOR DE ESPACIOS Y TOPOLOGÍA

| Componente | Estado | Juicio |
|---|---|---|
| TopologyGraph | EXISTE: fusión de nodos, T-split, caras mínimas por sistema de rotación | Algoritmo apropiado (O(n) por cara) |
| Cycle detection | EXISTE | Correcto en planos simples |
| Polygon validation | EXISTE | |
| Room generation | EXISTE como **sugerencia derivada** en cada `reload()` | Bueno para ver; malo como fuente de verdad |
| Persistencia de recintos | **Solo el mayor** (`rooms[0]`) se escribe en el Room del espacio | `EditorController.ts:1343` |
| Relaciones muro↔muro | AUSENTE como dato | Se infieren por proximidad (5 cm) |
| Particiones | EXISTE: `isStructural=false` conecta pero no cierra | Buena idea portada de LevON |
| Consistencia tras editar | **FRÁGIL**: mover o medir un muro abre esquinas y el recinto desaparece o cambia | `EditorController.ts:893-909,1413` |

**¿Adecuada para crecer?** **No tal como está.** Una plataforma BIM necesita:
- Un **grafo persistente** de uniones, donde mover un nodo mueve todos los muros que lo comparten.
- **Recintos con identidad estable**: hoy un recinto no tiene id propio entre recargas, así que no puede llevar nombre, uso, acabados ni avance de forma confiable.

El algoritmo actual sirve como **detector**, no como **modelo**.

**Nota de topología: 4,0/10.**

---

# CAPÍTULO 13 — RENDIMIENTO

| Área | Estado | Evidencia |
|---|---|---|
| Render de planta | Bueno: Picture de Skia; cámara en hilo UI; regrabación solo si el zoom deriva ×1,5 | `docs/17`, `PlanCanvas.tsx` |
| Arrastre en vivo | Bueno: capa viva aislada | `liveOverlay.ts` |
| Coste por edición | O(n objetos) en relectura + 1–2 detecciones topológicas + **lectura de todos los BLOB de fotos** | `EditorController.ts:571-588`, `ObjectStore.ts:386-392,430-432` |
| Memoria | **Riesgo alto**: `listPhotoMarkers` hace `SELECT *` con la columna `foto` para quedarse solo con el marcador | idem |
| Proyectos grandes (500+ muros, 100+ fotos) | **NO VERIFICADA**: no hay benchmark ni prueba en dispositivo | — |
| Exportación | Strings concatenados en memoria; aceptable para un espacio | `step-writer.ts` |
| Hardware limitado | NO VERIFICADA | Solo se probó en un teléfono |
| Batería | Sin GPS continuo salvo al promediar; BLE apagado; correcto | — |
| Arranque | Backup completo de la BD **en cada arranque**: con BLOB grandes se vuelve costoso (copia + `integrity_check`) | `App.tsx` (initDatabase), `ExpoBackupDatabaseUseCase.ts` |

**Nota: 5,0/10.** El lienzo es de buena calidad; la capa de datos tiene dos patrones que escalarán mal (fotos en BLOB leídas siempre y backup completo al arrancar).

---

# CAPÍTULO 14 — ROBUSTEZ Y MANEJO DE ERRORES

| Escenario | Comportamiento | Estado |
|---|---|---|
| Cierre forzado a mitad de edición | Lo persistido sobrevive (escritura inmediata y transacciones) | EXISTE (`test/integration/CrashRecovery.test.ts`, en Node) |
| Transacción fallida | Rollback correcto | EXISTE |
| Fila JSON corrupta | Excepción al listar → espacio inabrible | FRÁGIL |
| Error de exportación | `ValidationError` con mensajes; gate de 8 criterios | EXISTE |
| Fallo de backup | No bloquea; solo `console.warn` | PARCIAL (el usuario no se entera) |
| Fallo de adopción de huérfanos | No bloquea | EXISTE |
| Permisos negados | Se piden luego por función | PARCIAL |
| Operación parcial UI+BD | `reload()` tras todo, así que la UI converge a la BD | EXISTE |
| Restauración | Exige reiniciar; fallback manual | EXISTE |
| Registro de errores en campo | **AUSENTE**: sin archivo de log ni crash reporting; los errores en el teléfono de un usuario son invisibles | — |

**Nota: 5,0/10.**

---

# CAPÍTULO 15 — OFFLINE-FIRST / LOCAL-FIRST

| Criterio | Respuesta | Evidencia |
|---|---|---|
| ¿Online-first? | No | Sin red |
| ¿Offline-capable? | **Sí, totalmente** | SQLite local; proj4 embebido |
| ¿Offline-first? | **Sí por construcción, no por diseño de sincronización** | No existe la parte "online" |
| ¿Local-first (en el sentido de Kleppmann)? | **No.** Local-first exige colaboración, sincronización y propiedad de datos **portables**; aquí no hay sync, ni CRDT/log, ni export de proyecto | — |
| Sincronización / conflictos / reconexión / datos pendientes | AUSENTE | — |
| Integridad local | Buena (transacciones, WAL, `integrity_check` en backup) | — |

**Clasificación: "local-only".** Para obra es una ventaja real: funciona en sótanos, zonas rurales y sin datos. El precio es que **el teléfono es punto único de fallo y de almacenamiento**, y el trabajo no llega a la oficina salvo como archivos IFC/DXF sueltos.

**Nota: 6,0/10** (offline sí; first-class data ownership no).

---

# CAPÍTULO 16 — TESTING Y QA

| Tipo | Estado | Evidencia |
|---|---|---|
| Unitarios de dominio y geometría | **Fuerte** | `test/geometry`, `test/topology`, `test/domain` |
| Controladores | Fuerte | `test/editor/EditorController.test.ts`, `test/elevation` |
| Persistencia | Media: sobre **sqlite3 de Node**, no expo-sqlite | `test/sqlite`, `test/__mocks__/expo-sqlite.ts` |
| Exportación IFC | Media: lint STEP propio y aserciones; **sin validación con IfcOpenShell ni buildingSMART** | `test/ifc/stepLint.ts`, `IFCRevitExport.test.ts` |
| Exportación DXF | Media: estructura AC1015 | `test/export/DXFSerializer.test.ts` |
| Integración / recuperación | Existe (Node) | `test/integration/*` |
| Escenarios de campo | 8 casos | `test/field/FieldScenarios.test.ts` |
| UI / render | **AUSENTE**, salvo funciones puras del renderer | `test/ui/planRenderer.test.ts` |
| E2E (Detox/Maestro) | **AUSENTE** | — |
| En dispositivo automatizado | AUSENTE (manual por adb en sesiones) | `docs/17` |
| Regresión en CI | **AUSENTE** (no hay CI) | — |
| Rendimiento | AUSENTE | — |
| Higiene | Aviso de worker que no termina (handles abiertos) | salida de jest |

**Madurez:** buena base unitaria (ratio test/código ≈ 0,47) y **nula** en los niveles que encuentran los fallos reales de campo: UI, dispositivo, archivos importados en Revit o AutoCAD y volumen.

**Nota: 6,0/10.**

---

# CAPÍTULO 17 — SEGURIDAD

| Vector | Estado | Riesgo |
|---|---|---|
| Superficie de red | Mínima (solo OTA) | Bajo |
| OTA (`expo-updates`) sin política de canal/firma propia | Configurado | Medio: un publish erróneo llega a todos los dispositivos |
| Cifrado de la BD | AUSENTE | Medio: fotos geolocalizadas de inmuebles de clientes en claro |
| Backups | En claro, en el sandbox | Medio |
| Exportaciones | SAF a la carpeta que elija el usuario | Bajo |
| Credenciales / secretos | No hay en el repo (el `projectId` de EAS es público por diseño) | Bajo |
| Autenticación | AUSENTE: "operador" = nombre libre; **no hay no-repudio** en fotos ni mediciones | Alto para el uso legal de evidencias |
| Permisos | Excesivos/obsoletos: `READ/WRITE_EXTERNAL_STORAGE`, `BLUETOOTH(_ADMIN)`, `INTERNET`, `locationAlwaysAndWhenInUse` en el plugin | Medio (rechazo en revisión de Play, desconfianza) |
| Inputs | Validación parcial; `JSON.parse` sin protección | Bajo/medio |
| Dependencias | Sin `npm audit` en CI; SDK envejecido | Medio |
| Privacidad | GPS en metadatos de fotos y mojones; sin política declarada | Medio |

**Nota: 4,0/10.** El riesgo es bajo porque no hay red, no porque haya controles.

---

# CAPÍTULO 18 — ESCALABILIDAD

| Eje | ¿El crecimiento aumenta o reduce la complejidad? | Motivo |
|---|---|---|
| Código | **La aumenta** | Cada herramienta nueva entra al `EditorController` y a `SurveyScreen` |
| Arquitectura | Neutra | Las capas aguantan; el centro no |
| Módulos | Aumenta | No hay registro de tipos de elemento: cada tipo toca CHECK de `object_type`, store, IFC, DXF, render, selección y propiedades |
| Datos | Aumenta | STI + JSON sin migraciones; nivel y fase en JSON |
| Geometría | Aumenta | Sin topología persistente, cada herramienta (Suelo, Avance por recinto) heredará la inestabilidad de los recintos |
| Funcionalidades | Aumenta | 39 herramientas pendientes sobre la misma estructura |
| Mantenimiento | Aumenta | Upgrade de Expo/RN/Skia acumulado |
| Equipo | Aumenta | Sin CI, linter ni convenciones automáticas; el conocimiento está en comentarios-changelog y en la bóveda |

**Nota: 4,0/10.**

---

# CAPÍTULO 19 — DEVOPS Y CICLO DE RELEASE

| Rubro | Estado | Evidencia |
|---|---|---|
| Build | EAS con perfiles `development`/`preview` (APK) y `production` (AAB) | `eas.json` |
| Build local | Script `eas build --local`; **no hay JDK** en la máquina de desarrollo | `package.json`, sesión |
| Versionado | `version: 0.1.0`; sin `versionCode` gestionado ni changelog de release | `app.json` |
| Runtime version | `policy: appVersion` | `app.json` |
| CI/CD | **AUSENTE** | — |
| Lint y formato | **AUSENTE** | — |
| Logs / observabilidad | **AUSENTE** (4 `console.*`) | — |
| Debugging | Expo Go / adb manual | — |
| Reproducibilidad | `package-lock.json` presente; versiones `^` en varias dependencias | `package.json` |
| Target SDK Android | 34 (Expo 51) | Probable bloqueo de publicación en Play (verificar) |
| Firma | Gestionada por EAS (no verificada) | — |
| Ramas y PR | Disciplina buena (1 PR por fase, descripciones detalladas) | historial |

**Nota: 3,0/10.**

---

# CAPÍTULO 20 — DEUDA TÉCNICA

| Tipo | Deuda principal | Severidad |
|---|---|---|
| Arquitectónica | Topología derivada; Room con doble sentido; modelo espacio-céntrico; god controller | Crítica |
| Código | 42 `as unknown as`; comentarios-changelog; código muerto (CDT, CloseRoom); `catch {}` | Media |
| UX | Toggles ⚠️; 39 ⬜ visibles; solo vertical; tema no persistido; permisos al arrancar | Alta |
| BIM | Sin clasificación, tipos ni Psets de espacio; IfcSpace al eje; un recinto por espacio; sin MapConversion | Alta |
| Testing | Sin UI, E2E, CI ni validación IFC externa | Alta |
| Seguridad | Sin cifrado ni identidad; permisos obsoletos | Media |
| Geométrica | Cruces en X; área al eje; medida al eje; uniones | **Crítica** |
| Documental | **Sobredocumentado** en narrativa y subdocumentado en contratos (no hay especificación de formato de intercambio ni un "manual de campo") | Baja |
| Producto | 2 de 4 modos vacíos; sin salida de fotos; sin PDF; sin import | Alta |

---

# CAPÍTULO 21 — FUNCIONALIDADES EXISTENTES VS NECESARIAS

Leyenda: ✔ sí · ◐ parcial · ✘ no.

| Función | Existe | Parcial | Robusta | MVP | Producción | Prioridad |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Proyectos y espacios | ✔ | | ✔ | ✔ | ◐ | — |
| Dibujo de muros | ✔ | | ◐ | ✔ | ✘ | P1 |
| Uniones persistentes de muros | ✘ | | ✘ | **✘ bloquea** | ✘ | **P0** |
| Columnas, puertas, ventanas | ✔ | | ✔ | ✔ | ◐ | — |
| Suelos (herramienta) | ✘ | ◐ (dominio) | ✘ | ◐ | ✘ | P1 |
| Medición manual | ✔ | | ✘ (al eje) | **✘ bloquea** | ✘ | **P0** |
| Láser BLE | | ◐ | ✘ | ◐ | ✘ | P1 |
| Detección de recintos | ✔ | | ◐ | ◐ | ✘ | P0 (multi-recinto) |
| Área neta / bruta | ✘ | | | **✘ bloquea** | ✘ | **P0** |
| Niveles y fases | ✔ | | ✔ | ✔ | ✔ | — |
| Alzado y vanos | ✔ | | ✔ | ✔ | ◐ | — |
| Fotos ancladas | ✔ | | ◐ | ✔ | ✘ | — |
| Exportar fotos / informe | ✘ | | | **✘ bloquea** | ✘ | **P0** |
| Georreferencia | ✔ | | ✔ | ✔ | ◐ | — |
| IFC con MapConversion | ✘ | | | ◐ | ✘ | P1 |
| IFC por espacio | ✔ | | ◐ | ✔ | ✘ | P1 (federado por proyecto) |
| DXF por espacio | ✔ | | ✔ | ✔ | ◐ | P2 (cotas como entidades) |
| PDF de plano / informe | ✘ | | | ◐ | ✘ | P1 |
| CSV (mediciones, coordenadas) | ✘ | | | ◐ | ✘ | P1 |
| Exportar/importar proyecto | ✘ | | | **✘ bloquea** | ✘ | **P0** |
| Backup fuera del dispositivo | ✘ | ◐ (local) | | **✘ bloquea** | ✘ | **P0** |
| Migraciones de esquema | ✘ | | | **✘ bloquea** | ✘ | **P0** |
| Sincronización / multi-dispositivo | ✘ | | | ✘ (puede esperar) | ✘ | P2 |
| Avance de obra | ✘ | | | ✘ | ✘ | P2 |
| Revisión / marcas | ✘ | | | ✘ | ✘ | P2 |
| Importar IFC/DXF/CSV | ✘ | | | ✘ | ✘ | P2 |
| Crash reporting | ✘ | | | ◐ | ✘ | P1 |
| CI | ✘ | | | ◐ | ✘ | P1 |
| Horizontal / tableta | ✘ | | | ◐ | ✘ | P1 |
| Deshabilitar toggles sin función | — | | | **✘ bloquea** | | **P0** |

---

# CAPÍTULO 22 — ANÁLISIS COMO MVP

| Pregunta | Respuesta |
|---|---|
| ¿Es realmente un MVP? | **No.** Es una alpha con un núcleo sólido. Un MVP de medición debe producir medidas confiables y entregables recuperables. Hoy no garantiza ninguna de las dos. |
| ¿Qué partes son prototipo? | Medición (manual al eje; BLE sin UI); recintos (derivados, uno por espacio); modos Avance y Revisión; toggles ⚠️; arcos. |
| ¿Qué partes son funcionales? | Dibujo, edición, propiedades, niveles y fases, alzado, georreferencia, fotos ancladas, IFC/DXF por espacio, backup local. |
| ¿Qué falta? | Topología persistente; medida cara-a-cara; área neta; salida de fotos y proyecto; backup externo; migraciones. |
| ¿Qué bloquea? | Los 10 P0 de la matriz final. |
| ¿Qué puede esperar? | Sincronización, Avance, Revisión, importadores, mapa offline, plugin de Revit, iOS. |
| ¿Qué debe rehacerse? | (1) Modelo de uniones y recintos: pasar de "derivado" a "persistido con identidad". (2) Semántica de `applyMeasurementToWall`. (3) Separación contenedor/espacio (`Room`). (4) Carga de fotos (sin BLOB en listados; idealmente archivos en disco). |

---

# CAPÍTULO 23 — INGENIERÍA CIVIL

## 23.1 Utilidad para ingenieros civiles
**Baja-media.** Sirve para croquis acotados de existentes y como punto de partida de un modelo Revit. No sirve para cálculos de cantidades ni como soporte documental.

## 23.2 Compatibilidad con procesos reales
- **Se ajusta parcialmente.** Los niveles con cota, las fases (existente/demolido/nuevo) y la base/tope por nivel replican la lógica de Revit, y eso es un acierto.
- **No se ajusta** en lo esencial del proceso civil: libreta de medidas, error de cierre, control de calidad del levantamiento, cantidades de obra e informes.

## 23.3 Mediciones
- **No confiables**: aplicadas al eje, sin propagar a muros unidos, y sin registro de qué medida originó cada longitud.
- La tabla `measurements` guarda la muestra, pero el plano no conserva la cadena "medida → geometría".

## 23.4 Levantamientos
- Bien en lo topográfico: amarre por mojones con residuales y CRS oficiales.
- Mal en lo arquitectónico, porque no hay control de cierre.

## 23.5 Planos
- DXF R2000 con capas, poché y vanos.
- Sin entidades de cota, rótulo, escala de impresión ni PDF.
- El DXF es "dibujo base", no "plano".

## 23.6 Control documental
**AUSENTE.** No hay versiones, estados (borrador/revisado/aprobado), firma ni historial consultable.

## 23.7 Revisión de información
**AUSENTE** (modo Revisión ⬜).

## 23.8 Toma de decisiones
Sin reportes, cantidades ni comparativos. El usuario solo ve un dibujo.

## 23.9 Trabajo con contratistas
**AUSENTE.** Nada se comparte salvo IFC/DXF.

## 23.10 Trabajo con interventoría
**AUSENTE.** No hay evidencia exportable, ni fotos fechadas y firmadas, ni actas.

## 23.11 Coordinación interdisciplinaria
Solo vía IFC hacia Revit/Navisworks. Sin disciplinas (estructural/MEP) en el modelo.

## 23.12 Preparación de entregables
Solo IFC y DXF por espacio. Faltan:
- Plano PDF.
- Cuadro de áreas.
- Registro fotográfico.
- Cartera de coordenadas.

### Calificación
| Criterio | /10 |
|---|---:|
| Utilidad para ingeniería civil | 3,5 |
| Precisión | 2,5 |
| Productividad | 4,0 |
| Confiabilidad | 3,0 |
| Aplicabilidad | 4,0 |
| **Promedio** | **3,4** |

---

# CAPÍTULO 24 — USO REAL EN OBRA

| # | Situación | Evaluación | Nota /10 |
|---|---|---|---:|
| 24.1 | Uso en campo | Funciona sin red y el dibujo es rápido; la medición no es confiable | 4 |
| 24.2 | Uso en oficina | No hay versión de escritorio ni visor; en oficina solo llegan IFC/DXF | 2 |
| 24.3 | Tableta | **Solo vertical**; sin layout de tableta verificado | 3 |
| 24.4 | Teléfono | Diseño a una mano, pulgar y FAB: bueno | 7 |
| 24.5 | Sin internet | Total | 9 |
| 24.6 | Ambiente ruidoso | Feedback háptico y visual; no depende del sonido | 7 |
| 24.7 | Con guantes | Objetivos táctiles grandes en FAB; **el arrastre de extremos con tolerancia en px es difícil con guantes** (NO VERIFICADA) | 4 |
| 24.8 | Presión de tiempo | Trazo continuo, deshacer al pulgar; pero recintos que "desaparecen" al editar generan desconfianza | 5 |
| 24.9 | Batería limitada | Sin GPS continuo; Skia eficiente; el backup completo en cada arranque consume | 6 |
| 24.10 | Poca luz o sol directo | Existe alto contraste y oscuro; **el tema no persiste** y vuelve a claro en cada arranque | 6 |
| 24.11 | Error humano | Deshacer 100 pasos en memoria; soft-delete | 6 |
| 24.12 | Recuperación tras equivocaciones | Buena dentro de la sesión; **el historial se pierde al cerrar la app** | 5 |
| 24.13 | Facilidad de corrección | Mover un extremo rompe la esquina, así que corregir crea errores nuevos | 3 |
| 24.14 | Continuidad de trabajo | Escritura inmediata: sí; continuar en otro dispositivo: no | 4 |
| 24.15 | Fiabilidad de la información | Medidas al eje, un recinto por espacio, sin autor verificable | 2 |

**¿Un profesional podría confiar en esta app durante una jornada de obra?**
**No para producir medidas de entrega. Sí para croquis de apoyo.** En una jornada de obra, la app no pierde lo dibujado si se cierra, pero:
- produce longitudes con un error sistemático;
- no permite sacar las fotos;
- deja todo el día de trabajo en un solo teléfono sin respaldo externo.

**Nota de uso en obra: 3,0/10.**

---

# CAPÍTULO 25 — USO POR PARTE DEL RESIDENTE DE OBRA

| Tarea | Soporte | Comentario |
|---|---|---|
| Levantamiento | ◐ | Croquis rápido; medida no confiable |
| Medición | ◐ | Manual; sin cuadro de cantidades |
| Revisión | ✘ | Modo vacío |
| Seguimiento | ✘ | Avance vacío |
| Anotación | ◐ | `notes` por objeto; sin marcas en planta |
| Modificación | ◐ | Rompe uniones |
| Consulta | ◐ | Propiedades y coordenadas; sin búsqueda |
| Documentación | ◐ | Fotos ancladas **atrapadas** en el dispositivo |
| Reporte | ✘ | Sin PDF ni CSV |
| Coordinación | ✘ | Sin compartir |
| Entrega | ◐ | IFC y DXF por espacio |

| Criterio | ¿Lo logra? |
|---|---|
| 1. Ahorra tiempo | Poco: el croquis sí; el informe sigue siendo manual |
| 2. Reduce doble digitación | **Parcial**: la geometría pasa a Revit sin redibujar; las fotos, medidas y notas no |
| 3. Reduce errores | **No**: introduce un error sistemático en las medidas |
| 4. Mejora trazabilidad | Parcial: fotos con GPS y código, sin autor verificable ni exportación |
| 5. Mejora documentación | Parcial (solo dentro de la app) |
| 6. Facilita coordinación | No |
| 7. Elimina procesos repetitivos | No todavía |

**Nota para residente: 2,5/10.**

---

# CAPÍTULO 26 — FLUJO CAMPO → OFICINA → CAMPO

| Etapa | Estado | Qué ocurre hoy |
|---|---|---|
| 26.1 Captura en campo | ◐ | Muros, vanos, fotos y GPS: sí. Medida confiable: no. |
| 26.2 Transferencia | ✘/◐ | **Solo** IFC y DXF, uno por espacio, guardados con SAF (p. ej. en Drive). Fotos, mediciones, notas, mojones y proyecto: **no se transfieren**. |
| 26.3 Continuidad del dato | ◐ | GUID estable: Revit reconoce el mismo muro al reimportar (bueno). Notas y fotos se pierden en el camino. |
| 26.4 Modificación en oficina | ✘ | Se modifica en Revit/AutoCAD; **nada vuelve** a la app. |
| 26.5 Sincronización | ✘ | Inexistente. |
| 26.6 Exportación | ◐ | IFC4 y DXF R2000; sin PDF, CSV ni paquete de proyecto. |
| 26.7 Reutilización | ◐ | Mojones reutilizables entre proyectos (biblioteca); lo demás no. |
| 26.8 Regreso al campo | ✘ | Sin importación: el plano corregido en oficina no puede llevarse a obra en la app. |
| 26.9 Trazabilidad | ◐ | Ids estables; sin autor, versión ni bitácora. |
| 26.10 Riesgo de pérdida | **Alto** | Un solo dispositivo y backups en el mismo dispositivo. |

**Pasos manuales eliminados (estimación cualitativa):**

| Paso manual del flujo tradicional | ¿Eliminado? |
|---|---|
| Pasar el croquis a CAD/Revit | **Sí** (geometría base) |
| Crear niveles en Revit | **Sí** (pisos por nivel en el IFC) |
| Asignar base/tope de muros | Parcial (Pset propio; Revit no lo aplica sin un plugin que **no existe**) |
| Transcribir medidas de libreta | No: la medida no queda ligada al dibujo de forma confiable |
| Organizar el registro fotográfico | No: fotos atrapadas |
| Elaborar el cuadro de áreas | No (área al eje y un recinto por espacio) |
| Georreferenciar el modelo en Revit | No: falta `IfcMapConversion` |
| Redactar el informe | No |

**Pregunta crítica: ¿reduce el ciclo o solo digitaliza una parte?**
**Hoy digitaliza una parte**: la geometría de planta y los niveles. Elimina con seguridad **2 pasos** del ciclo y deja sin resolver los otros 6. No hay ciclo, porque no hay regreso.

**Nota campo-oficina: 2,0/10.**

---

# CAPÍTULO 27 — PRODUCTIVIDAD PROFESIONAL

| Rubro | Impacto actual | Impacto potencial (con P0/P1 resueltos) |
|---|---|---|
| Tareas eliminadas | Bajo | Alto |
| Tareas automatizadas (niveles, recintos, IFC) | Medio | Alto |
| Doble digitación eliminada (geometría) | Medio | Muy alto |
| Doble digitación eliminada (fotos/notas/medidas) | Nulo | Alto |
| Tiempo de modelado en Revit | Medio (muros y vanos llegan, pero como IFC importado) | Muy alto (con un plugin nativo) |
| Errores evitados | **Negativo** (introduce error sistemático en medidas) | Alto (con medida cara-a-cara y control de cierre) |
| Transferencias manuales reducidas | Bajo | Alto |

No se dan cifras: no hay mediciones de tiempo con usuarios.

---

# CAPÍTULO 28 — METODOLOGÍA BIM

| # | Pregunta | Evaluación |
|---|---|---|
| 28.1 | ¿Hay estrategia BIM? | **Implícita**, orientada a Revit (nombres `Revit*`, Pset `PolyLive_RevitConstraints`). No hay estrategia OpenBIM: ni EIR/BEP, ni LOD/LOI, ni IDS, ni clasificación. |
| 28.2 | Estructuración | Media: proyecto → espacio → objetos; niveles y fases de proyecto. Falta edificio/sitio como entidades propias y zonas. |
| 28.3 | Objetos BIM | 6 tipos (Wall, Door, Window, Column, Floor, Room). Sin tipos (familias/tipos de muro), solo instancias. |
| 28.4 | Información geométrica | 2D + extrusión vertical por restricciones; perfil trapezoidal; vanos en coordenadas locales. Correcta para LOD 200 de existentes. |
| 28.5 | Información no geométrica | Pobre: material como texto libre, notas, portante, fase. |
| 28.6 | Identificación | Id interno y GUID IFC estable derivado: **buena práctica**. Código BIM por proyecto, espacio y foto (`BIM001`, `FOT001`). |
| 28.7 | Clasificación | **AUSENTE.** |
| 28.8 | Propiedades | `Pset_WallCommon.LoadBearing`, `Pset_ColumnCommon`, `Qto_WallBaseQuantities` y Pset propio. Sin Psets de espacio, puerta o ventana más allá del mínimo (NO VERIFICADA en detalle). |
| 28.9 | Relaciones | Contención en piso, agregación, vacíos y rellenos, material. **Faltan** `IfcRelSpaceBoundary`, conectividad de muros (`IfcRelConnectsPathElements`) y asociación de documentos/fotos (`IfcRelAssociatesDocument`). |
| 28.10 | Geometría | Extrusiones correctas; arcos exportados rectos; IfcSpace al eje (se solapa con los muros). |
| 28.11 | Semántica | Muro portante vs partición: bien. Recinto: débil (uno por espacio). |
| 28.12 | Trazabilidad | GUID estable; sin autoría verificable ni versión. |
| 28.13 | Versionado | AUSENTE. |
| 28.14 | Coordinación | Solo vía archivo. |
| 28.15 | Interoperabilidad | IFC4/DXF de salida; sin entrada. |
| 28.16 | Continuidad de información | Rota para fotos, medidas y notas; parcial para geometría. |

**Veredicto: BIM-aware, no BIM-ready.**
- Piensa en objetos, niveles, fases y GUIDs, y eso la sitúa por encima de "solo exporta formatos".
- No gestiona información BIM: sin clasificación, tipos, relaciones de espacio, georreferencia en el IFC ni intercambio de vuelta.

**Notas:** BIM 4,0 · Metodología 3,0.

---

# CAPÍTULO 29 — EXTENSIÓN Y MODULARIZACIÓN BIM

| Elemento a incorporar | Facilidad | Qué hay que tocar hoy |
|---|---|---|
| Muros (mejoras) | Media | Controlador + topología |
| Pisos (Suelo) | Media-alta | Dominio ya existe; falta herramienta; **depende de recintos estables** |
| Puertas / ventanas | Alta | Patrón de anfitrión ya resuelto |
| Columnas | Alta | Existe |
| Vigas | Media | Nuevo tipo: CHECK SQL de `object_type`, store, IFC, DXF, render, selección, propiedades |
| Cubiertas | Baja | Requiere geometría 3D inclinada; el modelo es 2D + extrusión |
| Instalaciones (MEP) | Baja | Sin redes ni conectores |
| Mobiliario | Media | Requiere biblioteca de bloques/familias |
| Topografía | Alta | Módulo geo bien separado |
| Cuantificación | Media | Qto parcial; falta área neta |
| Información de activos | Media | Propiedades libres en JSON (sin esquema) |
| Documentación | Baja | Sin PDF ni plantillas |
| Control de cambios | Baja | Sin versionado ni log |

| Pregunta | Respuesta |
|---|---|
| 29.1 Modularidad actual | Por capas sí; **por tipo de elemento no**: no hay registro de tipos ni plugins |
| 29.2 Extensibilidad | Media-baja: cada tipo nuevo toca unos 8 sitios |
| 29.3 Reutilización | Alta en dominio (geometría, vertical, geo) |
| 29.4 Plugins futuros | No hay punto de extensión |
| 29.5 Orientación a objetos técnicos | Sí (clases de dominio), con herencia de una base nombrada por Revit |
| 29.6 Nuevas disciplinas | Difícil: el CHECK de tipos y la STI lo frenan |
| 29.7 Nuevas propiedades | Fácil pero sin esquema (`[key: string]: unknown`) |
| 29.8 Ecosistema BIM | Posible solo tras: registro de tipos, topología persistente, migraciones y formato de proyecto abierto |

**¿Puede evolucionar de app de medición a plataforma BIM modular?** **Sí, pero no por acumulación.** Hacen falta 3 refactors estructurales antes de la segunda ola de herramientas:
1. Registro de tipos de elemento.
2. Grafo persistente de uniones y recintos.
3. Esquema versionado.

Si se agregan las 39 herramientas ⬜ sobre la estructura actual, el costo marginal crecerá con cada una.

**Nota de modularidad BIM: 4,5/10.**

---

# CAPÍTULO 30 — INTEGRACIÓN CON REVIT

| # | Tema | Análisis |
|---|---|---|
| 30.1 | LevON → Revit | Muros (eje, espesor, altura, portante), columnas, puertas y ventanas con vano, losa, espacio, niveles como `IfcBuildingStorey` y fases y restricciones como Pset. |
| 30.2 | Revit → LevON | **Nada.** Sin importador. Potencial: niveles, rejillas, muros existentes como calco, habitaciones y fases. |
| 30.3 | Geometría transferible | Extrusiones prismáticas y trapezoidales: buena. Arcos: no (salen rectos). |
| 30.4 | Información paramétrica | **Clave y desaprovechada.** Base/tope por nivel, offsets y altura desconectada están en el Pset `PolyLive_RevitConstraints`, pero el importador IFC de Revit **no los aplica** a muros nativos. El código menciona "el plugin de Revit que lee el Pset" (`IFCSerializer.ts:52`) y **ese plugin no existe en el repositorio**. |
| 30.5 | Metadatos | Nombre, material (texto), portante y fase como texto. |
| 30.6 | Elementos constructivos | 6 tipos. |
| 30.7 | Coordenadas | Locales (0,0,0). **Sin `IfcMapConversion`/`IfcProjectedCRS`**, así que Revit no puede usar coordenadas compartidas, aunque la app ya tiene la georreferencia calculada. |
| 30.8 | Unidades | SI metros en `IfcUnitAssignment`: correcto. |
| 30.9 | Niveles | Un `IfcBuildingStorey` por nivel: correcto, y Revit crea niveles al abrir. |
| 30.10 | Habitaciones | `IfcSpace` **al eje** y **uno por espacio**: Revit recibirá un espacio que se solapa con los muros y no las habitaciones reales. |
| 30.11 | Familias | Ninguna correspondencia de tipos: puertas y ventanas llegan como geometría genérica. |
| 30.12 | Modelos | Un archivo por espacio, cada uno con su `IfcProject` (misma GUID estable por proyecto, `IFCSerializer.ts:114`). Para un edificio de 10 espacios hay 10 vínculos. |
| 30.13 | Vinculación | GUID estable: re-vincular actualiza en lugar de duplicar. **Buena base.** |
| 30.14 | Automatización | Ninguna. |
| 30.15 | Conectores posibles | (a) Add-in de Revit (C#, Revit API) que lea el IFC o un JSON propio y cree **muros, puertas y habitaciones nativas** con restricciones. (b) Script de Dynamo/pyRevit como paso intermedio. (c) Autodesk Platform Services para el flujo en la nube. |
| 30.16 | Flujo LevON → Revit | Hoy: Abrir/Vincular IFC, que da elementos IFC con edición limitada. Con plugin: elementos nativos parametrizados. |
| 30.17 | Flujo Revit → LevON | Inexistente. Sería valioso: llevar a obra los niveles, ejes y el modelo de diseño como calco para verificar lo construido. |
| 30.18 | Bidireccional | Requiere identidad estable (ya existe vía GUID) + importador + resolución de cambios. Lejano. |

### Productividad en Revit (impacto conceptual)
| Rubro | Hoy | Con plugin nativo + MapConversion |
|---|---|---|
| Modelado manual de muros | Medio | **Muy alto** |
| Dibujo repetitivo | Medio | Alto |
| Medición | Bajo (medidas no confiables) | Alto |
| Digitación | Bajo | Alto |
| Reconstrucción de planos | Medio | Muy alto |
| Captura de geometría | Medio | Alto |
| Levantamiento | Medio | Alto |
| Preparación de información | Bajo | Alto |
| **Global** | **Medio** | **Transformacional** para levantamiento de existentes, si la medida es confiable |

**Nota Revit: 3,5/10.**

---

# CAPÍTULO 31 — IFC Y OPENBIM

| # | Tema | Estado | Evidencia / comentario |
|---|---|---|---|
| 31.1 | Modelo de datos | Coherente: Project → Site → Building → Storeys → elementos | `IFCSerializer.ts:120-140` |
| 31.2 | Entidades | IfcWall/IfcWallStandardCase, IfcColumn, IfcDoor, IfcWindow, IfcOpeningElement, IfcSlab, IfcSpace | grep de entidades |
| 31.3 | Relaciones | Aggregates, ContainedInSpatialStructure, VoidsElement, FillsElement, AssociatesMaterial, DefinesByProperties | Faltan SpaceBoundary y ConnectsPathElements |
| 31.4 | Geometría | SweptSolid (extrusión) + eje; perfil arbitrario para trapecio | Correcto; `IfcWallStandardCase` está **deprecado en IFC4** (válido, desaconsejado) |
| 31.5 | Propiedades | Pset_WallCommon, Pset_ColumnCommon, Qto_WallBaseQuantities, Pset propio | Pset propio no estándar |
| 31.6 | Identidad | Estable por objeto | `guid-generator.ts` |
| 31.7 | GUID | Compresión buildingSMART correcta (bug histórico corregido) | `guid-generator.ts:33-38` |
| 31.8 | Unidades | SI | `IFCSIUNIT` |
| 31.9 | Coordenadas | Locales; **sin MapConversion** | `compatibility-gate.ts:14` (pendiente) |
| 31.10 | Relaciones espaciales | Espacio agregado al piso; elementos contenidos en piso | Espacio único y al eje |
| 31.11 | Info no geométrica | Mínima | — |
| 31.12 | Exportación | IFC4 STEP, por espacio, gate de 8 criterios | `compatibility-gate.ts` |
| 31.13 | Importación | **AUSENTE** | — |
| 31.14 | Fidelidad | Alta en lo que exporta; baja en cobertura (arcos, espacios múltiples, georreferencia) | — |
| 31.15 | Interoperabilidad | **NO VERIFICADA** contra validador buildingSMART, IfcOpenShell o apertura en Revit/BIMcollab dentro del pipeline | Solo lint STEP propio |
| 31.16 | Limitaciones | Sin MVD declarado (Reference View / Design Transfer View), sin IDS, sin clasificación, sin documentos | — |

**¿Qué tan serio es el soporte IFC?** **Serio en lo formal y limitado en lo semántico.**
- Detrás hay una estructura coherente: no es un volcado de triángulos, hay entidades, relaciones y GUIDs correctos.
- Le faltan cuatro piezas que un BIM Manager exigiría:
  1. Georreferencia.
  2. Espacios correctos (múltiples, a cara interior, con límites).
  3. Validación externa automatizada.
  4. Un MVD declarado.

**Notas:** IFC 4,5 · OpenBIM 3,0.

---

# CAPÍTULO 32 — MULTIFORMATO E INTERCAMBIO DE INFORMACIÓN

| Formato | Import | Export | Fidelidad | Metadatos | Geometría |
|---|:---:|:---:|---|---|---|
| IFC4 | ✘ | ✔ (por espacio) | Alta, con huecos (arcos, espacio) | Parcial | Buena |
| DXF R2000 | ✘ | ✔ (por espacio) | Alta para dibujo | Solo capas y texto | Buena (2D) |
| JSON (proyecto) | ✘ | ✘ | — | — | — |
| CSV (medidas, coordenadas, áreas) | ✘ | ✘ | — | — | — |
| PDF (plano, informe) | ✘ | ✘ | — | — | — |
| Imágenes (fotos, captura del plano) | ✘ | ✘ | — | — | — |
| KML / GeoJSON | ✘ | ✘ | — | — | — |
| Formatos de estación total (CSV/TXT, LandXML) | ✘ | ✘ | — | — | — |
| BCF (revisión) | ✘ | ✘ | — | — | — |
| E57 / nubes | ✘ | ✘ | — | — | — |

| Pregunta | Respuesta |
|---|---|
| 32.1 Importación | Ninguna |
| 32.2 Exportación | 2 formatos de texto |
| 32.3 Conversión | No hay modelo intermedio de intercambio: cada serializador lee el dominio directamente |
| 32.4 Fidelidad | Buena en lo que cubre |
| 32.5 Pérdida de información | Fotos, notas, medidas, mojones, georreferencia y recintos secundarios se pierden al salir |
| 32.6 Metadatos | Preservación baja |
| 32.7 Geometría | Media-alta (rectos sí, arcos no) |
| 32.8 Compatibilidad futura | Riesgo: sin versión de formato propio ni de esquema |
| 32.9 Arquitectura de importadores/exportadores | Dos clases independientes (`IFCSerializer`, `DXFSerializer`) llamadas desde `exportActions.ts`. Sin interfaz común ni registro. `saveToUserFolder` solo admite **texto**, así que exportar binarios (PDF, imágenes, ZIP) exige ampliarlo. |
| 32.10 Modularidad de formatos | Baja |

**¿Se pueden agregar formatos sin tocar el núcleo?** **Exportadores de texto: sí, con poco costo** (el dominio es legible). **Importadores: no.** Requieren creación masiva de objetos sin comandos, resolución de ids, migración de unidades y topología, y nada de eso existe.

**Nota multiformato: 2,0/10.**

---

# CAPÍTULO 33 — INTEROPERABILIDAD TOTAL

```
LevON ──IFC4(por espacio)──► Revit (Abrir/Vincular: elementos IFC, sin restricciones aplicadas)
LevON ──DXF R2000─────────► AutoCAD (líneas y capas, sin cotas como entidad)
LevON ◄───────────── nada ── Revit / AutoCAD / IFC / CSV
LevON ──(fotos, notas, medidas, mojones)──► ✘ se quedan en el teléfono
```

| Punto de ruptura | Dónde | Severidad |
|---|---|---|
| Restricciones de base/tope | Revit ignora el Pset propio | Alta |
| Coordenadas compartidas | Sin MapConversion | Alta |
| Espacios y habitaciones | Uno, al eje | Alta |
| Familias de puertas y ventanas | Sin correspondencia de tipos | Media |
| Arcos | Exportados rectos | Media (hoy no se crean) |
| Evidencia fotográfica | No sale | **Crítica** para interventoría |
| Regreso del modelo corregido | Sin import | Alta |
| Federación de varios espacios | N archivos con N `IfcProject` | Media |

**Nota de interoperabilidad: 3,0/10.**

---

# CAPÍTULO 34 — COMPARACIÓN CON SOFTWARE EXISTENTE

> Comparación **conceptual**. Las capacidades de terceros se describen por categoría general y **no se verificaron** en esta auditoría.

| Producto | Fuerte en | Frente a LevON hoy | Dónde LevON podría ganar |
|---|---|---|---|
| Bosch MeasureOn | Medición láser integrada al croquis | LevON: **sin láser integrado**, medida al eje | Niveles/fases tipo Revit, IFC con GUID estable |
| magicplan | Planos de existentes en móvil (cámara/LiDAR, láser), informes y estimaciones | Muy por detrás en captura, informes y madurez | Alzado por muro y restricciones verticales; georreferencia oficial colombiana |
| Polycam / Canvas | Escaneo LiDAR/fotogrametría a malla o planos; Canvas, escaneo a CAD/BIM | No compite en captura 3D | Semántica BIM editable en sitio, sin nube |
| AutoCAD / AutoCAD Mobile | DWG completo, cotas, impresión | LevON es más rápido para croquis BIM; muy inferior como CAD | Objetos semánticos, no líneas |
| Autodesk Revit | Modelado BIM completo | No compite: lo **alimenta** | Captura en campo |
| Autodesk Build / ACC | Planos, issues, RFIs, fotos y nube colaborativa | LevON no tiene nube, issues ni colaboración | Offline total y modelado en sitio |
| Bluebeam | PDF markup, cantidades, sesiones | LevON no tiene PDF ni marcas | Geometría BIM nativa |
| SketchUp | Modelado 3D rápido | No compite | IFC con niveles y fases |

| Eje | Posición de LevON |
|---|---|
| Arquitectura | Limpia, local, sin nube (ventaja de simplicidad, desventaja de colaboración) |
| Workflow | Incompleto (sin regreso) |
| Productividad | Inferior a magicplan/MeasureOn en captura |
| Medición | Inferior (sin láser y con error de semántica) |
| Dibujo | Bueno en móvil |
| BIM | **Superior** a las apps de croquis en semántica vertical y GUIDs |
| Offline | Superior a las de nube |
| Exportación | Inferior en cobertura (sin PDF ni imágenes) |
| UX | Buena en el lienzo; dañada por funciones fantasma |
| Madurez | Muy inferior |

**Nota de competitividad: 2,5/10.**

---

# CAPÍTULO 35 — DIFERENCIACIÓN COMPETITIVA

| # | Tema | Contenido |
|---|---|---|
| 35.1 | Ventajas reales | (1) Niveles, fases y restricciones de base/tope por extremo de muro; (2) alzado por muro con vanos en coordenadas locales; (3) IFC4 con pisos por nivel y GUID estable; (4) georreferencia MAGNA-SIRGAS con ajuste por mojones; (5) 100 % offline. |
| 35.2 | Ventajas potenciales | Plugin Revit que cree muros nativos con restricciones; avance de obra pintado sobre caras de muro y suelos con cantidades; replanteo GPS; especialización en Colombia/LatAm (IGAC, normativa local). |
| 35.3 | Commodities | Dibujo de muros, fotos, exportar DXF, modo oscuro. |
| 35.4 | Fácilmente copiables | Tema por modo, FAB, UX a una mano. |
| 35.5 | Barreras técnicas | Motor de restricciones verticales; escritor IFC propio bien formado; transformaciones geodésicas con residuales. Son meses de trabajo, no años. |
| 35.6 | Ventajas sostenibles posibles | **Flujo "existente → Revit nativo" con datos de obra** (avance y revisión) ligados por GUID a la misma pieza; conocimiento de mercado local. |
| 35.7 | Riesgo competitivo | **Alto.** Los líderes ya cubren la captura con láser/LiDAR, informes y nube; si uno de ellos añade restricciones de nivel a su IFC, la ventaja principal se reduce. |

**Nota de diferenciación: 4,5/10.**

---

# CAPÍTULO 36 — ANÁLISIS POR PERFIL PROFESIONAL

| Perfil | Utilidad | Problemas | Ventajas | Limitaciones | Falta | /10 |
|---|---|---|---|---|---|---:|
| Ingeniero civil | Croquis BIM de existentes | Medidas no confiables | Niveles, georreferencia | Sin cantidades ni informes | Medida cara-a-cara, cuadro de áreas, PDF | 3,5 |
| Residente | Baja | Fotos atrapadas, sin reportes | Offline | Sin avance ni revisión | PDF, fotos, M3/M4 | 2,5 |
| Supervisor | Baja | Sin revisión ni marcas | Fotos ancladas | Sin estados ni autor | Revisión, BCF/PDF | 2,0 |
| Interventor | Muy baja | Sin evidencia exportable ni firma | GPS en fotos | Sin no-repudio | Informe firmado, export de fotos | 1,5 |
| Arquitecto | Media | Recinto único, área al eje | Fases, alzados, DXF | Sin cotas ni plano | Áreas netas, PDF, varias habitaciones | 4,0 |
| Dibujante | Media | DXF sin cotas ni rótulo | Capas correctas | Sin bloques | Cotas DXF, plantillas | 4,0 |
| BIM Modeler | Media | IFC no nativo en Revit | GUID estable, niveles | Restricciones no aplicadas | Plugin Revit | 4,0 |
| BIM Coordinator | Baja | Sin georreferencia IFC; N archivos | Estructura IFC correcta | Sin validación ni MVD | MapConversion, federado, IDS | 3,0 |
| BIM Manager | Baja | Sin clasificación ni estándares | Disciplina de GUID | Sin EIR/LOI | Clasificación, Psets, IDS | 2,5 |
| Topógrafo | Media | Sin import/export de coordenadas | CRS oficiales, mínimos cuadrados, residuales | Sin CSV, KML ni estación total | M2b | 4,5 |
| Contratista | Baja | Nada que compartir | Rápido en sitio | Sin cantidades | Cantidades, PDF | 2,0 |
| Profesional de oficina | Baja | Nada vuelve a la app | Recibe IFC/DXF | Sin visor de escritorio | Import, paquete de proyecto | 2,5 |
| Profesional de campo | Media | Riesgo de pérdida, medida | Una mano, offline | Solo vertical | Backup externo, horizontal | 4,0 |

---

# CAPÍTULO 37 — MATRIZ DE RIESGOS

Escalas: Sev = severidad (Crítica/Alta/Media/Baja); Prob = probabilidad (Alta/Media/Baja).

| ID | Riesgo | Categoría | Sev | Prob | Impacto | Evidencia | Bloquea MVP | Bloquea Prod. |
|---|---|---|---|---|---|---|:---:|:---:|
| R01 | Pérdida total por robo, rotura o desinstalación | Datos | Crítica | Alta | Jornadas perdidas | `ExpoBackupDatabaseUseCase.ts:55` | Sí | Sí |
| R02 | Medida aplicada al eje: error de 1 espesor | Geometría | Crítica | Alta | Planos erróneos entregados | `EditorController.ts:1427` | Sí | Sí |
| R03 | Editar un muro desconecta la esquina | Topología | Alta | Alta | Recintos desaparecen | `EditorController.ts:893-909` | Sí | Sí |
| R04 | Solo el recinto mayor se persiste y exporta | BIM | Alta | Alta | Revit recibe 1 espacio | `EditorController.ts:1343` | Sí | Sí |
| R05 | Área al eje presentada como área | Ingeniería | Alta | Alta | Cantidades infladas | `DetectRoomsUseCase.ts` | Sí | Sí |
| R06 | Sin migraciones de esquema | Persistencia | Crítica | Alta (al primer cambio) | Corrupción o pérdida en la actualización | `database.ts:81` | Sí | Sí |
| R07 | BLOB de fotos leídos en cada edición | Rendimiento | Alta | Alta | OOM / lag | `ObjectStore.ts:389,431` | Sí | Sí |
| R08 | Fotos no exportables | Producto | Crítica | Alta | Evidencia inutilizable | grep share/export | Sí | Sí |
| R09 | Toggles que no hacen nada | UX | Media | Alta | Desconfianza | `docs/18` §3 | Sí | Sí |
| R10 | Target SDK 34 frente a la política de Play | Release | Alta | Alta | No publicable | Expo 51 | No (APK interno) | Sí |
| R11 | Sin crash reporting | Observabilidad | Alta | Alta | Fallos invisibles | grep | No | Sí |
| R12 | Sin CI | Proceso | Media | Alta | Regresiones | sin `.github` | No | Sí |
| R13 | `JSON.parse` sin protección | Robustez | Media | Baja | Espacio inabrible | `ObjectStore.ts:626` | No | Sí |
| R14 | Backup completo en cada arranque | Rendimiento | Media | Media | Arranque lento, almacenamiento | `App.tsx` | No | Sí |
| R15 | BD crece sin purga (soft-delete + BLOB) | Almacenamiento | Media | Alta | Teléfono lleno | `schema.ts` | No | Sí |
| R16 | IDs no UUID | Datos | Media | Baja→Alta con sync | Colisiones | `base.ts:169` | No | Sí |
| R17 | Sin FK reales | Integridad | Media | Media | Huérfanos | `schema.ts` | No | Sí |
| R18 | God controller | Mantenibilidad | Alta | Alta | Costo marginal creciente | 1.621 l. | No | Sí |
| R19 | Undo perdido al reiniciar | UX | Baja | Alta | Frustración | `CommandStack.ts` | No | No |
| R20 | Carreras entre `reload()` concurrentes | Estado | Media | Media | Estado inconsistente | `EditorController.ts:569` | No | Sí |
| R21 | Escritura dentro de `reload()` | Estado | Media | Media | Bucles o carreras | `EditorController.ts:585` | No | Sí |
| R22 | Cruces en X sin resolver | Geometría | Media | Media | Recintos no detectados | `TopologyGraph.ts:289` | No | Sí |
| R23 | Arcos exportados rectos | Interop | Baja | Baja | Geometría falsa | `IFCSerializer.ts:200-222` | No | No |
| R24 | IfcSpace solapado con muros | BIM | Media | Alta | Errores en Revit/coordinación | `IFCSerializer.ts:151-159` | No | Sí |
| R25 | Sin MapConversion | BIM | Alta | Alta | Sin coordenadas compartidas | `compatibility-gate.ts:14` | No | Sí |
| R26 | Plugin Revit inexistente para el Pset | BIM | Alta | Alta | Restricciones no aplicadas | `IFCSerializer.ts:52` | No | Sí |
| R27 | IFC no validado externamente | Calidad | Alta | Media | Rechazos en Revit | `test/ifc/stepLint.ts` | No | Sí |
| R28 | Sin importación | Producto | Alta | Alta | Ciclo roto | grep | No | Sí |
| R29 | Láser BLE sin UI | Producto | Alta | Alta | No compite en medición | `docs/18` §4 | No | Sí |
| R30 | Solo vertical | UX | Media | Alta | Mala en tableta | `app.json` | No | Sí |
| R31 | Permisos al arrancar | UX/Privacidad | Media | Alta | Rechazos, desconfianza | `PermissionsManager.ts:190` | No | Sí |
| R32 | Permisos obsoletos o excesivos | Seguridad | Media | Media | Revisión de Play | `app.json` | No | Sí |
| R33 | BD y backups sin cifrar | Seguridad | Media | Media | Fuga de datos de clientes | — | No | Sí |
| R34 | Sin identidad de operador | Legal | Alta | Alta | Evidencia sin no-repudio | `operator.ts` | No | Sí |
| R35 | OTA sin canales | Release | Media | Baja | Código roto en campo | `app.json` | No | Sí |
| R36 | SDK, RN y Skia envejecidos | Tecnología | Alta | Alta | Upgrade costoso | `package.json` | No | Sí |
| R37 | Tests sobre sqlite3 y no expo-sqlite | Calidad | Media | Media | Fallos solo en dispositivo | `test/__mocks__` | No | Sí |
| R38 | Sin pruebas de UI ni E2E | Calidad | Alta | Alta | Regresiones de gestos | — | No | Sí |
| R39 | Modos Avance y Revisión vacíos | Producto | Media | Alta | Promesa incumplida | `docs/18` §10 | No | Sí |
| R40 | Sin cuadro de áreas ni PDF | Producto | Alta | Alta | No genera entregable | grep | No | Sí |
| R41 | Fuente única: un desarrollador asistido por IA | Organización | Alta | Media | Bus factor 1; deuda invisible | historial | No | Sí |
| R42 | Licencia de mapas offline sin resolver | Legal | Media | Media | Bloquea M2b | plan | No | No |
| R43 | Precisión GPS de celular (3–15 m) usada para amarre | Geodesia | Media | Media | Georreferencia engañosa | `docs/18` §7 | No | No |
| R44 | Nombre de dominio acoplado a "Revit" | Estrategia | Baja | Media | Sesgo propietario frente a OpenBIM | `base.ts` | No | No |
| R45 | Export per-espacio: N `IfcProject` | BIM | Media | Alta | Federación torpe | `exportActions.ts` | No | Sí |

---

# CAPÍTULO 38 — MATRIZ DE FORTALEZAS

| Fortaleza | Evidencia | Valor técnico /10 | Valor de producto /10 | Mantener |
|---|---|---:|---:|:---:|
| Arquitectura por capas con puertos | `IDatabase`, Native/Infra | 8 | 6 | Sí |
| Controladores puros testeables | `EditorController`/`ElevationEditor` + tests | 8 | 6 | Sí (dividir) |
| Restricciones verticales tipo Revit | `vertical.ts` | 9 | 8 | Sí |
| Niveles y fases por proyecto | `MarkerStore`, `levelScope.ts` | 8 | 8 | Sí |
| Alzado por muro (CSL) | `WallElevationService`, `ElevationEditor` | 8 | 8 | Sí |
| Georreferencia MAGNA-SIRGAS con mínimos cuadrados | `domain/geo/*`, proj4 | 9 | 7 | Sí |
| IFC4 con GUID estable | `guid-generator.ts` | 8 | 8 | Sí |
| DXF R2000 válido con capas | `DXFSerializer.ts` | 7 | 6 | Sí |
| Escritura inmediata + transacciones | `ExpoSQLiteDatabase.ts:73` | 7 | 7 | Sí |
| Lienzo Skia con capa viva y cámara en hilo UI | `PlanCanvas.tsx`, `liveOverlay.ts` | 8 | 8 | Sí |
| Convenciones de dibujo ISO 128 | `planRenderer.ts` | 7 | 7 | Sí |
| 857 tests verdes | jest | 7 | 5 | Sí |
| Offline total | sin red | 6 | 8 | Sí |
| Documentación exhaustiva (docs + bóveda) | `docs/`, `_0bsidian/` | 5 | 4 | Sí, pero condensar |
| Disciplina de PR por fase | historial | 6 | 4 | Sí |

---

# CAPÍTULO 39 — MATRIZ DE ELEMENTOS FALTANTES

| Elemento | Estado | Impacto /10 | Prioridad | MVP | Producción |
|---|---|---:|:---:|:---:|:---:|
| Uniones de muros persistentes | AUSENTE | 10 | P0 | Requerido | Requerido |
| Medida cara-a-cara con propagación | AUSENTE | 10 | P0 | Requerido | Requerido |
| Recintos múltiples con identidad | AUSENTE | 9 | P0 | Requerido | Requerido |
| Área neta/bruta | AUSENTE | 9 | P0 | Requerido | Requerido |
| Export/import de proyecto (paquete) | AUSENTE | 10 | P0 | Requerido | Requerido |
| Backup fuera del dispositivo | AUSENTE | 10 | P0 | Requerido | Requerido |
| Exportar fotos e informe fotográfico | AUSENTE | 9 | P0 | Requerido | Requerido |
| Migraciones de esquema (`user_version`) | AUSENTE | 9 | P0 | Requerido | Requerido |
| Listado de fotos sin BLOB | AUSENTE | 8 | P0 | Requerido | Requerido |
| Deshabilitar toggles sin función | AUSENTE | 6 | P0 | Requerido | Requerido |
| PDF de plano + cuadro de áreas | AUSENTE | 8 | P1 | Deseable | Requerido |
| IfcMapConversion | AUSENTE | 7 | P1 | Deseable | Requerido |
| Láser BLE con UI | PARCIAL | 8 | P1 | Deseable | Requerido |
| Crash reporting + logs | AUSENTE | 8 | P1 | Deseable | Requerido |
| CI con tests y tsc | AUSENTE | 7 | P1 | Deseable | Requerido |
| Horizontal y tableta | AUSENTE | 6 | P1 | Deseable | Requerido |
| Upgrade Expo / target SDK | PENDIENTE | 8 | P1 | — | Requerido |
| Identidad del operador | AUSENTE | 6 | P1 | — | Requerido |
| CSV de medidas y coordenadas | AUSENTE | 6 | P1 | Deseable | Requerido |
| Plugin Revit (muros nativos) | AUSENTE | 8 | P2 | — | Deseable |
| Importar IFC/DXF como calco | AUSENTE | 6 | P2 | — | Deseable |
| Sincronización multi-dispositivo | AUSENTE | 7 | P2 | — | Deseable |
| Avance (M3) / Revisión (M4) | AUSENTE | 7 | P2 | — | Deseable |
| Clasificación BIM y Psets de espacio | AUSENTE | 5 | P2 | — | Deseable |
| Cifrado de BD | AUSENTE | 5 | P2 | — | Deseable |

---

# CAPÍTULO 40 — MATRIZ DE DEUDA TÉCNICA

| Deuda | Área | Severidad | Impacto | Complejidad | Urgencia |
|---|---|:---:|:---:|:---:|:---:|
| Topología derivada, no persistida | Geometría | Crítica | Muy alto | Alta | Inmediata |
| Semántica de medida al eje | Geometría | Crítica | Muy alto | Media | Inmediata |
| Room = contenedor y espacio | Datos | Alta | Alto | Alta | Alta |
| Sin versionado de esquema | Persistencia | Crítica | Muy alto | Baja | Inmediata |
| Fotos BLOB en SQLite | Persistencia | Alta | Alto | Media | Alta |
| `EditorController` monolítico | Código | Alta | Alto | Media | Alta |
| `SurveyScreen` monolítica | UI | Media | Medio | Media | Media |
| 42 `as unknown as` / 53 `any` | Tipado | Media | Medio | Baja | Media |
| Comentarios-changelog | Código | Baja | Bajo | Baja | Baja |
| CDT + CloseRoomUseCase sin uso | Código | Baja | Bajo | Baja | Baja (decidir en F6a) |
| Nivel y fase en JSON | Datos | Media | Medio | Media | Media |
| Sin FK declaradas | Datos | Media | Medio | Baja | Media |
| IDs no UUID | Datos | Media | Alto con sync | Baja | Media |
| Sin registro de tipos de elemento | Arquitectura | Alta | Alto | Media | Alta (antes de F6b) |
| Exportadores sin interfaz común | Arquitectura | Media | Medio | Baja | Media |
| `saveToUserFolder` solo texto | Native | Media | Alto (bloquea PDF/fotos) | Baja | Alta |
| SDK envejecido | Plataforma | Alta | Alto | Alta | Alta |
| Sin CI, linter ni crash reporting | DevOps | Alta | Alto | Baja | Alta |
| Tests no cubren UI ni dispositivo | QA | Alta | Alto | Media | Media |
| Toggles ⚠️ | UX | Media | Medio | Baja | Inmediata |

---

# CAPÍTULO 41 — MATRIZ DE DECISIONES ARQUITECTÓNICAS

| Decisión | Beneficio | Costo | Riesgo | Evaluación | Mantener/Revisar |
|---|---|---|---|---|---|
| Expo administrado (sin `android/`) | Velocidad, EAS | Menos control nativo | Upgrades forzados | Correcta para la etapa | Mantener |
| Skia para el lienzo | Rendimiento vectorial | Curva de aprendizaje | Versión antigua | Muy buena | Mantener (actualizar) |
| Controladores puros + zustand solo para el cromo | Testabilidad | Más plomería | God object | Buena | **Revisar**: dividir |
| SQLite STI + JSON | Flexibilidad | Sin esquema ni consultas | Migraciones | Aceptable para prototipo | **Revisar** |
| Escritura inmediata | Sin pérdida al cerrar | Más I/O | — | Buena | Mantener |
| Recintos derivados en cada carga | Simplicidad | Sin identidad | Pérdida semántica | Mala para BIM | **Revisar** |
| Topología por proximidad (5 cm) | Tolerante a campo | Uniones implícitas | Esquinas rotas | Insuficiente | **Revisar** |
| Escritores IFC/DXF propios | Sin dependencias pesadas | Validación propia | Divergencia del estándar | Buena para exportar | Mantener + validar externamente |
| Export por espacio | Simple | N archivos y N proyectos | Federación torpe | Débil | **Revisar** |
| Local-only sin backend | Offline, privacidad, costo 0 | Sin colaboración ni respaldo | Pérdida total | Correcta para empezar; insuficiente para producto | **Revisar** (backup externo al menos) |
| Fotos BLOB en la BD | Atomicidad | Memoria, tamaño, backups | OOM | Mala | **Revisar** |
| Coordenadas locales + transformación de proyecto | Modelo limpio, recálculo global | — | — | Excelente | Mantener |
| Pset propio para Revit | Conserva restricciones | Requiere plugin | Inútil sin plugin | Correcta a medias | Mantener + construir plugin |
| Herramientas ⬜ visibles | Comunica la hoja de ruta | Ruido visual | Expectativas | Discutible | Revisar (agrupar "próximamente") |
| Dominio nombrado "Revit*" | Claridad hacia el objetivo | Sesgo propietario | Bloqueo conceptual a OpenBIM | Débil | Revisar a largo plazo |

---

# CAPÍTULO 42 — VALORACIÓN MULTIDIMENSIONAL

| Dimensión | /10 | /100 |
|---|---:|---:|
| Software | 5,0 | 50 |
| Arquitectura | 6,0 | 60 |
| Código | 6,0 | 60 |
| Frameworks | 6,0 | 60 |
| UX/UI | 5,5 | 55 |
| Geometría | 4,5 | 45 |
| Topología | 4,0 | 40 |
| Persistencia | 4,5 | 45 |
| Offline-first | 6,0 | 60 |
| Rendimiento | 5,0 | 50 |
| Seguridad | 4,0 | 40 |
| Testing | 6,0 | 60 |
| Escalabilidad | 4,0 | 40 |
| Ingeniería civil | 3,5 | 35 |
| Uso en obra | 3,0 | 30 |
| Uso por residente | 2,5 | 25 |
| Flujo campo-oficina | 2,0 | 20 |
| BIM | 4,0 | 40 |
| Metodología BIM | 3,0 | 30 |
| Modularidad BIM | 4,5 | 45 |
| Revit | 3,5 | 35 |
| IFC | 4,5 | 45 |
| OpenBIM | 3,0 | 30 |
| Multiformato | 2,0 | 20 |
| Interoperabilidad | 3,0 | 30 |
| MVP | 3,5 | 35 |
| Producción | 1,5 | 15 |
| Producto | 3,4 | 34 |
| Competitividad | 2,5 | 25 |
| Diferenciación | 4,5 | 45 |
| Potencial comercial | 4,5 | 45 |

---

# CAPÍTULO 43 — VALORACIÓN POR ESCENARIOS

| # | Escenario | Nota /10 | Justificación |
|---|---|---:|---|
| 43.1 | Calidad pura de software | **5,0** | Capas limpias, tests y tipos estrictos; monolitos, sin migraciones, CI ni observabilidad |
| 43.2 | MVP | **3,6** | Flujo de punta a punta existe; 10 bloqueantes de confianza y de datos |
| 43.3 | Producto comercial | **3,4** | Sin publicación posible (SDK), sin soporte ni telemetría, sin cobro, sin colaboración |
| 43.4 | Software BIM | **3,8** | Semántica vertical excelente; espacios, georreferencia, clasificación y regreso ausentes |
| 43.5 | Herramienta para obra | **3,2** | Offline y a una mano; medida y respaldo inaceptables |
| 43.6 | Plataforma de interoperabilidad | **3,2** | Dos exportadores de texto, sin importadores ni modelo de intercambio |
| 43.7 | Herramienta para residente | **2,5** | Sin reportes, avance, revisión ni fotos exportables |
| 43.8 | Herramienta campo-oficina | **2,0** | Ciclo abierto: solo ida, solo geometría |

---

# CAPÍTULO 44 — ÚLTIMA PASADA DE AUDITORÍA

Revisión independiente, buscando lo que las pasadas anteriores pudieron pasar por alto.

| # | Tipo | Hallazgo |
|---|---|---|
| U1 | Contradicción | La UI muestra recintos múltiples con área y nombre, pero **solo uno se guarda y exporta**. El usuario ve una cosa y entrega otra. |
| U2 | Decisión aparentemente correcta pero incorrecta | "Cada muro se guarda al trazarlo" protege del cierre forzado, pero, como el grafo no es persistente, **lo que se guarda no son esquinas, solo segmentos**. La robustez de la escritura oculta la fragilidad del modelo. |
| U3 | Decisión aparentemente correcta pero incorrecta | `applyMeasurementToWall` "corrige el dibujo con la medida real", pero corrige **la magnitud equivocada** (eje frente a cara) y rompe la vecindad. Es la función que más confianza promete y la que más error introduce. |
| U4 | Punto único de fallo | El teléfono: almacena, respalda y es la única copia. |
| U5 | Punto único de fallo | Una fila JSON corrupta bloquea su espacio entero (`JSON.parse` sin protección). |
| U6 | Dependencia peligrosa | Skia 1.2.3 + RN 0.74 + Expo 51: el salto a versiones actuales cambia la API del lienzo, que es el corazón de la app. Cuanto más se retrase, más caro será. |
| U7 | Crecimiento | Las 39 herramientas ⬜ comparten 3 cuellos de botella (controlador, CHECK SQL de tipos, exportadores sin registro). Cada una aumentará el costo de la siguiente. |
| U8 | Geométrico | Área al eje + IfcSpace al eje + Qto de muros con área bruta lateral: en Revit **las cantidades no cuadran** entre habitación y muros. |
| U9 | BIM | El Pset `PolyLive_RevitConstraints` da la impresión de integración paramétrica con Revit; sin plugin, es metadato inerte. |
| U10 | Interoperabilidad | Cada espacio sale en su propio archivo con `IfcProject`, `IfcSite` e `IfcBuilding`. **Atenuante verificado:** sus GUID derivan de `projectKey` y los de piso del id de nivel (`IFCSerializer.ts:114-130`), así que coinciden entre archivos y un federador (Navisworks/Solibri) puede reconciliarlos. En Revit siguen siendo N vínculos separados. Si `projectKey` no se pasa, la GUID cae al nombre del proyecto: renombrarlo cambia la identidad. |
| U11 | Campo | La herramienta Medición necesita elegir primero el muro y luego ingresar la medida. Sin láser BLE, el flujo es más lento que una libreta + CAD. |
| U12 | Oficina | No existe forma de que la oficina vea el trabajo sin Revit/AutoCAD, ni un visor ni un PDF. |
| U13 | Revit | Abrir el IFC en Revit da elementos IFC importados de edición limitada; el usuario esperará muros de Revit. Gestionar esa expectativa es parte del producto. |
| U14 | IFC | `IfcWallStandardCase` deprecado en IFC4; no es un error, pero un validador estricto lo marcará como advertencia. |
| U15 | Formato | Sin versión del formato propio: cuando exista el paquete de proyecto, debe nacer versionado. |
| U16 | Productividad | El mayor ahorro posible (no redibujar en Revit) existe a medias. El segundo mayor (informe fotográfico) no existe. |
| U17 | Proceso | La documentación narrativa es abundante, pero **no hay un criterio de aceptación de campo** escrito (p. ej. "un recinto de 4×5 m medido con láser debe cerrar con error < 1 cm"). Sin ese criterio, la calidad de medida nunca se validó. |
| U18 | Sesgo de evaluación | 857 tests verdes pueden dar una falsa sensación de calidad: prueban lo que el código hace, no si es lo que un ingeniero necesita (la medida al eje está **probada como correcta**). |

**Conclusión de la última pasada:** confirma y **endurece** el diagnóstico. El problema central no es la cantidad de funciones sino **la confiabilidad del dato capturado** (medida, uniones, recintos) y **su salida del dispositivo**.

---

# CAPÍTULO 45 — VEREDICTO FINAL

| # | Pregunta | Respuesta |
|---|---|---|
| 45.1 | ¿Qué tenemos realmente? | Una **alpha** de croquis BIM para Android, offline, con un núcleo de dominio sólido (niveles, fases, restricciones, alzados, georreferencia) y exportación IFC/DXF por espacio. |
| 45.2 | ¿Qué tan buena es técnicamente? | **5,0/10.** Bien estructurada y probada en el núcleo; débil en datos (migraciones, topología, BLOB) y en ingeniería de producción. |
| 45.3 | ¿Como software? | **5,0/10.** |
| 45.4 | ¿Como MVP? | **3,6/10.** Aún no lo es. |
| 45.5 | ¿Para ingeniería civil? | **3,5/10.** Croquis sí, medida y entregables no. |
| 45.6 | ¿En obra? | **3,0/10.** Offline y usable; no confiable ni respaldada. |
| 45.7 | ¿Para residentes? | **2,5/10.** |
| 45.8 | ¿Campo-oficina? | **2,0/10.** Solo ida y solo geometría. |
| 45.9 | ¿Preparada para BIM? | BIM-aware, no BIM-ready (**4,0/10**). |
| 45.10 | ¿Para Revit? | **3,5/10.** Buena base (niveles, GUID); falta el plugin y la georreferencia. |
| 45.11 | ¿IFC? | **4,5/10.** Formalmente serio, semánticamente incompleto, sin validación externa. |
| 45.12 | ¿Multiformato? | **2,0/10.** |
| 45.13 | ¿Competitiva? | **2,5/10** hoy; con nicho defendible a futuro. |
| 45.14 | Lo más fuerte | El modelo vertical (niveles, fases, restricciones por extremo) y el alzado por muro. |
| 45.15 | Lo más débil | La confiabilidad de la medida y la topología no persistente. |
| 45.16 | Mayor riesgo | Pérdida total de datos de campo (sin respaldo externo ni exportación de proyecto ni de fotos). |
| 45.17 | Mayor error arquitectónico | **Tratar la topología y los recintos como derivados en lugar de como modelo persistido con identidad.** Todo lo que viene (Suelo, Avance por recinto, áreas, IfcSpace, Revit Rooms) depende de eso. |
| 45.18 | Qué corregir primero | (1) Salida y respaldo de datos (paquete de proyecto + fotos). (2) Uniones persistentes + medida cara-a-cara. (3) Migraciones de esquema. |
| 45.19 | Qué conservar | Capas, controladores puros, dominio vertical, módulo geo, escritores IFC/DXF, lienzo Skia con capa viva, suite de tests, disciplina de PR. |
| 45.20 | Qué rediseñar | Modelo topológico y de recintos; separación contenedor/espacio; almacenamiento de fotos; registro de tipos de elemento; arquitectura de importadores y exportadores. |

---

# CLASIFICACIÓN FINAL DEL PRODUCTO

## ▶ ALPHA

**Por qué no "PROTOTIPO FUNCIONAL":**
- Hay persistencia transaccional real, 857 tests, un flujo de punta a punta verificado en dispositivo y exportaciones con estructura correcta (IFC4 con GUIDs y pisos; DXF AC1015 con handles y tablas).
- Un prototipo no tiene restricciones verticales por extremo, ni ajuste geodésico por mínimos cuadrados, ni recuperación ante cierre probada.

**Por qué no "BETA TÉCNICA":**
- Una beta presupone que el núcleo funcional es confiable y solo falta pulir. Aquí **el dato central (la medida y la forma del recinto) no es confiable**: la medida va al eje, las uniones se rompen al editar y solo se persiste el recinto mayor.
- Además, el dato **no puede salir del dispositivo** de forma completa ni protegerse ante pérdida.
- Dos de los cuatro modos no tienen ninguna función.

**Por qué no "CANDIDATO A MVP":**
- Un candidato a MVP debe resolver el problema mínimo del usuario (medir y entregar) sin riesgos inaceptables.
- Hoy entrega planos con error sistemático y pone en riesgo la jornada completa.

**Distancia a MVP:** los 10 ítems P0 de la matriz final. Son acotados: se resuelven sin rehacer la app, porque las capas y los tests lo permiten.

---

# TABLA DE CALIFICACIÓN FINAL

| Área | /10 | /100 | Diagnóstico |
|---|---:|---:|---|
| Software | 5,0 | 50 | Núcleo sano; operación de producción ausente |
| Arquitectura | 6,0 | 60 | Capas correctas; centro monolítico; modelo espacio-céntrico |
| Código | 6,0 | 60 | Legible y estricto; escapes de tipo y monolitos |
| Frameworks | 6,0 | 60 | Buenas elecciones; versiones envejecidas |
| UX/UI | 5,5 | 55 | Lienzo excelente; funciones fantasma; solo vertical |
| Geometría | 4,5 | 45 | Correcta en simple; sin cruces; área al eje |
| Topología | 4,0 | 40 | Detector bueno; no es modelo |
| Persistencia | 4,5 | 45 | Transaccional sí; migraciones, BLOB y respaldo externo no |
| Offline | 6,0 | 60 | Local-only total; no local-first |
| Rendimiento | 5,0 | 50 | Render bueno; carga de fotos y backup al arrancar malos |
| Seguridad | 4,0 | 40 | Riesgo bajo por ausencia de red, no por controles |
| Testing | 6,0 | 60 | Unitario fuerte; UI, E2E, dispositivo y CI nulos |
| Escalabilidad | 4,0 | 40 | Cada función nueva encarece la siguiente |
| Ingeniería Civil | 3,5 | 35 | Croquis útil; medida y entregables no aptos |
| Uso en Obra | 3,0 | 30 | Offline y a una mano; no confiable |
| Residente | 2,5 | 25 | Sin reportes, avance ni revisión |
| Campo-Oficina | 2,0 | 20 | Ciclo abierto |
| BIM | 4,0 | 40 | BIM-aware |
| Metodología BIM | 3,0 | 30 | Sin clasificación, LOI, IDS ni versionado |
| Modularidad BIM | 4,5 | 45 | Capas sí; registro de tipos no |
| Revit | 3,5 | 35 | Niveles y GUID; sin plugin ni georreferencia |
| IFC | 4,5 | 45 | Estructura correcta; cobertura y validación insuficientes |
| OpenBIM | 3,0 | 30 | Sin MVD, IDS, BCF ni clasificación |
| Multiformato | 2,0 | 20 | 2 exportadores de texto, 0 importadores |
| Interoperabilidad | 3,0 | 30 | Solo ida |
| MVP | 3,5 | 35 | 10 bloqueantes |
| Producción | 1,5 | 15 | Sin CI, telemetría, migraciones ni publicación |
| Competitividad | 2,5 | 25 | Inferior en captura e informes |
| Diferenciación | 4,5 | 45 | Real en vertical/BIM/geo; copiable |
| Potencial Comercial | 4,5 | 45 | Nicho LatAm "existente → Revit" defendible si se ejecuta |

### NOTA TÉCNICA PURA — **5,0 / 10**
Promedio simple de Software, Arquitectura, Código, Frameworks, Geometría, Topología, Persistencia, Rendimiento, Seguridad, Testing y Escalabilidad: 55 / 11 = 5,0.

### NOTA COMO MVP — **3,6 / 10**
| Componente | Nota | Peso |
|---|---:|---:|
| MVP | 3,5 | 30 % |
| Ingeniería civil | 3,5 | 15 % |
| Uso en obra | 3,0 | 15 % |
| Persistencia | 4,5 | 15 % |
| UX | 5,5 | 10 % |
| Campo-oficina | 2,0 | 15 % |

Resultado: 3,55.

### NOTA COMO PRODUCTO — **3,4 / 10**
| Componente | Nota | Peso |
|---|---:|---:|
| Producción | 1,5 | 25 % |
| Competitividad | 2,5 | 20 % |
| Diferenciación | 4,5 | 15 % |
| Potencial comercial | 4,5 | 15 % |
| UX | 5,5 | 10 % |
| Seguridad | 4,0 | 15 % |

Resultado: 3,38.

### NOTA COMO SOFTWARE BIM — **3,8 / 10**
Promedio simple de BIM, Metodología, Modularidad, Revit, IFC y OpenBIM: 22,5 / 6 = 3,75.

### NOTA COMO SOFTWARE DE OBRA — **3,2 / 10**
| Componente | Nota | Peso |
|---|---:|---:|
| Uso en obra | 3,0 | 30 % |
| Residente | 2,5 | 20 % |
| Campo-oficina | 2,0 | 20 % |
| Offline | 6,0 | 15 % |
| Ingeniería civil | 3,5 | 15 % |

Resultado: 3,23.

### NOTA COMO PLATAFORMA DE INTEROPERABILIDAD — **3,2 / 10**
Promedio simple de Multiformato, Interoperabilidad, IFC, Revit y OpenBIM: 16 / 5 = 3,2.

### NOTA INTEGRAL — **3,9 / 10 (39 / 100)**
| Componente | Nota | Peso |
|---|---:|---:|
| Técnica | 5,0 | 25 % |
| MVP | 3,6 | 20 % |
| Producto | 3,4 | 15 % |
| BIM | 3,8 | 15 % |
| Obra | 3,2 | 15 % |
| Interoperabilidad | 3,2 | 10 % |

Resultado: 3,85.

**Criterio de ponderación:**
- La técnica pesa más porque es lo único que no se recupera rápido si está mal. Aquí está razonablemente bien.
- MVP, obra y BIM pesan igual o más que el producto, porque el encargo evalúa la utilidad profesional antes que el negocio.
- La interoperabilidad pesa menos porque depende de las demás: sin dato confiable no hay nada que intercambiar.

---

# MATRIZ FINAL DE PRIORIDADES

| Prioridad | Problema | Impacto | Acción conceptual | Motivo |
|---|---|---|---|---|
| **P0** | Datos atrapados y sin respaldo externo | Pérdida total | Paquete de proyecto exportable/importable (BD + fotos, versionado) y backup a una carpeta del usuario (SAF/Drive) | Riesgo dominante en obra |
| **P0** | Fotos no exportables | Evidencia inútil | Exportar fotos con metadatos e informe fotográfico básico | Interventoría y residente |
| **P0** | Medida aplicada al eje | Error sistemático | Medir cara-a-cara (interior/exterior explícito) y convertir a eje con el espesor; registrar qué medida originó cada longitud | Confiabilidad del dato central |
| **P0** | Uniones no persistentes | Esquinas rotas al editar | Grafo de nodos persistido: mover un nodo mueve todos sus muros | Base de recintos, suelos, avance y áreas |
| **P0** | Un recinto por espacio + área al eje | BIM y cantidades erróneas | Recintos con identidad estable, múltiples, área neta (cara interior) y bruta explícitas; IfcSpace a cara interior | Entregable correcto |
| **P0** | Sin migraciones de esquema | Corrupción al actualizar | `user_version` + migraciones ordenadas y probadas | Prerrequisito de cualquier cambio de modelo |
| **P0** | BLOB de fotos en cada `reload` | OOM / lag | Listar fotos sin la columna de imagen; mover imágenes a archivos | Estabilidad con uso real |
| **P0** | Toggles sin función | Desconfianza | Implementar snaps vértice/punto medio y deshabilitar el resto | Regla del propio proyecto |
| **P0** | `JSON.parse` sin protección | Espacio inabrible | Lectura tolerante por fila con aviso | Robustez mínima |
| **P0** | Criterio de aceptación de campo ausente | Calidad no medible | Definir y ejecutar una prueba de campo con láser: tolerancias de cierre y de área | Sin esto no se puede declarar MVP |
| **P1** | Sin crash reporting ni logs | Fallos invisibles | Telemetría de errores con consentimiento | Producción |
| **P1** | Sin CI ni linter | Regresiones | CI con tsc + jest + lint en cada PR | Producción |
| **P1** | Expo 51 / target SDK | No publicable | Plan de upgrade escalonado (SDK, RN, Skia) | Play Store |
| **P1** | Sin PDF ni cuadro de áreas | Sin entregable | Plano PDF con rótulo y escala + tabla de áreas | Ingeniería civil |
| **P1** | Sin IfcMapConversion | Sin coordenadas compartidas | Escribir la georreferencia existente en el IFC | Revit/coordinación |
| **P1** | Láser BLE sin UI | No compite en medición | Dev Client + flujo de medición con láser | Diferenciación de campo |
| **P1** | `EditorController` monolítico | Costo marginal | Dividir por herramienta / responsabilidad | Antes de F6b |
| **P1** | Registro de tipos de elemento | Costo por tipo nuevo | Descriptor por tipo (persistencia, render, IFC, DXF, propiedades) | Antes de F6b |
| **P1** | Solo vertical | Tableta inutilizable | Soportar horizontal y layout de tableta | Obra |
| **P1** | Permisos al arrancar y obsoletos | Rechazo / privacidad | Pedir por función; limpiar el manifiesto | Play, confianza |
| **P1** | Sin identidad de operador | Evidencia sin autor | Identidad mínima firmada en fotos y medidas | Interventoría |
| **P1** | IFC no validado externamente | Rechazos en Revit | Validación automática (IfcOpenShell/buildingSMART) y prueba en Revit documentada | BIM |
| **P1** | Export por espacio | Federación torpe | Export de proyecto completo en un IFC | BIM |
| **P2** | Plugin de Revit | Restricciones no aplicadas | Add-in que cree muros, puertas y habitaciones nativas desde IFC/JSON | Ventaja competitiva |
| **P2** | Sin importación | Ciclo abierto | Importar IFC/DXF como calco; CSV de coordenadas | Regreso a campo |
| **P2** | Sin sincronización | Un solo dispositivo | Log de cambios + UUID + sync opcional | Equipo |
| **P2** | Avance y Revisión | Promesa incumplida | M3 y M4 sobre recintos y caras estables | Residente |
| **P2** | Clasificación y Psets | BIM pobre | Clasificación y Psets de espacio, puerta y ventana | BIM Manager |
| **P2** | Cifrado | Datos de clientes | Cifrar BD y backups | Seguridad |
| **P3** | Comentarios-changelog | Ruido | Mover la historia a git y docs | Legibilidad |
| **P3** | Código muerto (CDT, CloseRoom) | Ruido | Reutilizar en F6a o eliminar | Mantenibilidad |
| **P3** | Persistir el tema | Comodidad | Guardar la preferencia | UX |
| **P3** | Arcos en herramientas y exportadores | Cobertura | Herramienta de arco + exportación curva | Completitud |
| **P3** | Dominio nombrado "Revit*" | Sesgo | Renombrar a elementos neutrales | OpenBIM |

---

# RESPUESTA AL PRINCIPIO FINAL

**¿Estamos construyendo un software realmente sólido o un prototipo que aparenta ser una aplicación terminada?**
**Ninguna de las dos cosas, exactamente.**
- **Los cimientos son sólidos:** capas, dominio vertical, georreferencia, escritores IFC/DXF, tests y transacciones.
- **La fachada aparenta más de lo que hay:** 39 herramientas visibles sin función, 10 toggles que no hacen nada, dos modos vacíos, un Pset "para el plugin de Revit" sin plugin y recintos que se ven pero no se guardan.
- **El dato que se captura no es todavía confiable.**

**¿Puede la arquitectura actual convertirse en una plataforma profesional de medición, documentación y flujo BIM?**
**Sí, con tres refactors estructurales previos y no negociables**, en este orden:
1. Topología y recintos persistentes con identidad.
2. Esquema versionado con almacenamiento de fotos fuera de la BD.
3. Registro de tipos de elemento con exportadores e importadores desacoplados.

Sin ellos, cada función nueva aumenta la fragilidad.

**¿Puede LevON conectar campo y oficina, reducir tareas repetitivas, alimentar Revit y volverse interoperable?**
**Tiene el ADN correcto para el tramo campo → Revit**, y es el más valioso: niveles, fases, restricciones y GUID estables. Hoy recorre solo la mitad de ese tramo y ninguno de los otros. El camino más corto a un producto con valor real es:

> **medida confiable → recintos estables → salida completa (proyecto, fotos, PDF, IFC georreferenciado) → plugin de Revit nativo → regreso (importación) → avance y revisión.**

---
*Fin de la auditoría. Único entregable: `AUDITORIA_INTEGRAL_LEVON.md`. No se modificó, creó ni borró ningún otro archivo del proyecto.*
