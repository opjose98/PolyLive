---
name: Avance-de-obra
description: Pintar lo ejecutado por actividad y corte sobre suelos, caras de muro y columnas; cortes sin duplicados; reportes y memoria (M3).
type: dominio
depends-on: "[[Suelo]], [[Recintos-con-identidad]]"
mentioned-in: "[[modos-de-trabajo]], [[estado-y-capitulos]]"
tags: #dominio #M3 #obra
---

# Avance de obra (M3)

Código: `src/domain/progress/progress.ts`, `src/application/progress/*`, `src/infrastructure/sqlite/ProgressStore.ts`,
`src/ui/workspace/progress/*` · Tests: `test/progress/*`.

- **Soportes:** suelo (planta, contorno neto; un suelo aislado con doble toque), cara A/B de muro (alzado, perfil
  sin vanos) y **columna desdoblada** (perímetro × alto, `column:<id>`).
- **Actividades** editables por proyecto y **cortes** por fecha.
- **Herramientas:** pincel, borrador, relleno y rectángulo.
- **Cuantificación por malla de 5 cm:**
  - no cuenta doble;
  - el borrador resta;
  - **sin duplicados entre cortes (H-87):** lo que una actividad ya ejecutó en un corte no se vuelve a contar con
    la misma actividad en otro (no se guarda y avisa); otra actividad sí; el borrador solo quita lo del corte
    activo, así un corte reportado nunca cambia (`cutCoverages`).
- **Pincel en el hilo UI** (`ui/canvas/liveStroke.ts`): el trazo va pegado al dedo.
- **Fotos de avance (H-90):** quedan en el corte activo, ligadas al elemento tocado y a la actividad
  (`metadata.progress`).
- **Reporte (H-90):** por la vista (todo el espacio o el elemento), cortes y actividades a elegir, elementos sin
  avance, fotos y dibujos; PDF, CSV y [[Memoria-de-cantidades]] en Excel. Ver docs/28.
