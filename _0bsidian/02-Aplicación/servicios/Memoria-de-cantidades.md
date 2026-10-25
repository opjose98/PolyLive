---
name: Memoria-de-cantidades
description: Memoria de cálculo de cantidades de obra en Excel, con la plantilla del contrato y el avance pintado.
type: aplicación
depends-on: "[[Avance-de-obra]]"
mentioned-in: "docs/28"
tags: #reporte #excel #memoria #M3
---

# Memoria de cantidades (Excel)

La plantilla del contrato (formato GES-FO-118) da solo la **forma**: fuentes, grises, marco, anchos, celdas
combinadas, encabezado, bloque de ítem, tabla con DIMENSIONES, observaciones, TOTAL y firmas. Los valores salen del
avance pintado.

- Una sola hoja vertical: encabezado una vez; un bloque por actividad (un ítem del presupuesto); por cada corte un
  título «CORTE …», una fila por parte ejecutada (suelo: ancho × longitud; muro o columna: alto × longitud) con
  fórmulas, y en el esquema (B–L) los dibujos del elemento con esa actividad y las fotos del corte.
- Encabezado del contrato e ítems de cada actividad: se escriben en la hoja de reporte y se recuerdan por proyecto
  en el teléfono (`native/prefs/prefsFile.ts`).
- El `.xlsx` se escribe sin librería de Excel (`infrastructure/export/xlsx/xlsxWriter.ts`, con `fflate`); los
  dibujos SVG se rasterizan con Skia (`native/export/raster.ts`).

Código: `application/progress/progressMemoria.ts`, `application/progress/progressReport.ts`,
`ui/workspace/progress/useProgressReport.ts`. Test: `test/report/memoria.test.ts`; validación externa con openpyxl
en `scripts/validate_exports.py`.
