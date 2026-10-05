---
name: Revision
description: Observaciones numeradas con marca, comentario, autor, estado y foto; acta PDF (M4).
type: dominio
depends-on: "[[modos-de-trabajo]]"
mentioned-in: "[[estado-y-capitulos]]"
tags: #dominio #M4 #obra
---

# Revisión (M4)

Código: `src/domain/review/review.ts`, `src/application/review/*`, `src/infrastructure/sqlite/ReviewStore.ts`,
`src/ui/workspace/review/*` · Tests: `test/review/review.test.ts`.

- **Marcas:** trazo, flecha, rectángulo, nube y texto; en planta y alzado; cinco colores.
- **Observación:** número que no se reutiliza, comentario, autor, fecha, abierta/resuelta (quién y cuándo) y foto.
- **Acta PDF** con cada vista y sus marcas numeradas, más la tabla; también CSV y compartir.
