# LevON

**LevON** es una aplicación profesional enfocada al levantamiento arquitectónico, generación de planos y modelado BIM (Building Information Modeling) ligero, diseñada para operar en campo desde dispositivos móviles (tablets) y sincronizar hacia escritorio.

## Estado del Proyecto
![Version](https://img.shields.io/badge/version-0.8.0--alpha-blue.svg)
![Status](https://img.shields.io/badge/status-Alpha_Interna-orange.svg)
![Tests](https://img.shields.io/badge/tests-112_passing-brightgreen.svg)

El proyecto se encuentra en la etapa **0.8.0-alpha**. Esta versión introduce el **Motor de Elevación de Muros (MEM)**: un sistema BIM semántico de detallado frontal 2D que permite definir openings (puertas, ventanas, huecos), cuantificación neta/bruta en tiempo real y edición en panel aislado (WEP). Las versiones anteriores establecieron la arquitectura base funcional (0.5.0), exportación DXF/IFC de calidad (0.6.1), sistema de unidades y precisión (0.7.1–0.7.2).

## Filosofía Lightweight BIM
A diferencia del software BIM tradicional (masivo, intensivo en CPU y orientado a escritorio), LevON adopta una filosofía **lightweight**:
*   **Offline-first**: Todo el trabajo se guarda y se calcula localmente sin depender de la nube para funciones core.
*   **Topología Dinámica**: Un motor 2D optimizado detecta recintos (rooms) instantáneamente a medida que los muros se cierran.
*   **Interacción Directa**: Diseñado para entrada táctil (con *snapping* y gestos precisos) y manipulación in-situ.
*   **Clean Architecture**: Separación estricta de responsabilidades (Domain, Application, UI, Persistence/Export).

## Stack Tecnológico
*   **Framework:** Flutter
*   **Lenguaje:** Dart
*   **State Management:** Riverpod
*   **Routing:** GoRouter
*   **Matemáticas:** vector_math (para el motor geométrico)

## Plataformas Soportadas
*   **Primaria:** Android (Tablets/Móviles)
*   **Secundaria:** Windows / macOS (Desktop)
*   *(Soporte para iOS y Web en roadmap futuro)*

## Cómo Ejecutar

Asegúrate de tener instalado el SDK de Flutter (>= 3.0.0).

```bash
# Obtener dependencias
flutter pub get

# Ejecutar la aplicación (Android, Windows, etc.)
flutter run
```

## Estructura General

El proyecto está organizado de manera modular, optimizado para el trabajo colaborativo con IA y desarrolladores humanos:

*   `lib/` — Código fuente siguiendo Clean Architecture (domain / application / persistence / export / ui).
    *   `domain/entities/wall_elevation.dart` — Motor de Elevación de Muros (MEM): `WallElevation`, `WallOpening`, `WallQuantification`.
    *   `application/services/wall_csl_service.dart` — Transforms CSL, validación de openings.
    *   `ui/widgets/wall_elevation/` — Panel WEP (Wall Elevation Panel).
*   `test/` — 112 tests unitarios y de widgets.
*   `assets/` — Recursos estáticos, iconos y tipografías.
*   `ARCHITECTURE.md` — Documentación detallada de la arquitectura.
*   `CONTEXT.md` — Contexto persistente del proyecto y filosofía.
*   `RULES.md` — Reglas globales de codificación y arquitectura.
*   `ROADMAP.md` — Roadmap técnico de evolución hacia v1.0.
*   `AUDIT/` — Auditoría técnica completa con snapshots por versión y motor engine docs.
*   `DOCS/architecture/` — Source of truth de subsistemas (MEM_Wall_Elevation_Engine.md).
*   `TASKS/`, `PROMPTS/`, `MEMORY/`, `SNAPSHOTS/` — Estructuras de documentación para gestión modular y RAG.

---
*Propiedad Intelectual Privada - LevON. Prohibida su redistribución sin autorización expresa.*
