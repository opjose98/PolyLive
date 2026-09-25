# Snapshot: 0.8.0-alpha

**Fecha:** 2026-05-04
**Versión:** 0.8.0-alpha

## Hito Principal: Motor de Elevación de Muros (MEM)

0.8.0 introduce el primer sistema BIM semántico de detallado vertical de LevON. Los muros dejan de ser únicamente entidades de planta para adquirir una dimensión de elevación frontal 2D con openings, cuantificación y edición en panel aislado.

## Arquitectura Vigente

*   **Presentation:** Flutter + Riverpod. `WallElevationPanel` (WEP) como dialog modal aislado del canvas principal. `WallElevationPainter` con `ElevationViewport` para conversión CSL↔canvas.
*   **Application:** `EditWallElevationUseCase` — use case stateless con operaciones puras (CRUD openings, coronación, Chain Mode, sync). `WallCslService` — funciones puras estáticas para transforms world↔CSL, validación de openings (5 reglas) y snap a NMS.
*   **Domain:** `WallElevation` (entidad inmutable con `List.unmodifiable`), `WallOpening` (door/window/opening en CSL), `VerticalLevels` (base=0, coronación configurable), `WallQuantification` (derivada, nunca persistida).
*   **Infrastructure:** `JsonSerializer` extendido con sección `elevations[]` — backwards-compatible. Proyectos sin `elevations[]` cargan sin cambios. Orphaned elevations descartadas silenciosamente.
*   **State:** `WallElevationsNotifier` + `wallElevationsProvider` + `activeElevationWallIdProvider` añadidos a `providers.dart`. `currentProjectSnapshotProvider` incluye `wallElevations`.

## Cambios Importantes

*   **7 nuevos archivos Dart** (domain entity, 2 application services, persistence update, 2 UI files, 1 arch doc).
*   **36 nuevos tests** — 13 en domain entities, 23 en application/use cases + CSL service.
*   **112 tests totales** — 0 regresiones.
*   **JSON schema v2.0** — sección `elevations[]` con tolerancia a ausencia para retrocompatibilidad.
*   **`Project.wallElevations`** — campo añadido con `copyWith` y backward-compat constructor.

## Sistemas MEM implementados

| Subsistema | Sigla | Estado |
|------------|-------|--------|
| Sistema de Coordenadas Local | CSL | ✅ Completo + tests |
| Niveles de Muro Simplificados | NMS | ✅ Completo + tests |
| Huecos y Aperturas | HAP | ✅ Completo + tests |
| Motor de Cuantificación | QE | ✅ Completo + tests |
| Panel de Elevación de Muro | WEP | ✅ UI completa |
| Chain Mode | CM | ✅ Implementado (bridge topology pendiente) |
| Restricciones (Constraints) | — | ✅ `validateOpening` 5 reglas |
| Persistencia elevaciones | — | ✅ JSON backwards-compatible |
| Preparación IFC openings | — | ✅ Semántica preparada |
| Integración en editor_screen | — | ⏳ Pendiente (N-01, N-02, N-03) |

## Métricas de la versión

| Métrica | Valor |
|---------|-------|
| Total archivos Dart | ~61 |
| Líneas de código (estimado) | ~9,500 |
| Cobertura de tests (estimado) | ~35% |
| Providers Riverpod activos | 30 |
| Entidades de dominio | 8 |
| Tests totales | 112 |
| Bugs nuevos abiertos | 3 (N-01, N-02, N-03) |
| Bloqueantes para producción | 11 (8 originales + 3 nuevos) |

## Próximo paso recomendado

Completar la integración del MEM en el flujo del editor:
1. Cablear WEP (N-01)
2. Cargar elevaciones al abrir proyecto (N-02)
3. Exponer adjacency map del TopologyGraph (N-03)
