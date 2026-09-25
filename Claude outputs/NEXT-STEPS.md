# NEXT-STEPS

## El camino de PolyLive hacia React Native

Los seis spikes de este experimento validaron la hipótesis de fragmentación de contexto y produjeron 101 archivos TypeScript con 208 tests pasando — pero deliberadamente no construyeron la aplicación móvil completa. Este documento traza lo que sigue, usando el mismo enfoque de vault que ya funcionó, y apoyándose en los gaps reales que el propio Spike #6 dejó documentados (`BUGS-AND-GAPS.md`).

---

## 1. Spike #7 — Referencias topográficas (3 notas, sin generar aún)

`01-Dominio/survey/` ya contiene las tres notas necesarias para este spike y no se tocaron durante los seis spikes ejecutados: `gpsAnchor-referencia.md`, `SiteCoordinateSystem.md` y `SurveyControlPoint.md`. Es, junto con `03-Infraestructura/export-ifc/` en su momento, uno de los dominios más pequeños y autocontenidos del vault — buen candidato para confirmar una vez más el patrón de reuso observado en los Spikes #4 y #5 antes de pasar a un spike de mayor superficie.

**Alcance esperado del Spike #7:**
- `CreateControlPointUseCase` — crea un `SurveyControlPoint` (Maestro §4.3.2), especificado pero no implementado.
- `DefineSiteCoordinateSystemUseCase` — escribe `Site.coordinateSystem` (Maestro §4.3.1), especificado pero no implementado.
- Ambos UseCases están documentados en `arquitectura-aplicacion-v1.md` §3 como casos que **no pasan por `CommandStack`** de la forma estándar — no operan sobre `RevitObjectBase`, por lo que requieren la variante `SimpleCommand` ya especificada pero, hasta este momento, sin código ni tests propios.

## 2. Spike #8 — Integración con React Native

Este es el salto de mayor superficie: llevar los 101 archivos TypeScript ya validados (que hoy corren en Node puro vía Jest) a una aplicación Expo real, siguiendo el árbol de carpetas ya especificado en `arquitectura-carpetas-v1.md` sin necesidad de rediseñarlo.

**Lo que ya existe y se reutiliza sin cambios:** todo `domain/` (TypeScript puro, sin dependencias de React Native) y la mayor parte de `application/` — los UseCases y Commands no conocen React Native por diseño, así que migran prácticamente sin modificación.

**Lo que falta construir en este spike, por capa:**

