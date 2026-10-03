---
name: Avance-de-obra
description: Pintar lo ejecutado por actividad y corte sobre suelos y caras de muro; cuantificación por malla (M3).
type: dominio
depends-on: "[[Suelo]], [[Recintos-con-identidad]]"
mentioned-in: "[[modos-de-trabajo]], [[estado-y-capitulos]]"
tags: #dominio #M3 #obra
---

# Avance de obra (M3)

Código: `src/domain/progress/progress.ts`, `src/application/progress/*`, `src/infrastructure/sqlite/ProgressStore.ts`,
`src/ui/workspace/progress/*` · Tests: `test/progress/*`.

- **Soportes:** suelo (planta, contorno neto) y cara A/B de muro (alzado, perfil sin vanos).
- **Actividades** editables por proyecto y **cortes** por fecha.
- **Herramientas:** pincel, borrador, relleno y rectángulo.
- **Cuantificación por malla de 5 cm:**
  - no cuenta doble;
  - el borrador resta;
  - el acumulado de un corte es inmutable ante cortes posteriores.
- **Reporte:** CSV y PDF (planta coloreada, totales, % por soporte).
