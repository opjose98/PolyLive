---
name: Suelo
description: Suelo ligado a un recinto; toma su contorno neto; IfcSlab por suelo (F6a).
type: dominio
depends-on: "[[Recintos-con-identidad]]"
mentioned-in: "[[Avance-de-obra]], [[estado-y-capitulos]]"
tags: #dominio #F6a
---

# Suelo

Código: `src/domain/objects/floor.ts` (`FLOOR_ZONE_PROP`), `src/application/use-cases/CreateFloorUseCase.ts`.

- Herramienta Suelo: toca un recinto y le pone su suelo (uno por recinto).
- No guarda contorno: mover un muro mueve su borde.
- IFC: `IfcSlab` por suelo bajo la cota del piso. Es el soporte del [[Avance-de-obra]] en planta.