| Capa | Piezas pendientes |
|---|---|
| `infrastructure/` | `BLEManager.ts` + `HuepaDriver.ts` + `BLEReconnectionManager.ts` (retry 3 intentos, backoff 1s/2s/4s, ya especificado en Maestro §10.3); `PhotoRepository.ts` (filesystem — hoy las fotos se persisten como BLOB en SQLite, no en filesystem real); `LocationService.ts` (GPS + brújula) |
| `screens/` y `components/` | Las 9 pantallas del `RootStack` (`OperatorSelector`, `Dashboard`, `ProjectNavigator`, `SurveyScreen`, `AuditPhotoScreen`, `ExportScreen`, `SettingsScreen`, `OperatorProfileManager`) y los componentes reutilizables (`Canvas2D` con Skia, `PropertyPanel`, `FAB`, `StatusBar`, `PanelEspacios`, `UndoRedoButtons`) — ninguno tiene código todavía, solo especificación en `sistema-wireframes-maestro.md` |
| `state/` | Dividir `appStore.ts` (hoy un único store) en los slices especificados (`survey-slice`, `ble-slice`, `ui-slice`, `control-points-slice`) |
| `shared/` | `AppError.ts` — el modelo de errores centralizado que varios UseCases ya referencian pero que no existe como archivo (gap #2 de `BUGS-AND-GAPS.md`) |
| `i18n/` | `es.json` / `en.json` — estructura lista desde v0.1, contenido pendiente |

**Regla de integración no negociable:** antes de escribir el primer componente de UI, configurar el lint rule (o script de CI) que falle el build si `domain/**/*.ts` importa desde `react-native`, `expo-*` o `zustand` — la regla ya está especificada en `arquitectura-carpetas-v1.md` §2.2 y es la que protegió la separación de capas durante los seis spikes; sin enforcement automático, es la primera regla que se rompe por accidente al conectar UI real.

## 3. Los gaps de `BUGS-AND-GAPS.md` que bloquean funcionalidad real, no solo tests

Tres de los siete gaps documentados no son solo huecos de testing — son UseCases de sistema completamente especificados que la app necesita antes de un uso real en campo:

1. **`RecoverRoomDraftUseCase`** — sin esto, un crash a mitad de trazo pierde el progreso visualmente para el operario aunque los datos sobrevivan en `polygon_drafts` (la tabla ya persiste correctamente, verificado en `CrashRecovery.test.ts`).
2. **`BackupDatabaseUseCase` / `RestoreDatabaseUseCase`** — sin esto, la estrategia de backup rotativo (`backup-integridad.md`) es solo documentación; hoy no hay ningún mecanismo automático que la ejecute.
3. **`AppError` centralizado** — sin esto, cada UseCase sigue lanzando errores con su propia forma ad-hoc, lo que dificulta que la UI tenga un único punto de manejo de errores como especifica `arquitectura-aplicacion-v1.md` §5.

Recomendación: resolver estos tres antes o durante el Spike #8, no después — son infraestructura de sistema que toda pantalla nueva va a necesitar invocar.

## 4. Checklist de deployment

- [ ] **Expo Dev Client obligatorio desde el primer build** — nunca Expo Go, por incompatibilidad confirmada con el modo WAL de SQLite que la app requiere para no comprometer rendimiento durante el trazo.
- [ ] Lint rule de reglas de importación entre capas activo en CI (ver §2).
- [ ] `RecoverRoomDraftUseCase`, `BackupDatabaseUseCase`, `RestoreDatabaseUseCase` y `AppError` implementados y cubiertos por tests, no solo especificados.
- [ ] Migrar los 3 casos de `it.todo()` que sí tienen lógica implementable sin hardware (por ejemplo, ninguno de los 7 actuales lo es completamente — los 7 dependen genuinamente de hardware o infraestructura ausente; revisar si alguno cambia de estado al completar el Spike #8).
- [ ] BLE real contra los drivers de referencia documentados (Bosch/Leica, UUIDs en Maestro §10.1) — hoy toda la suite de BLE está mockeada.
- [ ] Ejecutar las 7 pruebas de campo de calibración del Maestro §16 más las 3 adicionales de `estrategia-testing-y-fixtures.md` §1.4 (guantes de trabajo, legibilidad bajo sol directo, captura de punto de control con GPS real) — ninguna bloquea el inicio del Spike #8, pero sí el cierre de la Fase 3 del plan de validación (`plan-validacion-final.md`).
- [ ] Sign-off de code review + documentación completa antes de considerar el build "listo para producción" (Fase 4 de `plan-validacion-final.md`).

## 5. Validación en dispositivo real

El plan de validación final (`plan-validacion-final.md`, escrito en el Spike #6) define cuatro fases: Unit (1 día), Integration (2 días), Field (3 días) y Sign-off (1 día). Las dos primeras ya están cubiertas por este experimento — 208 tests pasando cubren tanto Unit como gran parte de Integration. Lo que queda es exclusivamente la Fase 3, en dispositivo físico:

- **CDT en dispositivo de gama media** — el Maestro Técnico usa un Moto G86 como referencia de rendimiento para medir el tiempo real de triangulación (prueba de campo #2, Maestro §16).
- **Validación funcional en Motorola Edge 50** — el dispositivo Android real disponible para pruebas de la aplicación instalada, cubriendo trazo de muros, captura BLE, fotografía y exportación IFC en condiciones reales de uso, no solo en el simulador de Node/Jest que corrió los 208 tests hasta ahora.
- **BLE real con Huepar** — el caso de campo #2 de `pruebas-campo-10.md` ya tiene lógica de promediado y tolerancia probada con datos sintéticos; falta contrastarla contra ruido real del dispositivo de medición.
- **10 casos de campo completos** — de los 10 documentados en `pruebas-campo-10.md`, 6 ya tienen lógica automatizable cubierta en `FieldScenarios.test.ts`; los 4 restantes (importar a Revit real, force-close en dispositivo, upload de red, battery stress) requieren, por diseño, el dispositivo físico y no se pueden adelantar más sin él.

## 6. Orden recomendado

1. Cerrar los tres UseCases de sistema pendientes (§3) — son la base que todo lo demás asume.
2. Ejecutar el Spike #7 (referencias topográficas) para completar la capa de dominio antes de tocar UI.
3. Ejecutar el Spike #8 (integración React Native), con el lint rule de capas activo desde el primer commit de `screens/`.
4. Instalar el build en el Motorola Edge 50 (y, si está disponible, un Moto G86 u equivalente) y correr la Fase 3 del plan de validación completa.
5. Sign-off y documentación final antes de considerar el MVP v0.1 listo para operarios reales en campo.
