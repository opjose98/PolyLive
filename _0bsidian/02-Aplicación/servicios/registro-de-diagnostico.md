---
name: registro-de-diagnostico
description: Registro local de errores y avisos de la app; "Enviar diagnóstico" lo comparte. Todo fallo que ve el usuario entra por reportFailure.
type: aplicación
depends-on: "[[AppError]]"
mentioned-in: "[[trazabilidad-nota-codigo-test]], [[EditorController]], [[ElevationEditor]]"
tags: #aplicación #diagnóstico #errores
---

# Registro de diagnóstico

Código: `src/shared/diagnostics.ts` (registro en memoria) · `src/native/diagnostics/diagnosticsLog.ts` (archivo rotativo
`diagnostics.jsonl` y "Enviar diagnóstico") · Tests: `test/shared/diagnostics.test.ts`, `test/sqlite/robustness.test.ts`.

- Sin servicios externos: el operador comparte el `.txt` desde Ajustes.
- `reportFailure(origen, err, textoGenérico)` registra el fallo y devuelve el texto del aviso: un `AppError` (esperado)
  va como `warn` y muestra su `userMessage`; cualquier otro va como `error` con su pila y muestra el texto genérico.
- Lo usan el editor de planta y el de alzado (`fail`), la apertura del levantamiento, la galería y las pantallas de
  proyectos, espacio y ajustes (H-46, docs/25 § 6). Antes esos fallos solo se veían como aviso y el diagnóstico no traía
  la causa.
