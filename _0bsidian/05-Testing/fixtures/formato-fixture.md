---
name: formato-fixture
description: Template y formato estándar para definir fixtures en TypeScript.
type: testing
depends-on: "[[lista-14-fixtures]]"
mentioned-in: "Spike #2-5"
tags: #testing #fixtures #template
---

# Formato Fixture

## Template

```typescript
export const createFixture{Name}(): {Type} {
  return {
    id: generateId(),
    // ... campos requeridos
    // comentario: qué es especial de este fixture
  }
}

// Uso en tests:
const room = createFixtureRoom1()
const wall = createFixtureWall1()
expect(room.area).toBe(12) // 4m × 3m
```

## Convención
- Fixtures nombrados `createFixture{Name}()`
- Retorna objeto completo, inicializado
- Reutilizable en múltiples tests
- Comentarios qué es único del fixture

---

*Creada: 2026-09-15*