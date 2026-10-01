---
name: alcance-nivel-fase
description: Qué objetos ve, calca o pinta como existente el editor según los selectores de nivel y fase.
type: aplicación
depends-on: "[[Niveles-y-fases]], [[Restricciones-verticales]]"
mentioned-in: "[[EditorController]], [[capa-viva-y-camara]]"
tags: #aplicación #niveles #rendimiento
---

# Alcance por nivel y fase

Código: `application/workspace/levelScope.ts` (`levelViewOf`, `editorScopes`, puro) ·
Tests: `test/application/levelScope.test.ts` · Hook: `ui/workspace/useProjectLevels.ts`.

- **Nivel activo**: lo de su nivel, más muros y columnas de otros niveles que **atraviesan el plano de
  corte** (1,20 m sobre el nivel). Puertas y ventanas van con su muro.
- **Calco**: los niveles dentro de [inferior, superior], atenuados.
- **Fases**: se ve lo creado hasta la fase activa; lo anterior, como existente.
- **Rendimiento**: decidir si un muro está en el alcance resuelve su perfil; el editor guarda el resultado
  en caché (`scopeCache`) y lo recalcula solo si cambian los objetos o el alcance. Antes se recalculaba en
  cada consulta (varias por render y en cada toque).
