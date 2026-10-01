---
name: auditoria-post-M2
description: Qué se eliminó, qué se corrigió y qué redundancias se conservan a propósito (2026-09-30).
type: referencia
depends-on: ""
mentioned-in: "[[MOC-PolyLive]], [[gestión-estado-Zustand]], [[SiteCoordinateSystem]], [[SurveyControlPoint]], [[CloseRoomUseCase]]"
tags: #referencia #auditoría
---

# Auditoría post-M2

Informe completo: `docs/16-AUDITORIA-POST-M2.md` (PR #10).

## Eliminado (−3.826 líneas)

- Topografía por **sede** (Spike #7): [[SiteCoordinateSystem]], [[SurveyControlPoint]], sus casos de uso,
  comandos (`SimpleCommand`), tablas. Reemplazo: [[Georreferencia-proyecto]], [[Mojones-biblioteca]].
- Borradores del trazo (`polygon_drafts`): cada muro se guarda al trazarlo.
- `appStore` (4 slices): solo se escribía. Ver [[gestión-estado-Zustand]].
- Respaldo/restauración de Node (duplicaban las variantes Expo).
- `ui/theme/tokens.ts`: un solo sistema de diseño ([[sistema-de-diseño]]).
- Edición de niveles/fases en memoria (duplicaba `MarkerStore`).

## Corregido

Edición desde modos que no editan; galería con fotos de otros proyectos; "ver fotos del objeto" sin
conectar; marcadores de foto sin respuesta; Foto inútil en el alzado; promesas sin manejar.

## Redundancias que se quedan

Dos controladores (planta / alzado) con una historia; validación en `MarkerStore` + orden en `rangeModel`;
`GpsCoordinates` vs `GpsFix`; `toLocal` en el borde; recinto derivado fuera del CommandStack.

## Sin usar por la app (decisión pendiente)

[[CloseRoomUseCase]] + CDT: reutilizar en F6a Suelo o borrar.
