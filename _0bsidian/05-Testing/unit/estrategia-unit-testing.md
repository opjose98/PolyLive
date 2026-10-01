---
name: estrategia-unit-testing
description: Estrategia de unit testing para cada capa — qué testear, cómo aislar, fixtures.
type: testing
depends-on: "[[tipos-geometricos]], [[RevitObjectBase]], [[CreateWallUseCase]]"
mentioned-in: "Maestro §13, matriz-trazabilidad"
tags: #testing #unit #strategy
---

# Estrategia Unit Testing

## Por capa

### Domain Layer
- Testear: lógica pura (CDT, snap, miter, validación)
- No testear: I/O, persistencia
- Aislar: sin dependencias externas
- Fixtures: puntos, polígonos, geometrías simples

### Infrastructure Layer
- Testear: CRUD, transacciones, FK validation
- Mock: SQLite (con in-memory DB para tests)
- No testear: drivers del OS
- Fixtures: objetos BIM completos

### Application Layer
- Testear: orquestación, secuencias UseCase
- Mock: ObjectStore, Services
- No testear: UI, eventos
- Fixtures: estados pre/post operación

### State + UI Layer
- Testear: mutations, selectors, transformations
- Mock: gestos, respuestas de API
- No testear: renderizado Skia
- Fixtures: canvas states, Zustand snapshots

## Cobertura mínima
- Domain: 100% (lógica crítica)
- Infrastructure: 95% (casos edge)
- Application: 90% (orquestación)
- State: 85% (UI integrations)

---

*Creada: 2026-09-15*