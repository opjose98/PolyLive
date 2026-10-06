# 23 — Plan MVP desde la auditoría integral (reformulado)

Fecha: 2026-10-06. Base: `AUDITORIA_INTEGRAL_POLYLIVE.md` (commit auditado `6c3ff6b`, nota integral
3,9/10) contrastada con `main` @ `64b4d41` (después de T0, F6a, M2b, M3, M4 y F6b). Objetivo del
usuario: llevar las notas a **≥ 8,5** y dejar el **MVP listo**, mejorando primero lo existente.

Decisiones (2026-10-06):
- **Upgrade de Expo primero que todo** (51 → 57: RN 0.87, nueva arquitectura, Skia 2, Reanimated 4).
- Errores en campo: **registro local + "Enviar diagnóstico"**, sin servicios externos.
- Medida: **cara interior por defecto**, elegible (exterior / eje), convertida al eje con los espesores
  y con registro de qué medida originó cada longitud.
- Entra al MVP: **refactor estructural** y **horizontal / tableta**. Quedan fuera: láser BLE (falta el
  equipo), plugin de Revit (falta Revit), sincronización.

## 1. Estado real de cada hallazgo (auditoría vs. código de hoy)

| Hallazgo (prioridad de la auditoría) | Hoy |
|---|---|
| Uniones persistentes (P0) | ✅ T0: los extremos unidos se mueven juntos, un solo deshacer |
| Recintos múltiples con identidad, área neta (P0) | ✅ T0: tabla `zones`, reconciliación por semilla, área neta y al eje |
| IfcSpace por recinto a cara interior (P0/R24) | ✅ T0 |
| Toggles sin función (P0) | ✅ F6b: snaps, rotación, escala, capas funcionan |
| Modos Avance y Revisión vacíos (R39) | ✅ M3 y M4 |
| IfcMapConversion (P1/R25) | ✅ M2b |
| CSV / KML de coordenadas (P1) | ✅ M2b (importación CSV de estación total también) |
| Fotos en informes (P0, parcial) | 🟡 acta de Revisión con fotos; **no hay registro fotográfico ni exportación de fotos** |
| Herramientas ⬜ (39) | ✅ F6b: todas habilitadas (ninguna atenuada en planta ni alzado) |
| Medida al eje (P0/R02) | ❌ sigue al eje |
| Paquete de proyecto export/import (P0/R01) | ❌ |
| Backup fuera del dispositivo (P0/R01) | ❌ (`documentDirectory`) |
| Migraciones de esquema (P0/R06) | ❌ sin `user_version` |
| BLOB de fotos en cada recarga (P0/R07) | ❌ `listPhotoMarkers` hace `SELECT *` |
| `JSON.parse` sin protección (P0/R13) | ❌ en 7 stores |
| Criterio de aceptación de campo (P0/U17) | ❌ |
| Crash reporting / logs (P1/R11) | ❌ |
| CI, linter (P1/R12) | ❌ |
| Expo 51 / target SDK (P1/R10/R36) | ❌ |
| PDF de plano + cuadro de áreas (P1/R40) | 🟡 PDF de avance y de revisión; **sin plano con rótulo ni cuadro de áreas** |
| EditorController / SurveyScreen monolíticos (P1/R18) | ❌ **crecieron**: 2.119 y 1.558 líneas |
| Registro de tipos de elemento (P1) | ❌ |
| Solo vertical (P1/R30) | ❌ |
| Permisos al arrancar y obsoletos (P1/R31/R32) | ❌ `requestAll()` en `App.tsx` |
| Identidad de operador (P1/R34) | ❌ |
| IFC validado externamente (P1/R27) | 🟡 validado a mano con ifcopenshell (docs/22); falta en CI |
| Export de proyecto en un IFC (P1/R45) | ❌ |
| Tema no persistido (P3) | ❌ |
| `IfcWallStandardCase` deprecado (U14) | ❌ |
| `as unknown as` / `catch {}` | ❌ crecieron: 60 / 29 |

## 2. Plan agrupado y factorizado (orden de ejecución)

Una rama y un PR por bloque. Cada bloque: `tsc` limpio, tests verdes, prueba en teléfono y doc.

### B0 — Plataforma (P1, adelantado por decisión)
Expo 57 + RN 0.87 (nueva arquitectura) + Skia 2 + Reanimated 4 + gesture-handler, expo-sqlite,
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
